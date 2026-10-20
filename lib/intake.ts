import { getTableColumns } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { wqReadings, feedingEvents, mortalityEvents, samplingEvents, fishMeasurements } from "./schema";
import { RECORD_KINDS, samplingSchema, type RecordKind } from "./validation";

// Record intake: validate a record of a given kind and persist it, all-or-nothing.
//   createRecordIntake(write, appVersion).save(kind, input, enumerator)
// Throws a ZodError for invalid input (nothing written) and rejects on unknown kinds.
// Callers own access checks and name the Enumerator; intake owns kind → table, validation, and atomic writes.

const TABLES = {
  wq: wqReadings,
  feeding: feedingEvents,
  mortality: mortalityEvents,
  sampling: samplingEvents, // plus its fish measurements
} satisfies Record<RecordKind, PgTable>;

/** Rows for one table. A write is a list of these, applied all-or-nothing. */
export type Insert = { table: PgTable; rows: Record<string, unknown>[] };
/** The seam to the database. Adapters: neonWriter (production), a PGLite transaction (tests). */
export type AtomicWriter = (inserts: Insert[]) => Promise<void>;

// Parsed records insert as-is, and drizzle silently drops keys that aren't columns, so a renamed
// field would compile and lose data. Checked once at load: a mismatch fails every build and test.
for (const [kind, table] of Object.entries(TABLES)) {
  const columns = new Set(Object.keys(getTableColumns(table)));
  const shape = RECORD_KINDS[kind as RecordKind].save.shape;
  const stray = Object.keys(shape).filter((key) => key !== "fish" && !columns.has(key));
  if (stray.length) throw new Error(`Record intake: ${kind} fields with no ${kind} column: ${stray.join(", ")}`);
}

/** `appVersion` is the server's version, stamped on every record so it can be traced to the code that saved it. */
export function createRecordIntake(write: AtomicWriter, appVersion: string) {
  return {
    /** `input` is what the device sent (untrusted); `enumerator` is the signed-in Operator and wins over it. */
    async save(kind: RecordKind, input: unknown, enumerator: string): Promise<void> {
      if (!Object.hasOwn(RECORD_KINDS, kind)) throw new Error(`Unknown record kind: ${String(kind)}`);
      const record = { ...(input as object), enumerator };
      if (kind === "sampling") return write(samplingInserts(samplingSchema.parse(record), appVersion));
      return write([{ table: TABLES[kind], rows: [{ ...RECORD_KINDS[kind].save.parse(record), appVersion }] }]);
    },
  };
}

// A sampling event and its fish measurements: the id is made here so both go in one write.
function samplingInserts({ fish, ...event }: z.output<typeof samplingSchema>, appVersion: string): Insert[] {
  const id = crypto.randomUUID();
  const measured: (typeof fishMeasurements.$inferInsert)[] = fish
    .filter((f) => f.weightG !== undefined || f.lengthCm !== undefined) // schema guarantees ≥ 1
    .map((f) => ({ samplingEventId: id, weightG: f.weightG, lengthCm: f.lengthCm }));
  const eventRow: typeof samplingEvents.$inferInsert = { ...event, id, appVersion };
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
