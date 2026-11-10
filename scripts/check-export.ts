// Seeing the data self-check (lib/export.ts and the views in lib/schema.ts) against in-memory Postgres (PGLite):
// site-local DATE and TIME, rows only ever from the Operator's own sites, and data links. Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { columnsOf, csv, dataLinkAccess, readRows, replaceDataLink, rowsByYear, VIEWS } from "../lib/export";
import { findOperator } from "../lib/operators";

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
  const pond = (pondCode: string, site: string, area: string) => ({
    pondCode,
    site,
    area,
    displayName: pondCode,
    areaCode: "X",
    zone: area,
    unitType: "tank",
  });
  await db.insert(schema.pond).values([pond("PEN-FT1-001", "PEN", "Fish Tank 1"), pond("TAL_07", "TAL", "Pond")]);
  await db.insert(schema.feed).values({ feed: "SUP", sites: ["PEN", "TAL"] });
  await db.insert(schema.fert).values({ fert: "UREA", sites: ["PEN", "TAL"] });
  await db.insert(schema.treatment).values({ treatment: "Lime", sites: ["PEN", "TAL"] });
  await db.insert(schema.species).values({ species: "ON", speciesLatin: "Oreochromis niloticus" });
  // Every Record kind at both sites.
  for (const [pondCode, recordedAt] of [
    ["PEN-FT1-001", new Date("2026-10-29T17:30:00Z")], // 01:30 on 30 October in Penang
    ["TAL_07", new Date("2026-10-29T17:30:00Z")],
  ] as const) {
    const at = { pondCode, recordedAt, person: "Ana", appVersion: "0.10.0" };
    await db.insert(schema.wqReadings).values({ ...at, period: "morning", dissolvedOxygen: 6.5, temperature: 29 });
    await db.insert(schema.feedingEvents).values({ ...at, feed: "SUP", feedWeight: 2000 });
    await db.insert(schema.fertiliserEvents).values({ ...at, fert: "UREA", fertWeight: 50000 });
    await db.insert(schema.treatmentEvents).values({ ...at, treatment: "Lime", treatmentWeight: 12000.5 });
    await db
      .insert(schema.mortalityEvents)
      .values({ ...at, species: "ON", pit: "00075D5F96", mortalityCount: 1, causeDeath: "Unknown" });
    const [event] = await db.insert(schema.samplingEvents).values(at).returning();
    await db.insert(schema.fishMeasurements).values([
      { samplingEventId: event.id, wt: 120 },
      { samplingEventId: event.id, wt: 130, lenSt: 18 },
    ]);
  }
  // The old log's readings come along too.
  await db.insert(schema.wqReadings).values({
    pondCode: "PEN-FT1-001",
    recordedAt: new Date("2025-07-01T00:00:00Z"),
    period: "morning",
    temperature: 28.6,
    person: "Mahirah Mahmuddin",
    appVersion: "legacy",
  });

  // DATE and TIME are the site's local date and time, whatever the server's time zone.
  const pen = await readRows(db, "wq", ["PEN"], { site: "PEN", date: "202610" });
  assert.equal(pen.length, 1);
  assert.equal(pen[0].date, "20261030");
  assert.equal(pen[0].time, "01:30");
  assert.equal(pen[0].pond, "PEN-FT1-001");
  assert.equal(pen[0].tank, 1);
  assert.equal(pen[0].dissolved_oxygen, 6.5);
  const [tal] = await readRows(db, "wq", ["TAL"]);
  assert.equal(tal.date, "20261029", "23:30 the day before in Dhaka");
  assert.equal(tal.tank, 7, "a DMS pond code's number (TAL_07)");
  assert.equal(tal.period, "afternoon", "the Period is the site's too, whatever the device sent");
  const legacy = await readRows(db, "wq", ["PEN"], { date: "202507" });
  assert.deepEqual([legacy.length, legacy[0].source, legacy[0].time], [1, "legacy", "08:00"]);

  // A corrected reading isn't shown, only its correction (so the download and its averages use that); the stored
  // reading stays. A correction can only replace a reading of its own pond: none of another site's.
  const [typo, other] = await db
    .insert(schema.wqReadings)
    .values(
      ["PEN-FT1-001", "TAL_07"].map((pondCode) => ({
        pondCode,
        recordedAt: new Date("2026-11-02T01:00:00Z"),
        period: "morning",
        dissolvedOxygen: 15.2,
        person: "Ana",
        appVersion: "0.11.0",
      })),
    )
    .returning();
  await db.insert(schema.wqReadings).values(
    [typo.id, other.id].map((replaces) => ({
      pondCode: "PEN-FT1-001",
      recordedAt: typo.recordedAt,
      period: "morning",
      dissolvedOxygen: 5.2,
      replaces,
      person: "Ana",
      appVersion: "0.11.0",
    })),
  );
  const shown = async (site: string) =>
    (await readRows(db, "wq", [site], { date: "202611" })).map((r) => r.dissolved_oxygen);
  assert.deepEqual(await shown("PEN"), [5.2, 5.2], "the typo is replaced by its correction");
  assert.deepEqual(await shown("TAL"), [15.2], "a correction at PEN hides nothing at TAL");
  await db.delete(schema.wqReadings).where(gte(schema.wqReadings.recordedAt, typo.recordedAt));

  // An Operator of PEN gets nothing from TAL, from any view, even when asking for it by name.
  for (const name of Object.keys(VIEWS) as (keyof typeof VIEWS)[]) {
    const rows = await readRows(db, name, ["PEN"]);
    assert.ok(rows.length > 0, `${name}: PEN rows`);
    assert.ok(
      rows.every((r) => r.site === "PEN"),
      `${name}: only PEN rows`,
    );
    assert.deepEqual(await readRows(db, name, ["PEN"], { site: "TAL" }), [], `${name}: TAL asked for by name`);
    assert.deepEqual(await readRows(db, name, []), [], `${name}: no sites, no rows`);
  }

  // Sampling: one row per Fish measurement, its event's fields repeated.
  const fish = await readRows(db, "sampling", ["PEN"]);
  assert.equal(fish.length, 2);
  assert.ok(
    fish.every(
      (f) =>
        f.date === "20261030" &&
        f.person === "Ana" &&
        f.sampling_event === fish[0].sampling_event &&
        f.measure_event === "MONITOR",
    ),
  );
  assert.deepEqual(fish.map((f) => f.wt).sort(), [120, 130]);

  // Mortality: SPECIES and PIT after POND, as in the pond book; every earlier column kept, in its order.
  assert.deepEqual(columnsOf("mortality"), [
    "site",
    "date",
    "time",
    "area",
    "tank",
    "pond",
    "species",
    "pit",
    "mortality_count",
    "cause_death",
    "note_death",
    "person",
    "source",
  ]);
  const [death] = await readRows(db, "mortality", ["TAL"]);
  assert.deepEqual([death.species, death.pit, death.mortality_count], ["ON", "00075D5F96", 1]);

  // Fertiliser and treatment files: laid out like the feeding file, the item and its grams in place of the feed's.
  const like = (item: string, weight: string) =>
    columnsOf("feeding").map((c) => ({ feed: item, feed_weight: weight })[c] ?? c);
  assert.deepEqual(columnsOf("fertiliser"), like("fert", "fert_weight"));
  assert.deepEqual(columnsOf("treatment"), like("treatment", "treatment_weight"));
  assert.equal(
    await new Response(csv(columnsOf("treatment"), rowsByYear(db, "treatment", ["TAL"]))).text(),
    "SITE,DATE,TIME,AREA,TANK,POND,TREATMENT,TREATMENT_WEIGHT,REMARKS,PERSON,SOURCE\r\n" +
      "TAL,20261029,23:30,Pond,7,TAL_07,Lime,12000.5,,Ana,app\r\n",
  );
  const [fert] = await readRows(db, "fertiliser", ["PEN"]);
  assert.deepEqual([fert.pond, fert.fert, fert.fert_weight, fert.date], ["PEN-FT1-001", "UREA", 50000, "20261030"]);

  // Data links: a key per sign-in account, worked out on every request as at sign-in.
  await db.insert(schema.operators).values([
    { name: "Ana", email: "ana@x.org", active: true, sites: ["PEN"] },
    { name: "Ben", email: "ben@x.org", active: false, sites: ["PEN", "TAL"] }, // deactivated
  ]);
  const accounts: Record<string, string> = { user_ana: "ana@x.org", user_ben: "ben@x.org" };
  const linkAccess = (key: string) =>
    dataLinkAccess(
      db,
      key,
      async (id) =>
        accounts[id]
          ? { id, primaryEmailAddress: { emailAddress: accounts[id], verification: { status: "verified" } } }
          : null,
      (email) => findOperator(db, email),
    );
  const ana = await replaceDataLink(db, "user_ana");
  const ben = await replaceDataLink(db, "user_ben");
  assert.equal(await linkAccess("not-a-key"), "signedOut", "a bad key is refused");
  assert.equal(await linkAccess(""), "signedOut");
  assert.equal(await linkAccess(ben), "notOnList", "a deactivated Operator's key is refused");
  const access = await linkAccess(ana);
  assert.ok(typeof access === "object" && access.operator === "Ana");
  for (const name of Object.keys(VIEWS) as (keyof typeof VIEWS)[])
    assert.ok(
      (await readRows(db, name, access.sites)).every((r) => r.site === "PEN"),
      `${name}: other sites' rows are refused`,
    );
  const stored = await db.select().from(schema.dataLinks);
  assert.ok(
    stored.every((l) => l.keyHash !== ana && l.keyHash !== ben),
    "only a hash of the key is kept",
  );
  const again = await replaceDataLink(db, "user_ana");
  assert.equal(await linkAccess(ana), "signedOut", "a new link stops the old one");
  assert.ok(typeof (await linkAccess(again)) === "object");
  delete accounts.user_ana;
  assert.equal(await linkAccess(again), "signedOut", "the sign-in account is gone");

  // CSV: upper-case headers, blanks for nulls, quoted text; every year, oldest first, read a year at a time.
  await db.update(schema.wqReadings).set({ remarks: 'cloudy, "green" water' });
  const text = await new Response(csv(columnsOf("wq"), rowsByYear(db, "wq", ["PEN"]))).text();
  assert.equal(
    text,
    "SITE,DATE,TIME,PERIOD,AREA,TANK,POND,DISSOLVED_OXYGEN,TEMPERATURE,PH,AMMONIA,NITRITE,NITRATE,REMARKS,PERSON,SOURCE\r\n" +
      'PEN,20250701,08:00,morning,Fish Tank 1,1,PEN-FT1-001,,28.6,,,,,"cloudy, ""green"" water",Mahirah Mahmuddin,legacy\r\n' +
      'PEN,20261030,01:30,morning,Fish Tank 1,1,PEN-FT1-001,6.5,29,,,,,"cloudy, ""green"" water",Ana,app\r\n',
  );
  const years = [];
  for await (const page of rowsByYear(db, "wq", ["PEN"])) years.push(page.map((r) => r.date));
  assert.deepEqual(years, [["20250701"], ["20261030"]], "a page per year, oldest first");
  assert.equal(
    (await new Response(csv(columnsOf("ponds"), rowsByYear(db, "ponds", ["PEN"]))).text()).split("\r\n").length,
    3,
  );
  assert.equal(
    await new Response(csv(["date"], rowsByYear(db, "wq", []))).text(),
    "DATE\r\n",
    "no sites: the header only",
  );

  await client.close();
  console.log("seeing the data OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
