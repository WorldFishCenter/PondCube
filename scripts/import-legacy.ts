import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { pond, wqReadings } from "../lib/schema";
import { RANGES } from "../lib/validation";
import { neonTarget, type SyncTarget } from "./sync-airtable";

// One-off import of the legacy water-quality log (Excel, converted by convert_pondcube.py to
// pondcube_observations_wide.csv) into wq_readings. Rows are checked first and written all-or-nothing;
// each reading gets a fixed id, so re-running never duplicates.
// Usage: npm run db:import-legacy -- <pondcube_observations_wide.csv> [--prod]
//
// Decided 2026-10-20 (the log has no times or names):
// - Recorded-at: morning = 08:00, afternoon = 14:00, Penang time.
// - Person: Mahirah Mahmuddin. App version: "legacy" (app records carry the version that saved them).
// - Readings missing dissolved oxygen and/or temperature are kept with blanks; Ranges still apply.
// - The two values in OUT_OF_RANGE_KEPT are kept as recorded; any other out-of-range value stops the import.
const PERSON = "Mahirah Mahmuddin";
const TIME = { morning: "08:00", afternoon: "14:00" } as const;
export const OUT_OF_RANGE_KEPT = [
  "Fish Tank 3|139|2025-07-05|morning|temperature|114",
  "Fish Tank 3|184|2025-07-24|morning|temperature|59.3",
];

const COLUMNS =
  "location,zone,tank_id,tank_id_raw,date,period,dissolved_oxygen,temperature,ph,ammonia,nitrate,nitrite,remarks";
const VALUES = {
  dissolved_oxygen: "dissolvedOxygen",
  temperature: "temperature",
  ph: "ph",
  ammonia: "ammonia",
  nitrate: "nitrate",
  nitrite: "nitrite",
} as const;
type Reading = typeof wqReadings.$inferInsert;

// UUID-shaped id derived from the reading's natural key, so the same row always gets the same id.
const fixedId = (key: string) =>
  createHash("sha256")
    .update(`legacy-wq|${key}`)
    .digest("hex")
    .slice(0, 32)
    .replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12})$/, "$1-$2-5$3-8$4-$5");

/** Checks every row; any problem means nothing can be written. Otherwise returns a summary and the write. */
export async function prepareImport(
  csv: string,
  target: SyncTarget,
): Promise<{ problems: string[] } | { summary: string[]; write: () => Promise<unknown> }> {
  const [header, ...lines] = csv.replace(/\r/g, "").trim().split("\n");
  if (header !== COLUMNS) return { problems: [`unexpected columns: ${header}`] };

  const ponds = new Map(
    (
      await target.db.select({ code: pond.pondCode, location: pond.legacyLocation, tank: pond.legacyTankId }).from(pond)
    ).map((p) => [`${p.location}|${p.tank}`, p.code]),
  );
  const problems: string[] = [];
  const readings: Reading[] = [];
  const kept: string[] = [];
  const seen = new Set<string>();
  let values = 0;

  lines.forEach((line, i) => {
    const r = Object.fromEntries(COLUMNS.split(",").map((c, j) => [c, (line.split(",")[j] ?? "").trim()]));
    const key = `${r.location}|${r.tank_id}|${r.date}|${r.period}`;
    const at = `line ${i + 2} (${key})`;
    const pondCode = ponds.get(`${r.location}|${r.tank_id}`);
    if (!pondCode) problems.push(`${at}: no pond has this legacy location + tank`);
    if (r.period !== "morning" && r.period !== "afternoon") problems.push(`${at}: unknown period`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) problems.push(`${at}: bad date`);
    if (seen.has(key)) problems.push(`${at}: duplicate reading`);
    seen.add(key);

    const reading: Reading = {
      id: fixedId(key),
      pondCode: pondCode ?? "",
      recordedAt: new Date(`${r.date}T${TIME[r.period as keyof typeof TIME]}:00+08:00`),
      period: r.period,
      person: PERSON,
      appVersion: "legacy",
      remarks: r.remarks || null,
    };
    for (const [column, field] of Object.entries(VALUES)) {
      if (r[column] === "") continue;
      const v = Number(r[column]);
      const [min, max] = RANGES[field];
      const exception = `${key}|${column}|${v}`;
      if (Number.isNaN(v)) problems.push(`${at}: ${column} "${r[column]}" is not a number`);
      else if (v < min || v > max) {
        if (OUT_OF_RANGE_KEPT.includes(exception)) kept.push(exception);
        else problems.push(`${at}: ${column} ${v} is outside its Range ${min}–${max}`);
      }
      reading[field] = v;
      values++;
    }
    if (Object.keys(VALUES).every((c) => r[c] === "")) problems.push(`${at}: no values`);
    readings.push(reading);
  });
  if (!readings.length) problems.push("no readings in the file");
  if (problems.length) return { problems };

  const ids = readings.map((r) => r.id!);
  const present = (await target.db.select({ id: wqReadings.id }).from(wqReadings).where(inArray(wqReadings.id, ids)))
    .length;
  if (present === readings.length) return { summary: ["Already imported: nothing to do."], write: async () => {} };
  if (present)
    return {
      problems: [`${present} of ${readings.length} readings are already in the database; refusing a partial re-import`],
    };

  const dates = readings.map((r) => r.recordedAt.toISOString().slice(0, 10)).sort();
  const summary = [
    `${readings.length} water-quality readings (${values} values) for ${new Set(readings.map((r) => r.pondCode)).size} ponds, ${dates[0]} → ${dates.at(-1)}`,
    `Out-of-range values kept as recorded: ${kept.join("; ") || "none"}`,
  ];
  // Chunked to stay under Postgres' parameter limit; still one all-or-nothing write.
  const write = () =>
    target.writeAll((db) => {
      const inserts: BatchItem<"pg">[] = [];
      for (let i = 0; i < readings.length; i += 1000)
        inserts.push(db.insert(wqReadings).values(readings.slice(i, i + 1000)));
      return inserts;
    });
  return { summary, write };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: npm run db:import-legacy -- <pondcube_observations_wide.csv> [--prod]");
  const result = await prepareImport(readFileSync(file, "utf8"), neonTarget(args.includes("--prod")));
  if ("problems" in result) throw new Error(`Nothing written:\n- ${result.problems.join("\n- ")}`);
  console.log(result.summary.join("\n"));
  await result.write();
  console.log("Done.");
}

if (require.main === module)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
