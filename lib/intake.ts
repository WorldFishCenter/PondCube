import { getTableColumns } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { wqReadings, feedingEvents, mortalityEvents, samplingEvents, fishMeasurements } from "./schema";
import { waterQualitySchema, feedingSchema, mortalitySchema, samplingSchema } from "./validation";

// Record intake: validate a record of a given kind and persist it, all-or-nothing.
//   createRecordIntake(write).save(kind, input)
// Throws a ZodError for invalid input (nothing written) and rejects on unknown kinds.
// Callers own access checks; intake owns kind → table, validation, and atomic writes.

const RECORDS = {
  wq: { schema: waterQualitySchema, table: wqReadings },
  feeding: { schema: feedingSchema, table: feedingEvents },
  mortality: { schema: mortalitySchema, table: mortalityEvents },
  sampling: { schema: samplingSchema, table: samplingEvents }, // plus its fish measurements
} as const;

export type RecordKind = keyof typeof RECORDS;
/** What a caller sends for a kind: the save schema's input (form values + who/where + instant). */
export type RecordInput<K extends RecordKind> = z.input<(typeof RECORDS)[K]["schema"]>;

/** Rows for one table. A write is a list of these, applied all-or-nothing. */
export type Insert = { table: PgTable; rows: Record<string, unknown>[] };
/** The seam to the database. Adapters: neonWriter (production), a PGLite transaction (tests). */
export type AtomicWriter = (inserts: Insert[]) => Promise<void>;

// Parsed records insert as-is, and drizzle silently drops keys that aren't columns, so a renamed
// field would compile and lose data. Checked once at load: a mismatch fails every build and test.
for (const [kind, { schema, table }] of Object.entries(RECORDS)) {
  const columns = new Set(Object.keys(getTableColumns(table)));
  const stray = Object.keys(schema.shape).filter((key) => key !== "fish" && !columns.has(key));
  if (stray.length) throw new Error(`Record intake: ${kind} fields with no ${kind} column: ${stray.join(", ")}`);
}

export function createRecordIntake(write: AtomicWriter) {
  return {
    async save<K extends RecordKind>(kind: K, input: RecordInput<K>): Promise<void> {
      if (!Object.hasOwn(RECORDS, kind)) throw new Error(`Unknown record kind: ${String(kind)}`);
      if (kind === "sampling") return write(samplingInserts(samplingSchema.parse(input)));
      const { schema, table } = RECORDS[kind];
      return write([{ table, rows: [schema.parse(input)] }]);
    },
  };
}

// A sampling event and its fish measurements: the id is made here so both go in one write.
function samplingInserts({ fish, ...event }: z.output<typeof samplingSchema>): Insert[] {
  const id = crypto.randomUUID();
  const measured: (typeof fishMeasurements.$inferInsert)[] = fish
    .filter((f) => f.weightG !== undefined || f.lengthCm !== undefined) // schema guarantees ≥ 1
    .map((f) => ({ samplingEventId: id, weightG: f.weightG, lengthCm: f.lengthCm }));
  const eventRow: typeof samplingEvents.$inferInsert = { ...event, id };
  return [
    { table: samplingEvents, rows: [eventRow] },
    { table: fishMeasurements, rows: measured },
  ];
}

/** Production adapter: Neon over HTTP. batch = one round trip, run as a transaction. */
export const neonWriter =
  (db: NeonHttpDatabase): AtomicWriter =>
  async (inserts) => {
    const [first, ...rest] = inserts.map(({ table, rows }) => db.insert(table).values(rows));
    await db.batch([first, ...rest]);
  };
