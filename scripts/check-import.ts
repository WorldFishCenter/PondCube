// Legacy import self-check (scripts/import-legacy.ts) against in-memory Postgres (PGLite). Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { prepareImport } from "./import-legacy";
import type { SyncTarget } from "./sync-airtable";

const HEADER =
  "location,zone,tank_id,tank_id_raw,date,period,dissolved_oxygen,temperature,ph,ammonia,nitrate,nitrite,remarks";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n") + "\r\n"; // the converter writes CRLF
const ROWS = [
  "Fish Tank 1,Fish Tanks,1,1,2025-07-02,afternoon,5.5,29.1,,,,,",
  "Aqua,Aqua,3,3,2025-07-10,morning,,,6.38,0.16,6.8,0.44,", // chemistry only
  "Fish Tank 3,Fish Tanks,139,139,2025-07-05,morning,,114.0,,,,,", // out of Range, on the kept list
];

async function main() {
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }
  const pond = (pondCode: string, legacyLocation: string, legacyTankId: number) => ({
    pondCode,
    legacyLocation,
    legacyTankId,
    displayName: pondCode,
    site: "Penang HQ",
    siteCode: "PEN",
    area: legacyLocation,
    areaCode: "X",
    zone: legacyLocation,
    unitType: "tank",
  });
  await db
    .insert(schema.assets)
    .values([
      pond("PEN-FT1-001", "Fish Tank 1", 1),
      pond("PEN-AQU-003", "Aqua", 3),
      pond("PEN-FT3-139", "Fish Tank 3", 139),
    ]);
  const target: SyncTarget = {
    db,
    writeAll: (build) =>
      db.transaction(async (tx) => {
        for (const query of build(tx)) await query;
      }),
  };
  const problems = async (text: string) => {
    const result = await prepareImport(text, target);
    return "problems" in result ? result.problems.join("\n") : "";
  };

  // Anything wrong: nothing is written.
  assert.match(await problems("location,tank\nAqua,3"), /unexpected columns/);
  assert.match(await problems(csv("Fish Tank 1,Fish Tanks,999,999,2025-07-02,morning,5.5,29,,,,,")), /no pond/);
  assert.match(
    await problems(csv("Fish Tank 1,Fish Tanks,1,1,2025-07-03,morning,25,29,,,,,")),
    /dissolved_oxygen 25 is outside/,
  );
  assert.match(await problems(csv("Fish Tank 1,Fish Tanks,1,1,2025-07-03,morning,abc,29,,,,,")), /not a number/);
  assert.match(await problems(csv(ROWS[0], ROWS[0])), /duplicate reading/);
  assert.equal((await db.select().from(schema.wqReadings)).length, 0);

  // A clean file imports whole.
  const first = await prepareImport(csv(...ROWS), target);
  assert.ok("write" in first);
  assert.match(first.summary[0], /3 water-quality readings \(7 values\) for 3 ponds/);
  assert.match(first.summary[1], /Fish Tank 3\|139\|2025-07-05\|morning\|temperature\|114/);
  await first.write();
  const byPond = async (code: string) =>
    (await db.select().from(schema.wqReadings).where(eq(schema.wqReadings.pondCode, code)))[0];
  const ft1 = await byPond("PEN-FT1-001");
  assert.equal(ft1.recordedAt.toISOString(), "2025-07-02T06:00:00.000Z", "afternoon = 14:00 Penang time");
  assert.equal(ft1.enumerator, "Mahirah Mahmuddin");
  assert.equal(ft1.appVersion, "legacy");
  const aqua = await byPond("PEN-AQU-003");
  assert.equal(aqua.recordedAt.toISOString(), "2025-07-10T00:00:00.000Z", "morning = 08:00 Penang time");
  assert.equal(aqua.dissolvedOxygen, null, "a blank stays blank, never 0");
  assert.equal(aqua.nitrite, 0.44);
  assert.equal((await byPond("PEN-FT3-139")).temperature, 114, "kept as recorded");

  // Re-running never duplicates; a file that's only partly imported is refused.
  const again = await prepareImport(csv(...ROWS), target);
  assert.ok("summary" in again && /Already imported/.test(again.summary[0]));
  assert.match(
    await problems(csv(...ROWS, "Fish Tank 1,Fish Tanks,1,1,2025-07-03,morning,6,29,,,,,")),
    /refusing a partial/,
  );
  assert.equal((await db.select().from(schema.wqReadings)).length, 3);

  await client.close();
  console.log("legacy import OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
