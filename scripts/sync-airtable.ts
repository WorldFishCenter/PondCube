import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, eq, getTableColumns, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgColumn, PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { normaliseEmail } from "../lib/operators";
import { feed, pond, operators, site, species } from "../lib/schema";

// Airtable is where people edit sites, species, feeds, ponds and operators; this copies them one way into Neon.
// Every row is checked first and nothing is written unless all pass. The write is all-or-nothing:
// upsert, then retire ponds / feeds / deactivate operators no longer in Airtable. Nothing is deleted,
// since records reference them. Usage: npm run db:sync [-- --prod]  (or db:sync-ponds / -operators)
const BASE_ID = "appPU5BJLdsjbn49o"; // PondCube base

type Fields = Record<string, unknown>;
/** Each row carries its Airtable record `id`: ponds, operators and feeds link to sites and species by it. */
export type AirtableRows = {
  sites?: Fields[];
  species?: Fields[];
  feeds?: Fields[];
  ponds?: Fields[];
  operators?: Fields[];
};
type Site = typeof site.$inferInsert;
type Species = typeof species.$inferInsert;
type Feed = typeof feed.$inferInsert;
type Pond = typeof pond.$inferInsert;
type Operator = typeof operators.$inferInsert;
type SyncPlan = { sites?: Site[]; species?: Species[]; feeds?: Feed[]; ponds?: Pond[]; operators?: Operator[] };
type Db = PgDatabase<PgQueryResultHKT>;

/** The seam to the database: reads, plus one all-or-nothing write. Adapters: Neon batch (main), PGLite transaction (check-sync). */
export type SyncTarget = { db: Db; writeAll: (build: (db: Db) => BatchItem<"pg">[]) => Promise<unknown> };

/**
 * Checks every Airtable row. Any problem means nothing can be written; otherwise returns what will
 * change and the write that applies all of it, all-or-nothing.
 */
export async function prepareSync(
  rows: AirtableRows,
  target: SyncTarget,
): Promise<{ problems: string[] } | { summary: string[]; write: () => Promise<unknown> }> {
  const { plan, problems } = planSync(rows);
  if (problems.length) return { problems };
  return {
    summary: await describeSync(target.db, plan),
    write: () => target.writeAll((db) => syncQueries(db, plan)),
  };
}

// Airtable enforces neither types nor uniqueness, so every cell is checked here.
const text = z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string());
const required = text.pipe(z.string().min(1, "is empty"));
const optional = text.transform((s) => s || null);
const number = optional.pipe(z.coerce.number<string>({ error: "is not a number" }).nullable());
const wholeNumber = number.pipe(z.number().int("is not a whole number").nullable());
const date = optional.pipe(z.iso.date({ error: "is not a date (YYYY-MM-DD)" }).nullable());
const POND_CODE = /^[A-Z]{3}-[A-Z0-9]{3}-\d{3}$/;
const SPECIES = /^[A-Z]{2}$/;
const SITE = /^[A-Z]{3}$/;
const upper = text.transform((s) => s.toUpperCase());
const siteLinks = z.array(z.string().regex(SITE, "should link to rows of sites")).default([]);

const siteRow = z
  .object({
    id: z.string(),
    site: upper.pipe(z.string().regex(SITE, "should be three letters, e.g. PEN")),
    name_site: required,
    owner_site: optional,
    phone_site: optional,
    email_site: optional,
    lat_site: number,
    long_site: number,
    note_site: optional,
  })
  .transform((r) => ({
    id: r.id,
    row: {
      site: r.site,
      nameSite: r.name_site,
      ownerSite: r.owner_site,
      phoneSite: r.phone_site,
      emailSite: r.email_site,
      latSite: r.lat_site,
      longSite: r.long_site,
      noteSite: r.note_site,
    } satisfies Site,
  }));

const speciesRow = z
  .object({
    id: z.string(),
    species: upper.pipe(z.string().regex(SPECIES, "should be two letters, e.g. ON")),
    species_latin: required,
    species_common: optional,
  })
  .transform((r) => ({
    id: r.id,
    row: { species: r.species, speciesLatin: r.species_latin, speciesCommon: r.species_common } satisfies Species,
  }));

const pondRow = z
  .object({
    pond_code: upper.pipe(z.string().regex(POND_CODE, "should look like PEN-FT3-091")),
    display_name: required,
    site: required.pipe(z.string().regex(SITE, "should link to one row of sites")),
    area: required,
    area_code: required,
    zone: required,
    unit_type: required,
    legacy_location: optional,
    legacy_tank_id: wholeNumber,
    lat_pond: number,
    long_pond: number,
    volume_m3: number,
    area_pond: number,
    depth_m: number,
    water_source: optional,
    species: optional.pipe(z.string().regex(SPECIES, "should link to one row of species").nullable()),
    status: text.transform((s) => s.toLowerCase() || "active"), // the app lists only "active" ponds
    commissioned_date: date,
    note_pond: optional,
  })
  .transform((r): Pond => ({
    pondCode: r.pond_code,
    displayName: r.display_name,
    site: r.site,
    area: r.area,
    areaCode: r.area_code,
    zone: r.zone,
    unitType: r.unit_type,
    legacyLocation: r.legacy_location,
    legacyTankId: r.legacy_tank_id,
    latPond: r.lat_pond,
    longPond: r.long_pond,
    volumeM3: r.volume_m3,
    areaPond: r.area_pond,
    depthM: r.depth_m,
    waterSource: r.water_source,
    species: r.species,
    status: r.status,
    commissionedDate: r.commissioned_date,
    notePond: r.note_pond,
  }));

const email = text
  .transform((s) => normaliseEmail(s) || null)
  .pipe(z.email({ error: "is not an email address" }).nullable());
const operatorRow = z
  .object({
    name: required,
    email,
    active: z.boolean({ error: "should be a checkbox" }).default(false), // unticked = omitted
    site: siteLinks,
  })
  .transform(({ site, ...o }): Operator => ({ ...o, sites: site }));

const feedRow = z
  .object({
    feed: text.pipe(z.string().length(3, "should be three characters (DMS FEED), e.g. SUP")),
    note_feed: optional,
    site: siteLinks,
  })
  .transform((r): Feed => ({ feed: r.feed, noteFeed: r.note_feed, sites: r.site }));

// Links arrive as lists of record ids; unknown ones become "?" and fail their row's check.
const resolve = (codes: Map<string, string>, v: unknown) =>
  Array.isArray(v) ? v.map((id) => codes.get(String(id)) ?? "?") : v;
// A field that links to one row: several links become "?" too.
const linkOne = (codes: Map<string, string>, v: unknown) => {
  const found = resolve(codes, v);
  if (!Array.isArray(found)) return found;
  return found.length > 1 ? "?" : found[0];
};
/** Checks a table other rows link to (its code is in field `key`); returns its rows and record id → code. */
function checkLinked<T>(
  table: string,
  key: string,
  rows: Fields[] | undefined,
  schema: z.ZodType<{ id: string; row: T }>,
  code: (row: T) => string,
  problems: string[],
) {
  const checked = rows ? checkRows(table, key, rows, schema, (s) => code(s.row), problems) : [];
  const codes = new Map(checked.map((s) => [s.id, code(s.row)]));
  return { rows: rows && checked.map((s) => s.row), codes };
}

function planSync(rows: AirtableRows): { plan: SyncPlan; problems: string[] } {
  const problems: string[] = [];
  const sites = checkLinked("sites", "site", rows.sites, siteRow, (s) => s.site, problems);
  const species = checkLinked("species", "species", rows.species, speciesRow, (s) => s.species, problems);
  const plan: SyncPlan = { sites: sites.rows, species: species.rows };
  const linkSites = (rows: Fields[]) =>
    rows.map((r) => ("site" in r ? { ...r, site: resolve(sites.codes, r.site) } : r));
  if (rows.feeds) plan.feeds = checkRows("feeds", "feed", linkSites(rows.feeds), feedRow, (f) => f.feed, problems);
  if (rows.ponds) {
    const ponds = rows.ponds.map((p) => ({
      ...p,
      ...("site" in p ? { site: linkOne(sites.codes, p.site) } : {}),
      ...("species" in p ? { species: linkOne(species.codes, p.species) } : {}),
    }));
    plan.ponds = checkRows("ponds", "pond_code", ponds, pondRow, (p) => p.pondCode, problems);
    if (!plan.ponds.length) problems.push("ponds: Airtable returned none; refusing to retire every pond");
  }
  if (rows.operators) {
    const ops = linkSites(rows.operators);
    plan.operators = checkRows("operators", "name", ops, operatorRow, (o) => o.name.toLowerCase(), problems);
    if (!plan.operators.some((o) => o.active))
      problems.push(
        "operators: none would be active (was the `active` column renamed?); refusing to empty the operator list",
      );
    // An active operator with no site would see no ponds.
    for (const o of plan.operators) if (o.active && !o.sites?.length) problems.push(`operators: ${o.name} has no site`);
    // One account signs in as one operator.
    const emails = new Map<string, string>();
    for (const o of plan.operators) {
      if (!o.email) continue;
      if (emails.has(o.email)) problems.push(`operators: ${o.name} has the same email as ${emails.get(o.email)}`);
      else emails.set(o.email, o.name);
    }
  }
  return { plan, problems };
}

function checkRows<T>(
  table: string,
  labelField: string,
  rows: Fields[],
  schema: z.ZodType<T>,
  key: (row: T) => string,
  problems: string[],
): T[] {
  const ok: T[] = [];
  const seen = new Map<string, string>();
  rows.forEach((fields, i) => {
    if (!Object.keys(fields).some((k) => k !== "id")) return; // Airtable's blank rows (linked tables carry an id)
    const label = `${table} row ${i + 1}${fields[labelField] ? ` (${String(fields[labelField]).trim()})` : ""}`;
    const parsed = schema.safeParse(fields);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push(`${label}: ${issue.path.join(".")} ${issue.message}`);
      return;
    }
    const k = key(parsed.data);
    if (seen.has(k)) problems.push(`${label}: duplicate of ${seen.get(k)}`);
    else seen.set(k, label);
    ok.push(parsed.data);
  });
  return ok;
}

async function describeSync(db: Db, plan: SyncPlan): Promise<string[]> {
  const lines: string[] = [];
  if (plan.ponds) {
    const existing = await db.select({ code: pond.pondCode, status: pond.status }).from(pond);
    const incoming = new Set(plan.ponds.map((p) => p.pondCode));
    const known = new Set(existing.map((e) => e.code));
    const added = plan.ponds.filter((p) => !known.has(p.pondCode)).length;
    const retired = existing.filter((e) => !incoming.has(e.code) && e.status !== "retired").map((e) => e.code);
    lines.push(
      `Ponds: ${plan.ponds.length} in Airtable → ${added} new, ${plan.ponds.length - added} updated, ${retired.length} retired${retired.length ? ` (${retired.join(", ")})` : ""}`,
    );
  }
  if (plan.operators) {
    const existing = await db.select({ name: operators.name, active: operators.active }).from(operators);
    const incoming = new Set(plan.operators.map((o) => o.name));
    const known = new Set(existing.map((e) => e.name));
    const added = plan.operators.filter((o) => !known.has(o.name)).length;
    const gone = existing.filter((e) => e.active && !incoming.has(e.name)).map((e) => e.name);
    const active = plan.operators.filter((o) => o.active).length;
    lines.push(
      `Operators: ${plan.operators.length} in Airtable (${active} active) → ${added} new, ${gone.length} deactivated${gone.length ? ` (${gone.join(", ")})` : ""}`,
    );
  }
  // Tables that are only upserted: how many rows are new.
  const upserted = async <T>(
    label: string,
    table: PgTable,
    code: PgColumn,
    rows: T[] | undefined,
    key: (r: T) => string,
  ) => {
    if (!rows) return;
    const known = new Set((await db.select({ code }).from(table)).map((k) => k.code));
    const added = rows.filter((r) => !known.has(key(r))).length;
    lines.push(`${label}: ${rows.length} in Airtable → ${added} new, ${rows.length - added} updated`);
  };
  await upserted("Sites", site, site.site, plan.sites, (s) => s.site);
  await upserted("Species", species, species.species, plan.species, (s) => s.species);
  await upserted("Feeds", feed, feed.feed, plan.feeds, (f) => f.feed);
  return lines;
}

function syncQueries(db: Db, plan: SyncPlan): BatchItem<"pg">[] {
  const queries: BatchItem<"pg">[] = [];
  // Insert each row, or update the one with the same `key`.
  const upsert = (table: PgTable, key: PgColumn, rows: object[]) =>
    db
      .insert(table)
      .values(rows)
      .onConflictDoUpdate({ target: key, set: excluded(table, rows[0]) });
  // Before ponds and operators, which reference them. Never removed: ponds and records keep them.
  if (plan.sites?.length) queries.push(upsert(site, site.site, plan.sites));
  if (plan.species?.length) queries.push(upsert(species, species.species, plan.species));
  if (plan.feeds) {
    if (plan.feeds.length) queries.push(upsert(feed, feed.feed, plan.feeds));
    // Removed from Airtable: offered nowhere, kept for the records that reference it.
    const codes = plan.feeds.map((f) => f.feed);
    queries.push(db.update(feed).set({ sites: [] }).where(notInArray(feed.feed, codes)));
  }
  if (plan.ponds) {
    const codes = plan.ponds.map((p) => p.pondCode);
    queries.push(
      upsert(pond, pond.pondCode, plan.ponds),
      // Removed from Airtable: hidden from the app, kept for the records that reference it.
      db
        .update(pond)
        .set({ status: "retired" })
        .where(and(notInArray(pond.pondCode, codes), ne(pond.status, "retired"))),
    );
  }
  if (plan.operators) {
    const names = plan.operators.map((o) => o.name);
    queries.push(
      // Emails move between operators (a rename, a hand-over): free them all; the upsert sets them again.
      db.update(operators).set({ email: null }).where(isNotNull(operators.email)),
      upsert(operators, operators.name, plan.operators),
      // Removed or renamed in Airtable: can no longer sign in; past records keep the name.
      db
        .update(operators)
        .set({ active: false })
        .where(and(eq(operators.active, true), notInArray(operators.name, names))),
    );
  }
  return queries;
}

// ON CONFLICT ... DO UPDATE SET col = excluded.col, for the columns a row carries.
const excluded = (table: PgTable, row: object) => {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  return Object.fromEntries(Object.keys(row).map((k) => [k, sql.raw(`excluded."${cols[k].name}"`)]));
};

/** Each row's fields, plus its record `id`. */
async function fetchTable(table: string): Promise<Fields[]> {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY not set");
  const rows: Fields[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as { records: { id: string; fields: Fields }[]; offset?: string };
    rows.push(...page.records.map((r) => ({ ...r.fields, id: r.id })));
    offset = page.offset;
  } while (offset);
  return rows;
}

/** DATABASE_URL, or DATABASE_URL_PROD only with --prod: production is never written by accident. */
export function neonTarget(prod: boolean): SyncTarget {
  const url = prod ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL;
  if (!url) throw new Error(`${prod ? "DATABASE_URL_PROD" : "DATABASE_URL"} not set`);
  const host = (u: string | undefined) => (u ? new URL(u).hostname : undefined);
  if (!prod && host(url) === host(process.env.DATABASE_URL_PROD))
    throw new Error("DATABASE_URL is the production database; run with --prod to write there.");
  console.log(`Target: ${prod ? "PRODUCTION" : "development"} database (${host(url)})`);
  const db = drizzle(neon(url));
  return {
    db,
    writeAll: (build) => {
      const [first, ...rest] = build(db);
      return db.batch([first, ...rest]); // one round trip, run as a transaction
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const only = args.find((a) => !a.startsWith("--"));
  if (only && only !== "ponds" && only !== "operators")
    throw new Error(`Unknown table "${only}". Use: ponds, operators`);

  const target = neonTarget(prod);
  const [siteRows, speciesRows, feeds, ponds, ops] = await Promise.all([
    fetchTable("sites"), // ponds, operators and feeds link to sites
    only === "operators" ? undefined : fetchTable("species"),
    only ? undefined : fetchTable("feeds"),
    only === "operators" ? undefined : fetchTable("ponds"),
    only === "ponds" ? undefined : fetchTable("operators"),
  ]);
  const sync = await prepareSync({ sites: siteRows, species: speciesRows, feeds, ponds, operators: ops }, target);
  if ("problems" in sync)
    throw new Error(`Nothing written. Fix these in Airtable, then re-run:\n- ${sync.problems.join("\n- ")}`);
  console.log(sync.summary.join("\n"));
  await sync.write();
  console.log("Done.");
}

if (require.main === module)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
