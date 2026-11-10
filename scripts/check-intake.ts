// Record intake self-check (lib/intake.ts) against in-memory Postgres (PGLite): same tables as Neon,
// generated from lib/schema.ts, no network or DATABASE_URL. Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, eq, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { createRecordIntake, insertStatements, type AtomicWriter } from "../lib/intake";
import type { RecordKind } from "../lib/validation";

async function main() {
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }

  // Test adapter at the intake seam: a PGLite transaction (Neon's adapter uses batch).
  const pgliteWriter: AtomicWriter = (inserts) =>
    db.transaction(async (tx) => {
      for (const statement of insertStatements(tx, inserts)) await statement;
    });
  const intake = createRecordIntake(pgliteWriter, "9.9.9"); // the server's app version
  // As a device sends it: ids made at Save unless the input has them (a resend). "Operator 1" is signed in.
  const id = () => crypto.randomUUID();
  const save = (kind: RecordKind, input: { fish?: object[]; [field: string]: unknown }) => {
    const sent = { id: id(), ...input };
    if (input.fish) sent.fish = input.fish.map((f) => ({ id: id(), ...f }));
    return intake.save(kind, sent, "Operator 1");
  };

  await db.insert(schema.site).values([
    { site: "PEN", nameSite: "Batu Maung", timezone: "Asia/Kuala_Lumpur" },
    { site: "TAL", nameSite: "Talbaria", timezone: "Asia/Dhaka" },
  ]);
  await db.insert(schema.species).values([
    { species: "ON", speciesLatin: "Oreochromis niloticus" },
    { species: "CC", speciesLatin: "Catla catla", speciesCommon: "Catla" },
    { species: "LR", speciesLatin: "Labeo rohita", speciesCommon: "Rohu" },
  ]);
  await db.insert(schema.pond).values({
    pondCode: "PEN-FT1-001",
    displayName: "Fish Tank 1 - #1",
    site: "PEN",
    area: "Fish Tank 1",
    areaCode: "FT1",
    zone: "Fish Tank 1",
    unitType: "tank",
    species: ["ON"],
  });
  // Polyculture, and a pond whose species aren't known.
  const talPond = (pondCode: string, species: string[]) => ({
    pondCode,
    displayName: pondCode,
    site: "TAL",
    area: "Pond",
    unitType: "pond",
    species,
  });
  await db.insert(schema.pond).values([talPond("TAL_01", ["CC", "LR"]), talPond("TAL_32", [])]);
  await db.insert(schema.feed).values({ feed: "SUP", sites: ["PEN"] });
  await db.insert(schema.fert).values({ fert: "UREA", sites: ["TAL"] });
  await db.insert(schema.treatment).values({ treatment: "Lime", sites: ["TAL"] });
  const who = { pondCode: "PEN-FT1-001" };
  const recordedAt = new Date("2026-10-09T00:30:00.000Z");
  const rows = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0].n;

  // Each kind round-trips through one interface.
  await save("wq", {
    ...who,
    recordedAt,
    period: "morning",
    dissolvedOxygen: "6.5",
    temperature: "28.4",
    ph: "",
    remarks: "",
  });
  const [wq] = await db.select().from(schema.wqReadings);
  assert.equal(wq.dissolvedOxygen, 6.5);
  assert.equal(wq.ph, null);
  assert.equal(wq.remarks, null, 'a blank note is stored as null, not ""');
  assert.equal(wq.recordedAt.toISOString(), recordedAt.toISOString(), "recorded-at keeps its instant");
  assert.equal(wq.appVersion, "9.9.9", "stamped with the server's app version");
  await save("feeding", { ...who, recordedAt, feed: "SUP", feedWeight: "3500" });
  await save("mortality", { ...who, recordedAt, species: "ON", mortalityCount: "3", causeDeath: "Water_quality" });
  assert.deepEqual(
    (await db.select().from(schema.feedingEvents)).map((f) => [f.feed, f.feedWeight]),
    [["SUP", 3500]],
  );
  assert.equal((await db.select().from(schema.mortalityEvents))[0].causeDeath, "Water_quality");

  // Sampling: event + measured fish in one write; blank rows are skipped.
  await save("sampling", {
    ...who,
    recordedAt,
    notes: "batch 7",
    fish: [{ wt: "120", lenSt: "18" }, { wt: "", lenSt: "" }, { wt: "95" }],
  });
  const [event] = await db.select().from(schema.samplingEvents);
  const fish = await db
    .select()
    .from(schema.fishMeasurements)
    .where(eq(schema.fishMeasurements.samplingEventId, event.id));
  assert.equal(fish.length, 2);
  assert.equal(event.appVersion, "9.9.9");

  // Invalid input writes nothing: ranges, whole numbers, offset-less time, unknown kind.
  await assert.rejects(save("wq", { ...who, recordedAt, period: "morning", dissolvedOxygen: "25", temperature: "28" }));
  await assert.rejects(save("mortality", { ...who, recordedAt, species: "ON", mortalityCount: "2.5" }));
  await assert.rejects(save("feeding", { ...who, recordedAt, feedWeight: "500" })); // no Feed
  await assert.rejects(save("feeding", { ...who, recordedAt, feed: "SUP", feedWeight: "15001" }));
  await assert.rejects(
    save("mortality", { ...who, recordedAt: "2026-10-09T08:00", species: "ON", mortalityCount: "1" }),
  );
  await assert.rejects(save("sampling", { ...who, recordedAt, fish: [{ wt: "", lenSt: "" }] }));
  await assert.rejects(save("bogus" as RecordKind, { ...who, recordedAt })); // deliberately ill-typed
  assert.equal(await rows(schema.wqReadings), 1);
  assert.equal(await rows(schema.mortalityEvents), 1);
  assert.equal(await rows(schema.feedingEvents), 1);

  // A correction names the reading it replaces; blank is no correction, anything but an id is refused.
  const reading = { ...who, recordedAt, period: "morning", temperature: "28.4" };
  await save("wq", { ...reading, dissolvedOxygen: "5.2", replaces: wq.id });
  await save("wq", { ...reading, dissolvedOxygen: "5.3", replaces: "" });
  await assert.rejects(save("wq", { ...reading, dissolvedOxygen: "5.4", replaces: "pond 1's" }));
  const links = await db.select({ replaces: schema.wqReadings.replaces }).from(schema.wqReadings);
  assert.deepEqual(links.map((r) => r.replaces).filter(Boolean), [wq.id]);
  assert.equal(links.length, 3);

  // Unknown pond: the foreign key rejects it.
  await assert.rejects(
    save("mortality", { ...who, pondCode: "PEN-NOPE-999", recordedAt, species: "ON", mortalityCount: "1" }),
  );

  // Atomic: if the fish insert fails, the sampling event is not kept either.
  await client.exec("ALTER TABLE fish_measurements RENAME TO fish_measurements_off");
  await assert.rejects(save("sampling", { ...who, recordedAt, fish: [{ wt: "50" }] }));
  await client.exec("ALTER TABLE fish_measurements_off RENAME TO fish_measurements");
  assert.equal(await rows(schema.samplingEvents), 1, "no orphan sampling event");

  // A resend (same id, its first reply lost) is skipped: the Record, and a Sampling event's fish, are stored once.
  const again = { ...who, recordedAt, id: id(), species: "ON" };
  await save("mortality", { ...again, mortalityCount: "4" });
  await save("mortality", { ...again, mortalityCount: "4" });
  assert.equal(await rows(schema.mortalityEvents), 2, "one new mortality record, not two");
  const sample = {
    ...again,
    id: id(),
    fish: [
      { id: id(), wt: "10" },
      { id: id(), wt: "11" },
    ],
  };
  await save("sampling", sample);
  const fishBefore = await rows(schema.fishMeasurements);
  await save("sampling", sample);
  assert.equal(await rows(schema.samplingEvents), 2);
  assert.equal(await rows(schema.fishMeasurements), fishBefore, "a resent Sampling event adds no fish");
  await assert.rejects(
    save("mortality", { ...who, recordedAt, id: undefined, species: "ON", mortalityCount: "1" }),
    "no id, not stored",
  );

  // A Mortality record names its species, and with a PIT tag (kept uppercase) is that one fish.
  const deaths = async (ids: string[]) =>
    (
      await db
        .select()
        .from(schema.mortalityEvents)
        .where(inArray(schema.mortalityEvents.id, ids))
        .orderBy(schema.mortalityEvents.pondCode)
    ).map((m) => [m.pondCode, m.species, m.pit, m.mortalityCount]);
  const tagged = id();
  await save("mortality", {
    id: tagged,
    pondCode: "TAL_01",
    recordedAt,
    species: "LR",
    pit: "00075d5f96",
    mortalityCount: "1",
  });
  assert.deepEqual(await deaths([tagged]), [["TAL_01", "LR", "00075D5F96", 1]]);
  const tal = { pondCode: "TAL_01", recordedAt };
  await assert.rejects(save("mortality", { ...tal, species: "LR", pit: "00075D5F96", mortalityCount: "2" }));
  await assert.rejects(save("mortality", { ...tal, species: "LR", pit: "7D1", mortalityCount: "1" }));
  await assert.rejects(save("mortality", { ...tal, species: "", mortalityCount: "1" }));
  await assert.rejects(save("mortality", { ...tal, species: "XX", mortalityCount: "1" })); // not on the species list

  // Saved on a device before species was asked (a Draft or Outbox Record): never refused for it. It takes its pond's
  // species when the pond lists exactly one, else none; the rest is checked as ever.
  const old = { a: id(), b: id(), c: id() };
  await save("mortality", { id: old.a, ...who, recordedAt, mortalityCount: "2", causeDeath: "Unknown" });
  await save("mortality", { id: old.b, ...tal, mortalityCount: "2" });
  await save("mortality", { id: old.c, pondCode: "TAL_32", recordedAt, mortalityCount: "2" });
  assert.deepEqual(await deaths([old.a, old.b, old.c]), [
    ["PEN-FT1-001", "ON", null, 2],
    ["TAL_01", null, null, 2],
    ["TAL_32", null, null, 2],
  ]);
  await assert.rejects(save("mortality", { ...tal, mortalityCount: "2", pit: "00075D5F96" }));
  await assert.rejects(save("mortality", { ...tal, mortalityCount: "-1" }));
  await save("mortality", { id: old.a, ...who, recordedAt, mortalityCount: "2" }); // a resend: still stored once
  assert.equal(await rows(schema.mortalityEvents), 6);

  // Fertiliser and Treatment events: one item of the site's list and its grams, up to 100,000.
  const talAt = { pondCode: "TAL_01", recordedAt };
  await save("fertiliser", { ...talAt, fert: "UREA", fertWeight: "100000", remarks: "" });
  await save("treatment", { ...talAt, treatment: "Lime", treatmentWeight: "2500,5", remarks: "after rain" });
  assert.deepEqual(
    (await db.select().from(schema.fertiliserEvents)).map((f) => [f.pondCode, f.fert, f.fertWeight, f.remarks]),
    [["TAL_01", "UREA", 100000, null]],
  );
  assert.deepEqual(
    (await db.select().from(schema.treatmentEvents)).map((t) => [t.treatment, t.treatmentWeight, t.appVersion]),
    [["Lime", 2500.5, "9.9.9"]],
  );
  await assert.rejects(save("fertiliser", { ...talAt, fert: "UREA", fertWeight: "100001" }));
  await assert.rejects(save("fertiliser", { ...talAt, fert: "UREA", fertWeight: "0" }));
  await assert.rejects(save("fertiliser", { ...talAt, fertWeight: "10" })); // no Fertiliser
  await assert.rejects(save("fertiliser", { ...talAt, fert: "XXXX", fertWeight: "10" })); // not on any list
  await assert.rejects(save("treatment", { ...talAt, treatment: "Lime", treatmentWeight: "" }));
  await assert.rejects(save("treatment", { ...talAt, treatment: "Bleach", treatmentWeight: "10" }));
  assert.equal(await rows(schema.fertiliserEvents), 1);
  assert.equal(await rows(schema.treatmentEvents), 1);

  // The Person is the caller's (the signed-in Operator), whatever the device sends.
  await save("feeding", { ...who, recordedAt, feed: "SUP", feedWeight: "1", person: "Someone else" });
  assert.ok((await db.select().from(schema.feedingEvents)).every((f) => f.person === "Operator 1"));

  // (Field names vs columns are checked when lib/intake.ts loads: reaching this line means they match.)
  await client.close();
  console.log("record intake OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
