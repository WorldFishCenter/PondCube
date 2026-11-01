import writeXlsxFile, { type Cell, type CellObject, type Row as SheetRow } from "write-excel-file/node";
import { columnsOf, type Row } from "./export";
import { byArea, PERIODS } from "./options";
import { PROVISIONAL as P } from "./schema";
import { RANGES } from "./validation";

// The water-quality download: one site and month, the old log's layout plus a filterable table (docs/architecture.md).

type Reading = Row<"wq">;
type Pond = Row<"ponds">;
type Param = (typeof P)["dissolved_oxygen" | "temperature" | "ph" | "ammonia" | "nitrite" | "nitrate"];
type Column = Exclude<keyof Reading, "site">;
type Note = { row: number; col: number; text: string }; // a cell comment

// Each reading: area tab label, About name and unit, number format, Range, Readings width.
const PARAMS: Record<
  Param,
  { label: string; name: string; unit: string; format: string; range: readonly [number, number]; width: number }
> = {
  [P.dissolved_oxygen]: {
    label: "DO",
    name: "Dissolved oxygen",
    unit: "mg/L",
    format: "0.00",
    range: RANGES.dissolvedOxygen,
    width: 18,
  },
  [P.temperature]: {
    label: "Temp",
    name: "Temperature",
    unit: "°C",
    format: "0.0",
    range: RANGES.temperature,
    width: 14,
  },
  [P.ph]: { label: "pH", name: "pH", unit: "", format: "0.00", range: RANGES.ph, width: 7 },
  [P.ammonia]: { label: "Ammonia", name: "Ammonia", unit: "mg/L", format: "0.00", range: RANGES.ammonia, width: 10 },
  [P.nitrite]: { label: "Nitrite", name: "Nitrite", unit: "mg/L", format: "0.00", range: RANGES.nitrite, width: 9 },
  [P.nitrate]: { label: "Nitrate", name: "Nitrate", unit: "mg/L", format: "0.00", range: RANGES.nitrate, width: 9 },
};
const isParam = (c: string): c is Param => Object.hasOwn(PARAMS, c);
// Readings: the CSV's columns but SITE (one site per file); the others' About meaning and width.
const COLUMNS = columnsOf("wq").filter((c) => c !== "site") as Column[];
const OTHERS: Record<Exclude<Column, Param>, { name: string; width: number }> = {
  date: { name: "Date of the reading (local time at the site), shown as YYYYMMDD", width: 11 },
  time: { name: "Time of the reading (local time at the site)", width: 7 },
  [P.period]: { name: "Morning (before noon) or afternoon, from TIME", width: 10 },
  [P.area]: { name: "Area of the site, e.g. Fish Tank 3", width: 13 },
  [P.tank]: { name: "Tank number within the area", width: 7 },
  [P.pond_code]: { name: "Pond code", width: 14 },
  [P.remarks]: { name: "Remarks", width: 20 },
  person: { name: "Who made the reading", width: 20 },
  [P.source]: { name: "app = entered in PondCube; legacy = copied from the old Excel log", width: 9 },
};
const info = (c: Column) => (isParam(c) ? PARAMS[c] : { ...OTHERS[c], unit: "" });
const GRID_KEYS = [...(Object.keys(PARAMS) as Param[]), P.remarks]; // a day's columns on an area tab
const GRID = GRID_KEYS.length;
const BY_PERIOD = [P.dissolved_oxygen, P.temperature] as const; // averaged per Period
const BY_MONTH = [P.ph, P.ammonia, P.nitrite, P.nitrate] as const; // averaged over the month

const BOLD = { fontWeight: "bold" } as const;
const TITLE = { fontWeight: "bold", fontSize: 14 } as const;
const HEAD = { fontWeight: "bold", backgroundColor: "#DDEBF7" } as const;
const CENTER = { align: "center", alignVertical: "center" } as const;
const EDGE = { leftBorderStyle: "thin", leftBorderColor: "#999999" } as const;
const SHADE = "#F2F2F2";
const BAD = "#F8CBAD"; // outside its Range
const DUP = "#FFE699"; // several readings that day
const DATE = { type: Date, format: "yyyymmdd" } as const;
// A number format only on a cell with a value: write-excel-file refuses one on an empty cell.
const formatted = (value: number | string | null | undefined, format: string) =>
  value == null ? {} : { value, format };

const outOfRange = (p: Param, v: number | null | undefined) => {
  const [min, max] = PARAMS[p].range;
  return v != null && (v < min || v > max);
};
// A reading's average over `rs`, out-of-range values left out; empty without any.
const average = (rs: Reading[], p: Param): Cell => {
  const vs = rs.map((r) => r[p]).filter((v): v is number => v !== null && !outOfRange(p, v));
  return formatted(vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null, "0.00");
};
const groupBy = (rs: Reading[], key: (r: Reading) => string) => {
  const groups = new Map<string, Reading[]>(); // in the order of `rs`
  for (const r of rs) {
    const group = groups.get(key(r));
    if (group) group.push(r);
    else groups.set(key(r), [r]);
  }
  return groups;
};
const utcDay = (yyyymmdd: string) =>
  new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
const column = (i: number): string =>
  (i >= 26 ? column(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

/** The workbook for `month` (YYYYMM) at the site of `ponds`. */
export async function waterQualityWorkbook({
  month,
  ponds: sitePonds,
  readings: monthReadings,
  madeOn,
}: {
  month: string;
  ponds: Pond[];
  readings: Reading[];
  madeOn: Date;
}): Promise<Buffer> {
  const { site, name_site, timezone } = sitePonds[0];
  const first = utcDay(`${month}01`);
  const dayOf = (day: number) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const monthName = first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const periodOrder = (r: Reading) => PERIODS.findIndex((p) => p.value === r[P.period]); // the morning round first
  const readings = monthReadings.toSorted(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      periodOrder(a) - periodOrder(b) ||
      byArea(a[P.area], b[P.area]) ||
      a[P.tank] - b[P.tank] ||
      a.time.localeCompare(b.time),
  );
  // Ponds down each area tab: every active one, and any other with readings this month.
  const read = new Set(readings.map((r) => r[P.pond_code]));
  const ponds = sitePonds
    .filter((p) => p[P.status] === "active" || read.has(p[P.pond_code]))
    .toSorted((a, b) => a[P.tank] - b[P.tank]);
  const areas = [...new Set(ponds.map((p) => p[P.area]))].sort(byArea);
  const notes = new Map<number, Note[]>(); // sheet index → cell comments

  // --- About ---
  const about: SheetRow[] = [
    [{ value: `PondCube · Water quality · ${name_site} (${site}) · ${monthName}`, ...TITLE }],
    [
      `Made on ${madeOn.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: timezone })} from the PondCube database. ${readings.length.toLocaleString("en-US")} readings.`,
    ],
    [],
    [{ value: "How to read this file", ...BOLD }],
    ["• An empty cell means not measured. It is never a zero."],
    [
      "• Red cell: outside its plausible range. Yellow cell, or a red one with a note: more than one reading that day; the latest is shown.",
    ],
    ["• This file is a copy. Changes made here don't go back to the database."],
    [],
    [{ value: "Tabs", ...BOLD }],
    ["Readings — every reading, one row each. Filter by area, tank or date with the arrows in the header."],
    [
      `${areas[0]} … ${areas.at(-1)} — one tab per area, laid out like the old log: tanks down, days across, morning above afternoon.`,
    ],
    ["Tank averages — the month's average per tank, morning and afternoon."],
    ["Daily averages — each area's average per day, ready to chart."],
    [],
    [{ value: "Columns in Readings", ...BOLD }],
    ["Column", "Meaning", "Unit"].map((value) => ({ value, ...HEAD })),
    ...COLUMNS.map((c) => [c.toUpperCase(), info(c).name, info(c).unit]),
  ];
  if (readings.some((r) => r[P.source] === "legacy"))
    about.push(
      [],
      [
        {
          value: "Readings from the old log have no time: morning is shown as 08:00 and afternoon as 14:00.",
          fontStyle: "italic",
          textColor: "#666666",
        },
      ],
    );

  // --- Readings: one row each, an Excel table with filters ---
  const header = COLUMNS.map((c) => c.toUpperCase());
  const table: SheetRow[] = [
    header,
    ...readings.map((r): SheetRow =>
      COLUMNS.map((c): Cell => {
        if (isParam(c))
          return { ...formatted(r[c], PARAMS[c].format), ...(outOfRange(c, r[c]) && { backgroundColor: BAD }) };
        if (c === "date") return { value: utcDay(r.date), ...DATE };
        if (c === P.period) return r[c][0].toUpperCase() + r[c].slice(1);
        return r[c];
      }),
    ),
  ];

  // --- One tab per area, like the old log ---
  const cells = groupBy(readings, (r) => `${r[P.pond_code]}|${+r.date.slice(6)}|${r[P.period]}`); // in time order
  // The day headers, the same on every area tab.
  const dayHeads: Cell[] = [{ value: "Tank / Day", ...BOLD }];
  const subHeads: Cell[] = [{ backgroundColor: HEAD.backgroundColor }];
  for (let day = 1; day <= days; day++) {
    const short = (o: Intl.DateTimeFormatOptions) => dayOf(day).toLocaleString("en-US", { ...o, timeZone: "UTC" });
    dayHeads.push(
      {
        value: `${day} ${short({ month: "short" })} · ${short({ weekday: "short" })}`,
        columnSpan: GRID,
        ...HEAD,
        ...CENTER,
        ...EDGE,
      },
      ...Array<null>(GRID - 1).fill(null),
    );
    for (const [j, key] of GRID_KEYS.entries())
      subHeads.push({ value: isParam(key) ? PARAMS[key].label : "Remarks", ...HEAD, ...CENTER, ...(j === 0 && EDGE) });
  }
  const areaSheet = (area: string, sheetIndex: number): SheetRow[] => {
    const rows: SheetRow[] = [];
    const sheetNotes: Note[] = [];
    for (const { value: period, label } of PERIODS) {
      if (rows.length) rows.push([], []);
      rows.push([{ value: `${area} · ${label} · ${monthName}`, ...TITLE }], dayHeads, subHeads);
      for (const pond of ponds.filter((p) => p[P.area] === area)) {
        const row: Cell[] = [{ value: pond[P.tank], ...BOLD }];
        for (let day = 1; day <= days; day++) {
          const found = cells.get(`${pond[P.pond_code]}|${day}|${period}`) ?? [];
          const latest = found.at(-1);
          for (const [j, key] of GRID_KEYS.entries()) {
            const cell: CellObject = {
              ...formatted(latest?.[key], isParam(key) ? PARAMS[key].format : "@"),
              ...(j === 0 && EDGE),
            };
            if (day % 2 === 0) cell.backgroundColor = SHADE;
            // Several readings, any with this value: yellow and a note, even if the latest has none.
            if (found.length > 1 && found.some((r) => r[key] != null)) {
              cell.backgroundColor = DUP;
              const text = `${found.length} readings this day; the latest is shown. See Readings.`;
              sheetNotes.push({ row: rows.length, col: row.length, text });
            }
            if (isParam(key) && outOfRange(key, latest?.[key])) cell.backgroundColor = BAD; // red wins
            row.push(cell);
          }
        }
        rows.push(row);
      }
    }
    if (sheetNotes.length) notes.set(sheetIndex, sheetNotes);
    return rows;
  };

  // --- Tank averages (the old Graph sheet's numbers), out-of-range values left out ---
  const byPond = groupBy(readings, (r) => r[P.pond_code]);
  const averagesHead = [
    "Tank",
    ...BY_PERIOD.flatMap((p) => ["AM", "PM"].map((half) => `${PARAMS[p].label} ${half}`)), // PERIODS' order
    ...BY_MONTH.map((p) => PARAMS[p].label),
  ];
  const tankAverages: SheetRow[] = [[{ value: `Average per tank · ${monthName} · empty = no readings`, ...TITLE }]];
  for (const area of areas) {
    tankAverages.push([], [{ value: area, ...BOLD }]);
    tankAverages.push(averagesHead.map((value) => ({ value, ...HEAD, ...CENTER })));
    for (const pond of ponds.filter((p) => p[P.area] === area)) {
      const mine = byPond.get(pond[P.pond_code]) ?? [];
      tankAverages.push([
        pond[P.tank],
        ...BY_PERIOD.flatMap((p) =>
          PERIODS.map(({ value: period }) =>
            average(
              mine.filter((r) => r[P.period] === period),
              p,
            ),
          ),
        ),
        ...BY_MONTH.map((p) => average(mine, p)),
      ]);
    }
  }

  // --- Daily averages per area, chart-ready ---
  const byDay = groupBy(readings, (r) => `${+r.date.slice(6)}|${r[P.period]}`);
  const dailyAverages: SheetRow[] = [
    [{ value: `Average per area and day · ${monthName} · empty = no readings`, ...TITLE }],
  ];
  for (const p of BY_PERIOD) {
    for (const { value: period, label } of PERIODS) {
      dailyAverages.push(
        [],
        [{ value: `${PARAMS[p].name} (${PARAMS[p].unit}) · ${label}`, ...BOLD }],
        ["Day", ...areas].map((value) => ({ value, ...HEAD, ...CENTER })),
      );
      for (let day = 1; day <= days; day++) {
        const on = byDay.get(`${day}|${period}`) ?? [];
        dailyAverages.push([
          { value: dayOf(day), ...DATE },
          ...areas.map((a) =>
            average(
              on.filter((r) => r[P.area] === a),
              p,
            ),
          ),
        ]);
      }
    }
  }

  const tableRef = `A1:${column(header.length - 1)}${Math.max(table.length, 2)}`; // a table needs a row under its header
  return writeXlsxFile(
    [
      { sheet: "About", data: about, columns: [{ width: 20 }, { width: 70 }, { width: 8 }] },
      {
        sheet: "Readings",
        data: table,
        stickyRowsCount: 1,
        columns: COLUMNS.map((c) => ({ width: info(c).width })),
      },
      ...areas.map((area, i) => ({
        sheet: area,
        data: areaSheet(area, i + 2),
        stickyRowsCount: 3,
        stickyColumnsCount: 1,
        columns: [
          { width: 10 },
          ...Array.from({ length: days * GRID }, (_, c) => ({ width: c % GRID === GRID - 1 ? 13 : 7.5 })),
        ],
      })),
      {
        sheet: "Tank averages",
        data: tankAverages,
        stickyRowsCount: 1,
        columns: [{ width: 14 }, ...averagesHead.slice(1).map(() => ({ width: 10 }))],
      },
      { sheet: "Daily averages", data: dailyAverages, columns: [{ width: 30 }, ...areas.map(() => ({ width: 13 }))] },
    ],
    { features: [tableFeature(1, "Readings", tableRef, header), notesFeature(notes)] },
  ).toBuffer();
}

// write-excel-file has neither Excel tables nor cell comments; these add them as its "features" (raw XML parts).
type Feature = NonNullable<NonNullable<Parameters<typeof writeXlsxFile>[1]>["features"]>[number];
// A per-sheet insert: `xml` of the sheet's index, or nothing for that sheet.
const perSheet =
  (xml: (sheetIndex: number) => string | undefined) =>
  (_: unknown, { sheetIndex }: { sheetIndex: number }) =>
    xml(sheetIndex);
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An Excel table (filter arrows, banded rows) over `ref` of one sheet. */
function tableFeature(sheetIndex: number, name: string, ref: string, header: string[]): Feature {
  const forSheet = (xml: string) => perSheet((i) => (i === sheetIndex ? xml : undefined));
  return {
    files: {
      write: {
        files: () => ({
          "xl/tables/table1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="${MAIN}" id="1" name="${name}" displayName="${name}" ref="${ref}"><autoFilter ref="${ref}"/><tableColumns count="${header.length}">${header.map((h, i) => `<tableColumn id="${i + 1}" name="${escape(h)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
        }),
      },
      transform: {
        "[Content_Types].xml": {
          insert: () =>
            `<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
        },
        "xl/worksheets/_rels/sheet{id}.xml.rels": {
          insert: forSheet(`<Relationship Id="rIdTable1" Type="${REL}/table" Target="../tables/table1.xml"/>`),
        },
        "xl/worksheets/sheet{id}.xml": {
          insert: forSheet(`<tableParts count="1"><tablePart r:id="rIdTable1"/></tableParts>`),
        },
      },
    },
  };
}

/** Cell comments (Excel "notes"), per sheet index; the same parts openpyxl writes, with a VML shape for each. */
function notesFeature(notes: Map<number, Note[]>): Feature {
  const sheet = (i: number) => i + 1; // file numbers
  const ifNotes = (xml: (n: number) => string) => perSheet((i) => (notes.has(i) ? xml(sheet(i)) : undefined));
  const shape = (n: number, k: number, { row, col }: Note) =>
    `<v:shape id="_x0000_s${n * 1024 + k + 1}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:144px;height:79px;z-index:1;visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column></x:ClientData></v:shape>`;
  return {
    files: {
      write: {
        files: () =>
          Object.fromEntries(
            [...notes].flatMap(([i, cells]) => [
              [
                `xl/comments${sheet(i)}.xml`,
                `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="${MAIN}"><authors><author>PondCube</author></authors><commentList>${cells.map((c) => `<comment ref="${column(c.col)}${c.row + 1}" authorId="0"><text><t>${escape(c.text)}</t></text></comment>`).join("")}</commentList></comments>`,
              ],
              [
                `xl/drawings/vmlDrawing${sheet(i)}.vml`,
                `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${sheet(i)}"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${cells.map((c, k) => shape(sheet(i), k, c)).join("")}</xml>`,
              ],
            ]),
          ),
      },
      transform: {
        "[Content_Types].xml": {
          insert: () =>
            notes.size
              ? `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>${[...notes.keys()].map((i) => `<Override PartName="/xl/comments${sheet(i)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`).join("")}`
              : undefined,
        },
        "xl/worksheets/_rels/sheet{id}.xml.rels": {
          insert: ifNotes(
            (n) =>
              `<Relationship Id="rIdComments" Type="${REL}/comments" Target="../comments${n}.xml"/><Relationship Id="rIdVml" Type="${REL}/vmlDrawing" Target="../drawings/vmlDrawing${n}.vml"/>`,
          ),
        },
        "xl/worksheets/sheet{id}.xml": { insert: ifNotes(() => `<legacyDrawing r:id="rIdVml"/>`) },
      },
    },
  };
}
