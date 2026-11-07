// Range self-check for lib/validation.ts (shared by the device and app/api/records). Run: npx tsx scripts/check-validation.ts
import assert from "node:assert/strict";
import {
  waterQualitySchema,
  feedingSchema,
  mortalityBeforeSpecies,
  mortalityForm,
  mortalitySchema,
  recordedAtLocal,
  samplingForm,
  samplingSchema,
  withNewNames,
} from "../lib/validation";

const base = {
  id: "0b6f1a4e-5d1c-4f3a-9a57-2c8e7d3b9f10",
  pondCode: "PEN-HAT-001",
  person: "Operator 1",
  recordedAt: "2026-10-09T00:00:00.000Z",
};
type Schema = { safeParse: (v: unknown) => { success: boolean } };
const ok = (s: Schema, v: object) => assert.ok(s.safeParse({ ...base, ...v }).success, JSON.stringify(v));
const bad = (s: Schema, v: object) => assert.ok(!s.safeParse({ ...base, ...v }).success, JSON.stringify(v));

const wq = { period: "morning", dissolvedOxygen: "5", temperature: "28" };
ok(waterQualitySchema, wq);
ok(waterQualitySchema, { ...wq, dissolvedOxygen: "0", temperature: "45", ph: "14" });
bad(waterQualitySchema, { ...wq, dissolvedOxygen: "20.1" });
bad(waterQualitySchema, { ...wq, dissolvedOxygen: "-0.1" });
bad(waterQualitySchema, { ...wq, temperature: "45.5" });
bad(waterQualitySchema, { ...wq, ph: "14.1" });
bad(waterQualitySchema, { ...wq, ph: "abc" });
bad(waterQualitySchema, { ...wq, dissolvedOxygen: "" }); // required
assert.equal(waterQualitySchema.parse({ ...base, ...wq, ph: "" }).ph, undefined); // optional blank -> undefined

// What's typed reads the same on every device: a decimal point or comma, as many decimals as the meter shows.
const typed = (v: unknown) => waterQualitySchema.safeParse({ ...base, ...wq, dissolvedOxygen: v });
for (const [v, want] of [
  ["1.5", 1.5],
  ["1,5", 1.5],
  ["6,25", 6.25],
  ["5,125", 5.125],
  ["12,5555", 12.5555], // seen on an iPhone, whose keypad has only a comma
  [",5", 0.5],
  [".5", 0.5],
  ["5.", 5],
  ["5,", 5], // half typed: not an error yet
  [" 5 ", 5],
  ["1,500", 1.5], // oxygen stops at 20, so this can't be thousands
  [1e-7, 1e-7], // a number already read on the device, re-checked on the server
] as const)
  assert.equal(typed(v).data?.dissolvedOxygen, want, String(v));
for (const v of ["1.2.3", "1,2,3", "0x10", "1e1", "Infinity", "-", ",", "abc", "   "])
  assert.ok(!typed(v).success, `must be refused, not guessed: ${v}`);
assert.equal(waterQualitySchema.parse({ ...base, ...wq, ph: "   " }).ph, undefined); // spaces are blank, never 0
assert.equal(waterQualitySchema.parse({ ...base, ...wq, nitrite: "0,025" }).nitrite, 0.025);
// Only where a thousand or more is allowed can a comma before three digits be thousands: never guessed there.
const fed = (v: string) => feedingSchema.safeParse({ ...base, feed: "SUP", feedWeight: v });
for (const v of ["1,500", "12,345"]) assert.ok(!fed(v).success, `could be thousands: ${v}`);
for (const [v, want] of [
  ["1,5", 1.5],
  ["1,25", 1.25],
  ["0,125", 0.125], // thousands never start with 0
  ["1,5000", 1.5],
  ["1500", 1500],
] as const)
  assert.equal(fed(v).data?.feedWeight, want, v);

// One Feed and its weight: over 0, up to the pond book's 15,000 g.
ok(feedingSchema, { feed: "SUP", feedWeight: "15000" });
bad(feedingSchema, { feed: "SUP", feedWeight: "15000.5" });
bad(feedingSchema, { feed: "SUP", feedWeight: "0" });
bad(feedingSchema, { feed: "SUP", feedWeight: "-1" });
bad(feedingSchema, { feed: "SUP", feedWeight: "" });
bad(feedingSchema, { feedWeight: "500" }); // the Feed is required
bad(feedingSchema, { feed: "", feedWeight: "500" });

ok(mortalitySchema, { species: "ON", mortalityCount: "0" });
bad(mortalitySchema, { species: "ON", mortalityCount: "-1" });
bad(mortalitySchema, { species: "ON", mortalityCount: "2.5" });
ok(mortalitySchema, { species: "ON", mortalityCount: "1", causeDeath: "Water_quality" }); // enums come from lib/options
bad(mortalitySchema, { species: "ON", mortalityCount: "1", causeDeath: "water_quality" }); // DMS codes are case-sensitive
bad(mortalitySchema, { species: "ON", mortalityCount: "1", causeDeath: "Cull" }); // v3 only: v5 splits it into Cull_*
// Species is required: every DMS death row has one.
bad(mortalitySchema, { mortalityCount: "1" });
bad(mortalitySchema, { species: "", mortalityCount: "1" });
// A PIT tag is 10 characters, 0–9 and A–F, kept uppercase; blank is no PIT. The pond book's typos are refused.
const pitOf = (pit: string) => mortalitySchema.parse({ ...base, species: "ON", mortalityCount: "1", pit }).pit;
assert.equal(pitOf(" 00075d5f96 "), "00075D5F96");
assert.equal(pitOf("   "), undefined);
for (const pit of ["7D1", "7973855", "0007AF382", "00075D5F96A", "00075D5G96", "00075D 5F96"])
  bad(mortalitySchema, { species: "ON", mortalityCount: "1", pit });
// With a PIT the Record is that one fish, on the device and on the server; without one it's a count, as before.
for (const s of [mortalityForm, mortalitySchema])
  for (const mortalityCount of ["0", "2"]) bad(s, { species: "ON", mortalityCount, pit: "00075D5F96" });
ok(mortalitySchema, { species: "ON", mortalityCount: "25" });
// Saved before species was asked: no species, still checked otherwise; intake gives it its pond's.
ok(mortalityBeforeSpecies, { mortalityCount: "2" });
bad(mortalityBeforeSpecies, { mortalityCount: "2", pit: "00075D5F96" });
bad(mortalityBeforeSpecies, { mortalityCount: "-1" });

const fishId = base.id; // any uuid
ok(samplingSchema, {
  fish: [
    { id: fishId, wt: "120", lenSt: "18" },
    { id: fishId, wt: "", lenSt: "" },
  ],
});
bad(samplingSchema, { fish: [] });
bad(samplingSchema, { fish: [{ id: fishId, wt: "", lenSt: "" }] }); // blank rows only -> no empty sampling events
bad(samplingSchema, { fish: [{ id: fishId, wt: "-5" }] });
ok(samplingSchema, { fish: [{ id: fishId, wt: "20000", lenSt: "100" }] }); // DMS trait Ranges, upper ends
bad(samplingSchema, { fish: [{ id: fishId, wt: "20001" }] });
bad(samplingSchema, { fish: [{ id: fishId, lenSt: "101" }] });
bad(samplingSchema, { fish: [{ id: fishId, wt: "0" }] }); // a 0 g fish isn't a measurement
bad(samplingSchema, { fish: [{ id: fishId, lenSt: "0" }] });

// Saved before 0.8.0 (Draft or Outbox): read under the new names; a value with no new field goes in the note.
assert.deepEqual(withNewNames("mortality", { mortalityCount: 2, suspectedCause: "disease", remarks: "a" }), {
  mortalityCount: 2,
  causeDeath: "Disease_parasites",
  noteDeath: "a",
});
assert.deepEqual(withNewNames("mortality", { suspectedCause: "predation", remarks: "birds" }), {
  causeDeath: undefined,
  noteDeath: "birds; Cause: predation",
});
assert.deepEqual(
  withNewNames("feeding", { feedType: "other", feedTypeOther: "Rice bran", feedAmountKg: "2", remarks: "" }),
  { feedWeight: "2000", remarks: "Feed type: Rice bran" },
);
// Saved before 0.12.0 (kg per feeding): grams, the number of feedings in the remarks. A Draft holds what was typed.
assert.deepEqual(withNewNames("feeding", { feed: "SUP", feedAmountKg: "1,5", feedingsCount: "2", remarks: "am" }), {
  feed: "SUP",
  feedWeight: "1500",
  remarks: "am; Number of feedings: 2",
});
assert.deepEqual(withNewNames("feeding", { feed: undefined, feedAmountKg: "", feedingsCount: "", remarks: "" }), {
  feed: undefined,
  feedWeight: "",
  remarks: "",
});
assert.equal(withNewNames("feeding", { feedAmountKg: "abc" }).feedWeight, "abc", "unreadable stays as typed");
// An Outbox Record holds numbers, and still sends.
const outboxed = withNewNames("feeding", { ...base, feed: "SUP", feedAmountKg: 2.3, feedingsCount: 3 });
assert.deepEqual(feedingSchema.parse(outboxed), {
  ...base,
  recordedAt: new Date(base.recordedAt),
  feed: "SUP",
  feedWeight: 2300, // not 2299.9999999999995
  remarks: "Number of feedings: 3",
});
const fresh = { feed: "SUP", feedWeight: 500, remarks: "x" };
assert.equal(withNewNames("feeding", fresh), fresh, "new names are left as they are");
assert.deepEqual(withNewNames("sampling", { fish: [{ id: "f", weightG: 120 }] }), {
  fish: [{ id: "f", wt: 120, lenSt: undefined }],
});
assert.equal(withNewNames("mortality", { suspectedCause: "handling" }).causeDeath, "Handling_mortality");
const current = { causeDeath: "Cull_final", noteDeath: "x" };
assert.equal(withNewNames("mortality", current), current, "new names are left as they are");
// Ids: made when the form is checked at Save (device), required when saving, so a resend is stored once.
const sampled = samplingForm.parse({ fish: [{ wt: "1" }] });
assert.match(sampled.id, /^[0-9a-f-]{36}$/);
assert.match(sampled.fish[0].id, /^[0-9a-f-]{36}$/);
bad(samplingSchema, { fish: [{ wt: "1" }] });

// Recorded-at, device side: wall-clock time on the operator's device (Penang) -> that instant.
// Empty (not set yet) or half-set values are refused, so a record can't save without one.
process.env.TZ = "Asia/Kuala_Lumpur";
const at = recordedAtLocal.parse("2026-10-09T08:00");
assert.equal(at.toISOString(), "2026-10-09T00:00:00.000Z");
for (const v of ["", "not a date", "T08:00", "2026-10-09T"]) assert.ok(!recordedAtLocal.safeParse(v).success, v);
// Save side: only instants. An offset-less string would shift by the server's timezone, so it's rejected.
assert.equal(
  mortalitySchema.parse({ ...base, recordedAt: at, species: "ON", mortalityCount: "1" }).recordedAt.getTime(),
  at.getTime(),
);
assert.equal(
  mortalitySchema
    .parse({ ...base, recordedAt: "2026-10-09T08:00:00+08:00", species: "ON", mortalityCount: "1" })
    .recordedAt.toISOString(),
  "2026-10-09T00:00:00.000Z",
);
bad(mortalitySchema, { recordedAt: "2026-10-09T08:00", species: "ON", mortalityCount: "1" });
bad(mortalitySchema, { recordedAt: "", species: "ON", mortalityCount: "1" });
// Never in the future, beyond a few minutes' grace for a device clock ahead of the server's.
const fromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
bad(mortalitySchema, { recordedAt: fromNow(60), species: "ON", mortalityCount: "1" });
ok(mortalitySchema, { recordedAt: fromNow(1), species: "ON", mortalityCount: "1" });

// The device-made id is required on save: without it a resend would be stored twice.
bad(mortalitySchema, { id: undefined, species: "ON", mortalityCount: "1" });
bad(mortalitySchema, { id: "1", species: "ON", mortalityCount: "1" });

console.log("validation ranges OK");
