import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, eq, getTableColumns, ne, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { assets, operators } from "../lib/schema";

// Airtable is where people edit ponds and operators; this copies both one way into Neon.
// Every row is checked first and nothing is written unless all pass. The write is all-or-nothing:
// upsert, then retire ponds / deactivate operators no longer in Airtable. Nothing is deleted,
// since records reference both. Usage: npm run db:sync [-- --prod]  (or db:sync-ponds / -operators)
const BASE_ID = "appPU5BJLdsjbn49o"; // PondCube base

type Fields = Record<string, unknown>;
export type AirtableRows = { ponds?: Fields[]; operators?: Fields[] };
type Pond = typeof assets.$inferInsert;
type Operator = typeof operators.$inferInsert;
export type SyncPlan = { ponds?: Pond[]; operators?: Operator[] };

// Airtable enforces neither types nor uniqueness, so every cell is checked here.
const text = z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string());
const required = text.pipe(z.string().min(1, "is empty"));
const optional = text.transform((s) => s || null);
const number = optional.pipe(z.coerce.number<string>({ error: "is not a number" }).nullable());
const wholeNumber = number.pipe(z.number().int("is not a whole number").nullable());
const date = optional.pipe(z.iso.date({ error: "is not a date (YYYY-MM-DD)" }).nullable());
const POND_CODE = /^[A-Z]{3}-[A-Z0-9]{3}-\d{3}$/;

const pondRow = z
  .object({
    pond_code: text.transform((s) => s.toUpperCase()).pipe(z.string().regex(POND_CODE, "should look like PEN-FT3-091")),
    display_name: required,
    site: required,
    site_code: required,
    area: required,
    area_code: required,
    zone: required,
    unit_type: required,
    legacy_location: optional,
    legacy_tank_id: wholeNumber,
    latitude: number,
    longitude: number,
    volume_m3: number,
    surface_area_m2: number,
    depth_m: number,
    water_source: optional,
    species_strain: optional,
    status: text.transform((s) => s.toLowerCase() || "active"), // the app lists only "active" ponds
    commissioned_date: date,
    notes: optional,
  })
  .transform((r): Pond => ({
    pondCode: r.pond_code,
    displayName: r.display_name,
    site: r.site,
    siteCode: r.site_code,
    area: r.area,
    areaCode: r.area_code,
    zone: r.zone,
    unitType: r.unit_type,
    legacyLocation: r.legacy_location,
    legacyTankId: r.legacy_tank_id,
    latitude: r.latitude,
    longitude: r.longitude,
    volumeM3: r.volume_m3,
    surfaceAreaM2: r.surface_area_m2,
    depthM: r.depth_m,
    waterSource: r.water_source,
    speciesStrain: r.species_strain,
    status: r.status,
    commissionedDate: r.commissioned_date,
    notes: r.notes,
  }));

const email = text
  .transform((s) => s.toLowerCase() || null)
  .pipe(z.email({ error: "is not an email address" }).nullable());
const operatorRow = z.object({
  name: required,
  email,
  active: z.boolean({ error: "should be a checkbox" }).default(false), // unticked = omitted
});

/** Checks every Airtable row; any problem means nothing should be written. */
export function planSync(rows: AirtableRows): { plan: SyncPlan; problems: string[] } {
  const problems: string[] = [];
  const plan: SyncPlan = {};
  if (rows.ponds) {
    plan.ponds = checkRows("ponds", "pond_code", rows.ponds, pondRow, (p) => p.pondCode, problems);
    if (!plan.ponds.length) problems.push("ponds: Airtable returned none; refusing to retire every pond");
  }
  if (rows.operators) {
    plan.operators = checkRows("operators", "name", rows.operators, operatorRow, (o) => o.name.toLowerCase(), problems);
    if (!plan.operators.some((o) => o.active))
      problems.push(
        "operators: none would be active (was the `active` column renamed?); refusing to empty the operator list",
      );
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
    if (!Object.keys(fields).length) return; // Airtable's blank rows
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

type Db = PgDatabase<PgQueryResultHKT>;

/** What a sync would change, for the log before writing. */
export async function describeSync(db: Db, plan: SyncPlan): Promise<string[]> {
  const lines: string[] = [];
  if (plan.ponds) {
    const existing = await db.select({ code: assets.pondCode, status: assets.status }).from(assets);
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
  return lines;
}

/** The plan's writes; run them all-or-nothing (Neon batch in main, a transaction in check-sync). */
export function syncQueries(db: Db, plan: SyncPlan): BatchItem<"pg">[] {
  const queries: BatchItem<"pg">[] = [];
  if (plan.ponds) {
    const codes = plan.ponds.map((p) => p.pondCode);
    queries.push(
      db
        .insert(assets)
        .values(plan.ponds)
        .onConflictDoUpdate({ target: assets.pondCode, set: excluded(assets, plan.ponds[0]) }),
      // Removed from Airtable: hidden from the app, kept for the records that reference it.
      db
        .update(assets)
        .set({ status: "retired" })
        .where(and(notInArray(assets.pondCode, codes), ne(assets.status, "retired"))),
    );
  }
  if (plan.operators) {
    const names = plan.operators.map((o) => o.name);
    queries.push(
      db
        .insert(operators)
        .values(plan.operators)
        .onConflictDoUpdate({ target: operators.name, set: excluded(operators, plan.operators[0]) }),
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
    const page = (await res.json()) as { records: { fields: Fields }[]; offset?: string };
    rows.push(...page.records.map((r) => r.fields));
    offset = page.offset;
  } while (offset);
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const only = args.find((a) => !a.startsWith("--"));
  if (only && only !== "ponds" && only !== "operators")
    throw new Error(`Unknown table "${only}". Use: ponds, operators`);

  // Production only on purpose: --prod targets DATABASE_URL_PROD, and DATABASE_URL may not point there.
  const url = prod ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL;
  if (!url) throw new Error(`${prod ? "DATABASE_URL_PROD" : "DATABASE_URL"} not set`);
  const host = (u: string | undefined) => (u ? new URL(u).hostname : undefined);
  if (!prod && host(url) === host(process.env.DATABASE_URL_PROD))
    throw new Error("DATABASE_URL is the production database; run with --prod to write there.");
  console.log(`Target: ${prod ? "PRODUCTION" : "development"} database (${host(url)})`);

  const [ponds, ops] = await Promise.all([
    only === "operators" ? undefined : fetchTable("ponds"),
    only === "ponds" ? undefined : fetchTable("operators"),
  ]);
  const { plan, problems } = planSync({ ponds, operators: ops });
  if (problems.length)
    throw new Error(`Nothing written. Fix these in Airtable, then re-run:\n- ${problems.join("\n- ")}`);

  const db = drizzle(neon(url));
  console.log((await describeSync(db, plan)).join("\n"));
  const [first, ...rest] = syncQueries(db, plan);
  await db.batch([first, ...rest]);
  console.log("Done.");
}

if (require.main === module)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
