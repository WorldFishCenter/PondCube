import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, eq, getTableColumns, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgTable } from "drizzle-orm/pg-core";
import { assets, operators } from "../lib/schema";

// Airtable is where people edit ponds and operators; this copies both one way into Neon.
// Re-running updates changed rows (upsert). Nothing is deleted from Neon, since records reference
// it: ponds removed in Airtable stay as they were; operators removed or renamed are deactivated.
const BASE_ID = "appPU5BJLdsjbn49o"; // PondCube base

type Fields = Record<string, unknown>;

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

// Airtable omits empty cells; text cells may carry stray whitespace.
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const strOrNull = (v: unknown) => str(v) || null;
const numOrNull = (v: unknown) => (str(v) === "" ? null : Number(v));

// ON CONFLICT ... DO UPDATE SET col = excluded.col, for the columns a seed row carries.
const excluded = (table: PgTable, row: object) => {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  return Object.fromEntries(Object.keys(row).map((k) => [k, sql.raw(`excluded."${cols[k].name}"`)]));
};

type Db = ReturnType<typeof drizzle>;

async function syncPonds(db: Db) {
  const assetRows = (await fetchTable("ponds"))
    .filter((r) => str(r.pond_code))
    .map((r) => ({
      pondCode: str(r.pond_code),
      displayName: str(r.display_name),
      site: str(r.site),
      siteCode: str(r.site_code),
      area: str(r.area),
      areaCode: str(r.area_code),
      zone: str(r.zone),
      unitType: str(r.unit_type),
      legacyLocation: strOrNull(r.legacy_location),
      legacyTankId: numOrNull(r.legacy_tank_id),
      latitude: numOrNull(r.latitude),
      longitude: numOrNull(r.longitude),
      volumeM3: numOrNull(r.volume_m3),
      surfaceAreaM2: numOrNull(r.surface_area_m2),
      depthM: numOrNull(r.depth_m),
      waterSource: strOrNull(r.water_source),
      speciesStrain: strOrNull(r.species_strain),
      status: str(r.status) || "active",
      commissionedDate: strOrNull(r.commissioned_date),
      notes: strOrNull(r.notes),
    }));
  for (let i = 0; i < assetRows.length; i += 200) {
    const batch = assetRows.slice(i, i + 200);
    await db
      .insert(assets)
      .values(batch)
      .onConflictDoUpdate({ target: assets.pondCode, set: excluded(assets, batch[0]) });
  }
  console.log(`Synced ${assetRows.length} ponds.`);
}

async function syncOperators(db: Db) {
  const opRows = (await fetchTable("operators"))
    .filter((r) => str(r.name))
    .map((r) => ({ name: str(r.name), active: r.active === true }));
  if (!opRows.length) {
    console.log("No operators in Airtable; left Neon unchanged.");
    return;
  }
  await db
    .insert(operators)
    .values(opRows)
    .onConflictDoUpdate({ target: operators.name, set: excluded(operators, opRows[0]) });
  // Airtable is the full list: anyone no longer there (deleted or renamed) leaves the pick-list.
  // Deactivated, not deleted, so past records keep a known name.
  const retired = await db
    .update(operators)
    .set({ active: false })
    .where(
      and(
        eq(operators.active, true),
        notInArray(
          operators.name,
          opRows.map((r) => r.name),
        ),
      ),
    )
    .returning({ name: operators.name });
  console.log(
    `Synced ${opRows.length} operators.${retired.length ? ` Deactivated (not in Airtable): ${retired.map((r) => r.name).join(", ")}.` : ""}`,
  );
}

// `tsx scripts/sync-airtable.ts [ponds|operators]`: one table, or all of them with no argument.
// Ponds go first: they're what records reference.
const SYNCS = { ponds: syncPonds, operators: syncOperators };

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const only = process.argv[2];
  if (only && !(only in SYNCS)) throw new Error(`Unknown table "${only}". Use: ${Object.keys(SYNCS).join(", ")}`);
  const db = drizzle(neon(process.env.DATABASE_URL));
  for (const [table, sync] of Object.entries(SYNCS)) if (!only || only === table) await sync(db);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
