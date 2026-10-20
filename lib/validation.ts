import { z } from "zod";
import { CAUSES, FEED_TYPES, PERIODS } from "./options";

// Inputs give "" for empty; anything else becomes a Number (NaN then fails z.number).
const toNumber = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));

// One source for choice values: the option lists the UI renders.
const enumOf = <T extends readonly { value: string }[]>(options: T, error?: string) =>
  z.enum(options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]], error ? { error } : undefined);

// One source for water-quality ranges: the schema enforces them, the form shows them as hints.
export const RANGES = {
  dissolvedOxygen: [0, 20],
  temperature: [0, 45],
  ph: [0, 14],
  ammonia: [0, 100],
  nitrite: [0, 100],
  nitrate: [0, 500],
} as const;

// Optional decimal. int: counts map to integer DB columns, so reject decimals here rather than at insert.
const optNum = (min?: number, max?: number, int = false) => {
  let s = z.number({ error: "Must be a number" });
  if (int) s = s.int("Must be a whole number");
  if (min !== undefined) s = s.min(min, `Must be ≥ ${min}`);
  if (max !== undefined) s = s.max(max, `Must be ≤ ${max}`);
  return z.preprocess(toNumber, s.optional());
};

const reqNum = (min: number, max: number, label: string, int = false) => {
  let s = z.number({
    error: (iss) => (iss.input === undefined ? `${label} is required` : `${label} must be a number`),
  });
  if (int) s = s.int(`${label} must be a whole number`);
  return z.preprocess(
    toNumber,
    s.min(min, `${label}: expected ${min}–${max}`).max(max, `${label}: expected ${min}–${max}`),
  );
};

// Recorded-at has two rules, one per side:
// - Device: the local "YYYY-MM-DDTHH:mm" value (set in the app shell, shared by all record kinds) has
//   no offset, so it's read in the operator's timezone, on their device, before each save.
// - Save: the server (UTC on Vercel) accepts only an instant, a Date or an ISO string with an offset
//   or Z. An offset-less string would silently shift by the server's timezone, so it's rejected.
export const recordedAtLocal = z.coerce.date({ error: "Enter a valid date & time" });
const recordedAtInstant = z
  .union([z.date(), z.iso.datetime({ offset: true })], {
    error: "Recorded-at must be an instant (Date, or ISO with offset)",
  })
  .pipe(z.coerce.date());

// Each record type has a form schema (what the operator fills in, checked on the device) and a
// save schema (form + who/where + recorded-at instant, re-checked by record intake before insert).
// Where is the Pond picked in the app shell; who is the Enumerator, added on the server.
const forSave = {
  pondCode: z.string().min(1, "Select a pond"),
  enumerator: z.string().min(1),
  recordedAt: recordedAtInstant,
};

export const waterQualityForm = z.object({
  period: enumOf(PERIODS, "Select time of day"),
  dissolvedOxygen: reqNum(...RANGES.dissolvedOxygen, "Dissolved oxygen"),
  temperature: reqNum(...RANGES.temperature, "Temperature"),
  ph: optNum(...RANGES.ph),
  ammonia: optNum(...RANGES.ammonia),
  nitrite: optNum(...RANGES.nitrite),
  nitrate: optNum(...RANGES.nitrate),
  remarks: z.string().optional(),
});
export const waterQualitySchema = waterQualityForm.extend(forSave);

export const feedingForm = z.object({
  feedType: enumOf(FEED_TYPES).optional(),
  feedTypeOther: z.string().optional(),
  feedAmountKg: reqNum(0, 100000, "Amount fed (kg)"),
  feedingsCount: optNum(0, 100, true),
  remarks: z.string().optional(),
});
export const feedingSchema = feedingForm.extend(forSave);

export const mortalityForm = z.object({
  mortalityCount: reqNum(0, 1000000, "Number of dead fish", true),
  suspectedCause: enumOf(CAUSES).optional(),
  remarks: z.string().optional(),
});
export const mortalitySchema = mortalityForm.extend(forSave);

export const samplingForm = z.object({
  notes: z.string().optional(),
  fish: z
    .array(z.object({ weightG: optNum(0.0001, 1000000), lengthCm: optNum(0.0001, 1000) }))
    .refine(
      (fish) => fish.some((f) => f.weightG !== undefined || f.lengthCm !== undefined),
      "Add at least one fish measurement",
    ),
});
export const samplingSchema = samplingForm.extend(forSave);

/** The Record kinds. Record intake adds each one's table and the app each one's tab, checked complete by the compiler. */
export const RECORD_KINDS = {
  wq: { form: waterQualityForm, save: waterQualitySchema },
  feeding: { form: feedingForm, save: feedingSchema },
  mortality: { form: mortalityForm, save: mortalitySchema },
  sampling: { form: samplingForm, save: samplingSchema },
} as const;
export type RecordKind = keyof typeof RECORD_KINDS;
