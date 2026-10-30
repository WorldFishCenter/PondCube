// Water-quality download self-check (lib/workbook.ts): a month built from in-memory Postgres (PGLite) through the
// reader, opened with openpyxl (needs python3 with openpyxl, or uv), against the agreed sample when it's next to the
// repo (../PondCube PEN 2025-07 sample.xlsx). Run: npm run check
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { readRows } from "../lib/export";
import { waterQualityWorkbook } from "../lib/workbook";

const SAMPLE = join(__dirname, "../../PondCube PEN 2025-07 sample.xlsx");
const AREAS: Record<string, string> = {
  HAT: "Hatchery",
  FT1: "Fish Tank 1",
  FT2: "Fish Tank 2",
  FT3: "Fish Tank 3",
  BLK: "Block L",
  WST: "Water Storage",
  AQU: "Aqua",
  PND: "Pond",
};
const TABS = ["About", "Readings", ...Object.values(AREAS), "Tank averages", "Daily averages"];

type Cell = [
  kind: string,
  value: string | number | null,
  format: string,
  fill: string,
  bold: boolean,
  comment: string | null,
];
type Sheet = { name: string; freeze: string | null; merges: number; tables: string[][]; rows: Cell[][] };
// openpyxl, as people's tools read the file; uv fetches it once when python3 doesn't have it.
const python =
  spawnSync("python3", ["-c", "import openpyxl"]).status === 0
    ? ["python3"]
    : ["uv", "run", "--no-project", "--quiet", "--with", "openpyxl", "python3"];
const dump = (file: string, maxRows?: number): Sheet[] =>
  JSON.parse(
    execFileSync(
      python[0],
      [
        ...python.slice(1),
        "-I",
        "-W",
        "ignore",
        join(__dirname, "xlsx-dump.py"),
        file,
        ...(maxRows ? [String(maxRows)] : []),
      ],
      {
        encoding: "utf8",
        maxBuffer: 1 << 28,
      },
    ),
  );

async function main() {
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }
  await db.insert(schema.site).values([
    { site: "PEN", nameSite: "Batu Maung", timezone: "Asia/Kuala_Lumpur" },
    { site: "TAL", nameSite: "Talbaria", timezone: "Asia/Dhaka" },
  ]);
  // Two tanks per Penang area, numbered as in Penang; one at another site.
  const pond = (site: string, code: string, area: string, n: number) => ({
    pondCode: `${site}-${code}-${String(n).padStart(3, "0")}`,
    site,
    area,
    displayName: `${area} - #${n}`,
    areaCode: code,
    zone: area,
    unitType: "tank",
  });
  const first = { FT2: 25, FT3: 91 } as Record<string, number>;
  await db
    .insert(schema.pond)
    .values([
      ...Object.entries(AREAS).flatMap(([code, area]) =>
        [0, 1].map((i) => pond("PEN", code, area, (first[code] ?? 1) + i)),
      ),
      pond("TAL", "PND", "Pond", 1),
    ]);
  const reading = (pondCode: string, at: string, period: string, values: object, appVersion = "0.10.0") => ({
    pondCode,
    recordedAt: new Date(at),
    period,
    person: "Ana",
    appVersion,
    ...values,
  });
  await db.insert(schema.wqReadings).values([
    reading("PEN-FT1-001", "2025-07-01T00:00:00Z", "morning", { dissolvedOxygen: 3.32, temperature: 28.6 }, "legacy"),
    reading("PEN-FT1-001", "2025-07-01T01:15:00Z", "morning", { dissolvedOxygen: 3.5, temperature: 28.7 }), // same day: the latest shows
    reading("PEN-FT3-091", "2025-07-02T06:00:00Z", "afternoon", { dissolvedOxygen: 5, temperature: 114 }), // out of Range, kept
    reading("PEN-FT2-025", "2025-07-03T00:30:00Z", "morning", { dissolvedOxygen: 5, temperature: 28, ph: 7 }),
    reading("PEN-FT2-025", "2025-07-03T01:30:00Z", "morning", { dissolvedOxygen: 25, temperature: 28 }), // red; no pH
    reading("PEN-AQU-001", "2025-06-30T16:30:00Z", "morning", { dissolvedOxygen: 6, temperature: 28 }), // 00:30 on 1 July in Penang
    reading("PEN-AQU-001", "2025-06-30T15:00:00Z", "afternoon", { dissolvedOxygen: 6, temperature: 28 }), // 23:00 on 30 June
    reading("TAL-PND-001", "2025-07-01T02:00:00Z", "morning", { dissolvedOxygen: 7, temperature: 30 }), // another site
  ]);

  // As the download route builds it: rows from the reader, for an Operator of PEN.
  const only = { site: "PEN", date: "202507" };
  const [ponds, readings] = await Promise.all([
    readRows(db, "ponds", ["PEN"], only),
    readRows(db, "wq", ["PEN"], only),
  ]);
  const file = join(mkdtempSync(join(tmpdir(), "pondcube-")), "PondCube PEN 2025-07.xlsx");
  writeFileSync(
    file,
    await waterQualityWorkbook({ month: "202507", ponds, readings, madeOn: new Date("2026-10-30T02:00:00Z") }),
  );
  const sheets = dump(file);
  const tab = (name: string) => sheets.find((s) => s.name === name)!;
  const value = (s: Sheet, row: number) => s.rows[row - 1].map((c) => c[1]);

  // Tabs, headers, and real dates shown as YYYYMMDD.
  assert.deepEqual(
    sheets.map((s) => s.name),
    TABS,
  );
  const table = tab("Readings");
  assert.deepEqual(value(table, 1), [
    ...["DATE", "TIME", "PERIOD", "AREA", "TANK", "POND", "DISSOLVED_OXYGEN", "TEMPERATURE", "PH"],
    ...["AMMONIA", "NITRITE", "NITRATE", "REMARKS", "PERSON", "SOURCE"],
  ]);
  assert.deepEqual(table.tables, [["Readings", "A1:O7", "TableStyleMedium2"]], "an Excel table, with filters");
  assert.equal(table.rows.length, 7, "6 readings in July, Penang time: none from TAL or 30 June");
  for (const row of table.rows.slice(1)) assert.deepEqual([row[0][0], row[0][2]], ["date", "yyyymmdd"]);
  assert.deepEqual(value(table, 2).slice(0, 7), [
    "20250701",
    "08:00",
    "Morning",
    "Fish Tank 1",
    1,
    "PEN-FT1-001",
    3.32,
  ]);
  assert.deepEqual(value(table, 3).slice(0, 4), ["20250701", "09:15", "Morning", "Fish Tank 1"]);
  assert.deepEqual(value(table, 4).slice(0, 4), ["20250701", "00:30", "Morning", "Aqua"], "by round, then area");
  assert.equal(table.rows[4][7][3], "F8CBAD", "114 °C is red");

  // The old log's layout: tanks down (with or without readings), days across, morning above afternoon.
  const ft1 = tab("Fish Tank 1");
  assert.equal(ft1.freeze, "B4");
  assert.deepEqual(value(ft1, 1)[0], "Fish Tank 1 · Morning (AM) · July 2025");
  assert.deepEqual(value(ft1, 2).slice(0, 2), ["Tank / Day", "1 Jul · Tue"]);
  assert.deepEqual(value(ft1, 3).slice(1, 8), ["DO", "Temp", "pH", "Ammonia", "Nitrite", "Nitrate", "Remarks"]);
  assert.deepEqual([value(ft1, 4)[0], value(ft1, 5)[0]], [1, 2], "tank 2 has no readings and is listed");
  const [, latest, , fill, , comment] = ft1.rows[3][1];
  assert.deepEqual([latest, fill, comment], [3.5, "FFE699", "2 readings this day; the latest is shown. See Readings."]);
  assert.equal(value(ft1, 8)[0], "Fish Tank 1 · Afternoon (PM) · July 2025");
  assert.deepEqual(
    tab("Fish Tank 3").rows[10][9].slice(1, 4),
    [114, "0.0", "F8CBAD"],
    "2 July afternoon, tank 91: red",
  );
  // 3 July, tank 25: two readings, the latest out of Range and without pH; each cell says so (day 3 = column 16).
  const several = "2 readings this day; the latest is shown. See Readings.";
  const [doCell, , phCell] = tab("Fish Tank 2").rows[3].slice(15, 18);
  assert.deepEqual([doCell[1], doCell[3], doCell[5]], [25, "F8CBAD", several], "red, with the note");
  assert.deepEqual([phCell[1], phCell[3], phCell[5]], [null, "FFE699", several], "empty latest, earlier pH: yellow");
  const daily = tab("Daily averages");
  assert.deepEqual(daily.rows[4][0].slice(0, 3), ["date", "20250701", "yyyymmdd"]);
  assert.ok(Math.abs(Number(value(daily, 5)[2]) - 3.41) < 1e-9, "Fish Tank 1 on 1 July: both morning readings");
  const averages = tab("Tank averages");
  assert.deepEqual(value(averages, 4).slice(0, 3), ["Tank", "DO AM", "DO PM"]);
  assert.deepEqual(value(averages, 20).slice(0, 5), [91, null, 5, null, null], "114 °C left out of the average");

  // Tab for tab against the agreed sample: frozen panes, merges, tables, and each tab's header rows.
  if (!existsSync(SAMPLE)) console.log(`(sample not found at ${SAMPLE}: compared with the expectations above only)`);
  else {
    const headers = { Readings: 1, "Tank averages": 4, "Daily averages": 4 } as Record<string, number>;
    for (const [i, s] of dump(SAMPLE, 5).entries()) {
      const ours = sheets[i];
      assert.equal(ours.name, s.name);
      assert.deepEqual([ours.freeze, ours.merges], [s.freeze, s.merges], `${s.name}: frozen panes and merges`);
      assert.deepEqual(
        ours.tables.map(([n, , style]) => [n, style]),
        s.tables.map(([n, , style]) => [n, style]),
        `${s.name}: tables`,
      );
      const rows = s.name === "About" ? 1 : (headers[s.name] ?? 3); // About's first line: title; area tabs: 3 header rows
      for (let r = 0; r < rows; r++)
        assert.deepEqual(
          ours.rows[r].map((c) => c.slice(0, 5)),
          s.rows[r].map((c) => c.slice(0, 5)),
          `${s.name}: row ${r + 1}`,
        );
    }
  }

  await client.close();
  console.log("water-quality download OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
