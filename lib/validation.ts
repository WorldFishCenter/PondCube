import { z } from "zod";
import { CAUSES, PERIODS } from "./options";

// Reads what's typed, the same on every device (NaN fails z.number). "1,500" is refused only where it could be thousands.
const toNumber = (max: number) => (v: unknown) => {
  if (typeof v !== "string") return v ?? undefined;
  const text = v.trim();
  if (!text) return undefined;
  if (max >= 1000 && /^[-+]?[1-9]\d{0,2},\d{3}$/.test(text)) return NaN;
  const decimal = text.replace(/,(?=\d*$)/, ".");
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(decimal) ? Number(decimal) : NaN;
};

// One source for choice values: the option lists the UI renders.
const enumOf = <T extends readonly { value: string }[]>(options: T, error?: string) =>
  z.enum(options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]], error ? { error } : undefined);

// One source for ranges: the schema enforces them, the form shows them as hints.
export const RANGES = {
  dissolvedOxygen: [0, 20],
  temperature: [0, 45],
  ph: [0, 14],
  ammonia: [0, 100],
  nitrite: [0, 100],
  nitrate: [0, 500],
  wt: [0, 20000], // DMS trait WT, g (Range from the v3 trait table)
  lenSt: [0, 100], // DMS v5 trait LEN_ST, cm
  feedWeight: [0, 15000], // g of one Feed per day: the 2025 pond book's bound
} as const;

// Optional decimal. int: counts map to integer DB columns, so reject decimals here rather than at insert.
const optNum = (min?: number, max?: number, int = false) => {
  let s = z.number({ error: "Must be a number" });
  if (int) s = s.int("Must be a whole number");
  if (min !== undefined) s = s.min(min, `Expected ${min}–${max}`);
  if (max !== undefined) s = s.max(max, `Expected ${min}–${max}`);
  return z.preprocess(toNumber(max ?? Infinity), s.optional());
};

// A blank note is no note: stored as null, never "".
const note = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v : undefined));

const reqNum = (min: number, max: number, label: string, int = false) => {
  let s = z.number({
    error: (iss) => (iss.input === undefined ? `${label} is required` : `${label} must be a number`),
  });
  if (int) s = s.int(`${label} must be a whole number`);
  return z.preprocess(
    toNumber(max),
    s.min(min, `${label}: expected ${min}–${max}`).max(max, `${label}: expected ${min}–${max}`),
  );
};

// Recorded-at has two rules, one per side:
// - Device: the local "YYYY-MM-DDTHH:mm" value (set in the app shell, shared by all record kinds) has
//   no offset, so it's read in the operator's timezone, on their device, before each save.
// - Save: the server (UTC on Vercel) accepts only an instant, a Date or an ISO string with an offset
//   or Z. An offset-less string would silently shift by the server's timezone, so it's rejected.
// - Both: never in the future (isFuture).
export const recordedAtLocal = z.coerce.date({ error: "Enter a valid date & time" });
/** Later than now, with a few minutes' grace for a device clock ahead of the server's. */
export const isFuture = (at: Date) => at.getTime() > Date.now() + 5 * 60_000;
const recordedAtInstant = z
  .union([z.date(), z.iso.datetime({ offset: true })], {
    error: "Recorded-at must be an instant (Date, or ISO with offset)",
  })
  .pipe(z.coerce.date())
  .refine((at) => !isFuture(at), "Recorded-at can't be in the future");

// Each record type has a form schema (what the operator fills in, checked on the device) and a
// save schema (form + who/where + recorded-at instant, re-checked by record intake before insert).
// Where is the Pond picked in the app shell; who is the Person, added on the server.
// Ids are made on the device when Save checks the form, and required on save: intake skips a resend.
const madeAtSave = () => z.uuid().default(() => crypto.randomUUID());
const forSave = {
  id: z.uuid(),
  pondCode: z.string().min(1, "Select a pond"),
  person: z.string().min(1),
  recordedAt: recordedAtInstant,
};

export const waterQualityForm = z.object({
  id: madeAtSave(),
  period: enumOf(PERIODS, "Select time of day"),
  dissolvedOxygen: reqNum(...RANGES.dissolvedOxygen, "Oxygen"), // as its field is labelled
  temperature: reqNum(...RANGES.temperature, "Temperature"),
  ph: optNum(...RANGES.ph),
  ammonia: optNum(...RANGES.ammonia),
  nitrite: optNum(...RANGES.nitrite),
  nitrate: optNum(...RANGES.nitrate),
  remarks: note,
  replaces: z.preprocess((v) => v || undefined, z.uuid().optional()), // a correction: the reading it replaces
});
export const waterQualitySchema = waterQualityForm.extend(forSave);

export const feedingForm = z.object({
  id: madeAtSave(),
  feed: z.string({ error: "Select a feed" }).min(1, "Select a feed"), // of the pond's site: refusal() checks that
  feedWeight: reqNum(...RANGES.feedWeight, "Feed weight (g)").refine(
    (v) => v !== 0,
    "Feed weight (g) must be more than 0",
  ),
  remarks: note,
});
export const feedingSchema = feedingForm.extend(forSave);

export const mortalityForm = z.object({
  id: madeAtSave(),
  mortalityCount: reqNum(0, 1000000, "Number of dead fish", true),
  causeDeath: enumOf(CAUSES).optional(),
  noteDeath: note,
});
export const mortalitySchema = mortalityForm.extend(forSave);

// A fish never weighs or measures 0, though the DMS Range starts there.
const trait = (range: readonly [number, number]) => optNum(...range).refine((v) => v !== 0, "Must be more than 0");
const fishMeasurements = <Id extends z.ZodType<string>>(id: Id) =>
  z
    .array(z.object({ id, wt: trait(RANGES.wt), lenSt: trait(RANGES.lenSt) }))
    .refine(
      (fish) => fish.some((f) => f.wt !== undefined || f.lenSt !== undefined),
      "Add at least one fish measurement",
    );

export const samplingForm = z.object({
  id: madeAtSave(),
  notes: note,
  fish: fishMeasurements(madeAtSave()),
});
export const samplingSchema = samplingForm.extend({ ...forSave, fish: fishMeasurements(z.uuid()) });

/** The Record kinds. Record intake adds each one's table and the app each one's tab, checked complete by the compiler. */
export const RECORD_KINDS = {
  wq: { form: waterQualityForm, save: waterQualitySchema },
  feeding: { form: feedingForm, save: feedingSchema },
  mortality: { form: mortalityForm, save: mortalitySchema },
  sampling: { form: samplingForm, save: samplingSchema },
} as const;
export type RecordKind = keyof typeof RECORD_KINDS;

// Drafts and Outbox Records saved before 0.8.0 carry the fields' earlier names: read them under the DMS v5 ones.
// A value with no new field (an old feed type, an old cause the DMS lacks) goes in the note, as in the database.
// Feeding before 0.12.0 was kg per feeding with a number of feedings: now g per Feed, the number in the remarks.
const OLD_CAUSES: Record<string, string> = {
  disease: "Disease_parasites",
  handling: "Handling_mortality",
  water_quality: "Water_quality",
  unknown: "Unknown",
};
const joinNotes = (...notes: unknown[]) => notes.filter(Boolean).join("; ");
// A Draft holds typed text, an Outbox Record a number; blank or unreadable text stays as typed.
const kgToGrams = (kg: unknown) => {
  const n = toNumber(Infinity)(kg);
  if (typeof n !== "number" || Number.isNaN(n)) return kg;
  const g = Math.round(n * 1e6) / 1e3; // 2.3 * 1000 is 2299.9999999999995
  return typeof kg === "string" ? String(g) : g;
};
export function withNewNames(kind: string, fields: Record<string, unknown>): Record<string, unknown> {
  if (kind === "mortality" && ("suspectedCause" in fields || "remarks" in fields)) {
    const { suspectedCause: cause, remarks, ...rest } = fields;
    const causeDeath = OLD_CAUSES[String(cause)];
    return { ...rest, causeDeath, noteDeath: joinNotes(remarks, cause && !causeDeath && `Cause: ${cause}`) };
  }
  if (kind === "feeding" && ["feedType", "feedTypeOther", "feedAmountKg", "feedingsCount"].some((f) => f in fields)) {
    const { feedType: type, feedTypeOther: other, feedAmountKg: kg, feedingsCount: count, ...rest } = fields;
    return {
      ...rest,
      ...(kg !== undefined && { feedWeight: kgToGrams(kg) }),
      remarks: joinNotes(
        rest.remarks,
        type && `Feed type: ${(type === "other" && other) || type}`,
        (count ?? "") !== "" && `Number of feedings: ${count}`,
      ),
    };
  }
  if (kind === "sampling" && Array.isArray(fields.fish))
    return {
      ...fields,
      fish: fields.fish.map(({ weightG, lengthCm, ...fish }) =>
        weightG === undefined && lengthCm === undefined ? fish : { ...fish, wt: weightG, lenSt: lengthCm },
      ),
    };
  return fields;
}
