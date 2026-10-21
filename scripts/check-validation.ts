// Range self-check for lib/validation.ts (shared by the device and app/api/records). Run: npx tsx scripts/check-validation.ts
import assert from "node:assert/strict";
import {
  waterQualitySchema,
  feedingSchema,
  mortalitySchema,
  recordedAtLocal,
  samplingForm,
  samplingSchema,
} from "../lib/validation";

const base = {
  id: "0b6f1a4e-5d1c-4f3a-9a57-2c8e7d3b9f10",
  pondCode: "PEN-HAT-001",
  enumerator: "Operator 1",
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

ok(feedingSchema, { feedAmountKg: "0", feedingsCount: "3" });
bad(feedingSchema, { feedAmountKg: "-1" });
bad(feedingSchema, { feedAmountKg: "2", feedingsCount: "-1" });
bad(feedingSchema, { feedAmountKg: "2", feedingsCount: "1.5" });

ok(mortalitySchema, { mortalityCount: "0" });
bad(mortalitySchema, { mortalityCount: "-1" });
bad(mortalitySchema, { mortalityCount: "2.5" });
ok(mortalitySchema, { mortalityCount: "1", suspectedCause: "water_quality" }); // enums come from lib/options
bad(mortalitySchema, { mortalityCount: "1", suspectedCause: "aliens" });

const fishId = base.id; // any uuid
ok(samplingSchema, {
  fish: [
    { id: fishId, weightG: "120", lengthCm: "18" },
    { id: fishId, weightG: "", lengthCm: "" },
  ],
});
bad(samplingSchema, { fish: [] });
bad(samplingSchema, { fish: [{ id: fishId, weightG: "", lengthCm: "" }] }); // blank rows only -> no empty sampling events
bad(samplingSchema, { fish: [{ id: fishId, weightG: "-5" }] });
// Ids: made when the form is checked at Save (device), required when saving, so a resend is stored once.
const sampled = samplingForm.parse({ fish: [{ weightG: "1" }] });
assert.match(sampled.id, /^[0-9a-f-]{36}$/);
assert.match(sampled.fish[0].id, /^[0-9a-f-]{36}$/);
bad(samplingSchema, { fish: [{ weightG: "1" }] });

// Recorded-at, device side: wall-clock time on the operator's device (Penang) -> that instant.
// Empty (not set yet) or half-set values are refused, so a record can't save without one.
process.env.TZ = "Asia/Kuala_Lumpur";
const at = recordedAtLocal.parse("2026-10-09T08:00");
assert.equal(at.toISOString(), "2026-10-09T00:00:00.000Z");
for (const v of ["", "not a date", "T08:00", "2026-10-09T"]) assert.ok(!recordedAtLocal.safeParse(v).success, v);
// Save side: only instants. An offset-less string would shift by the server's timezone, so it's rejected.
assert.equal(
  mortalitySchema.parse({ ...base, recordedAt: at, mortalityCount: "1" }).recordedAt.getTime(),
  at.getTime(),
);
assert.equal(
  mortalitySchema
    .parse({ ...base, recordedAt: "2026-10-09T08:00:00+08:00", mortalityCount: "1" })
    .recordedAt.toISOString(),
  "2026-10-09T00:00:00.000Z",
);
bad(mortalitySchema, { recordedAt: "2026-10-09T08:00", mortalityCount: "1" });
bad(mortalitySchema, { recordedAt: "", mortalityCount: "1" });

// The device-made id is required on save: without it a resend would be stored twice.
bad(mortalitySchema, { id: undefined, mortalityCount: "1" });
bad(mortalitySchema, { id: "1", mortalityCount: "1" });

console.log("validation ranges OK");
