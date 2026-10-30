// Record intake self-check (lib/intake.ts) against in-memory Postgres (PGLite): same tables as Neon,
// generated from lib/schema.ts, no network or DATABASE_URL. Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, eq } from "drizzle-orm";
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

  await db.insert(schema.site).values({ site: "PEN", nameSite: "Batu Maung", timezone: "Asia/Kuala_Lumpur" });
  await db.insert(schema.pond).values({
    pondCode: "PEN-FT1-001",
    displayName: "Fish Tank 1 - #1",
    site: "PEN",
    area: "Fish Tank 1",
    areaCode: "FT1",
    zone: "Fish Tank 1",
    unitType: "tank",
  });
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
  assert.equal(wq.recordedAt.toISOString(), recordedAt.toISOString(), "recorded-at keeps its instant");
  assert.equal(wq.appVersion, "9.9.9", "stamped with the server's app version");
  await save("feeding", { ...who, recordedAt, feedAmountKg: "3.5", feedingsCount: "2" });
  await save("mortality", { ...who, recordedAt, mortalityCount: "3", causeDeath: "Water_quality" });
  assert.equal(await rows(schema.feedingEvents), 1);
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
  await assert.rejects(save("mortality", { ...who, recordedAt, mortalityCount: "2.5" }));
  await assert.rejects(save("mortality", { ...who, recordedAt: "2026-10-09T08:00", mortalityCount: "1" }));
  await assert.rejects(save("sampling", { ...who, recordedAt, fish: [{ wt: "", lenSt: "" }] }));
  await assert.rejects(save("bogus" as RecordKind, { ...who, recordedAt })); // deliberately ill-typed
  assert.equal(await rows(schema.wqReadings), 1);
  assert.equal(await rows(schema.mortalityEvents), 1);

  // Unknown pond: the foreign key rejects it.
  await assert.rejects(save("mortality", { ...who, pondCode: "PEN-NOPE-999", recordedAt, mortalityCount: "1" }));

  // Atomic: if the fish insert fails, the sampling event is not kept either.
  await client.exec("ALTER TABLE fish_measurements RENAME TO fish_measurements_off");
  await assert.rejects(save("sampling", { ...who, recordedAt, fish: [{ wt: "50" }] }));
  await client.exec("ALTER TABLE fish_measurements_off RENAME TO fish_measurements");
  assert.equal(await rows(schema.samplingEvents), 1, "no orphan sampling event");

  // A resend (same id, its first reply lost) is skipped: the Record, and a Sampling event's fish, are stored once.
  const again = { ...who, recordedAt, id: id() };
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
    save("mortality", { ...who, recordedAt, id: undefined, mortalityCount: "1" }),
    "no id, not stored",
  );

  // The Person is the caller's (the signed-in Operator), whatever the device sends.
  await save("feeding", { ...who, recordedAt, feedAmountKg: "1", person: "Someone else" });
  assert.ok((await db.select().from(schema.feedingEvents)).every((f) => f.person === "Operator 1"));

  // (Field names vs columns are checked when lib/intake.ts loads: reaching this line means they match.)
  await client.close();
  console.log("record intake OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
