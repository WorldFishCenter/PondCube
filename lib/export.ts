import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, getViewSelectedFields, inArray, like, max, min, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgView } from "drizzle-orm/pg-core";
import { accessFor, type Access } from "./operators";
import { dataLinks, feedingView, mortalityView, pondView, PROVISIONAL as P, samplingView, wqView } from "./schema";

// Seeing the data: the one reader behind the download and the data link, and the data link's keys.
// No server-only import, so scripts/check-export.ts can test it; lib/access.ts wires in Clerk.

type Db = PgDatabase<PgQueryResultHKT>;

/** The views people can read, by the name the routes use. */
export const VIEWS = {
  wq: wqView,
  feeding: feedingView,
  mortality: mortalityView,
  sampling: samplingView,
  ponds: pondView,
};
export type ViewName = keyof typeof VIEWS;
/** A row of a view, keyed by column name (the export header in lowercase). */
export type Row<N extends ViewName> =
  (typeof VIEWS)[N] extends PgView<string, boolean, infer F>
    ? { [K in keyof F]: F[K] extends SQL.Aliased<infer T> ? T : never }
    : never;

/** A view's column names, in order. */
export const columnsOf = (name: ViewName) => Object.keys(getViewSelectedFields(VIEWS[name]));

/**
 * Rows of a view from `sites` only: the Operator's, worked out on this request as for recording. The only place
 * rows are filtered by site. `only` narrows to one site and a site-local date prefix (YYYYMM a month, YYYY a year).
 */
export async function readRows<N extends ViewName>(
  db: Db,
  name: N,
  sites: string[],
  only: { site?: string; date?: string } = {},
): Promise<Row<N>[]> {
  const view = VIEWS[name] as typeof wqView; // every view has site and pond; all but ponds a date and time
  const dated = columnsOf(name).includes("date"); // `in` doesn't see through the view's proxy
  // ponytail: a date prefix scans the view (to_char can't use an index); filter a recorded_at range once years of
  // history make downloads slow.
  const rows = await db
    .select()
    .from(view)
    .where(
      and(
        inArray(view.site, sites),
        only.site ? eq(view.site, only.site) : undefined,
        only.date && dated ? like(view.date, `${only.date}%`) : undefined,
      ),
    )
    .orderBy(...(dated ? [asc(view.date), asc(view.time)] : [asc(view.site)]), asc(view[P.pond_code]));
  return rows as unknown as Row<N>[];
}

/** Every row of a view from `sites`, a site-local year at a time, oldest first: a CSV never holds all years at once. */
export async function* rowsByYear<N extends ViewName>(db: Db, name: N, sites: string[]): AsyncGenerator<Row<N>[]> {
  if (!columnsOf(name).includes("date")) return yield await readRows(db, name, sites);
  const view = VIEWS[name] as typeof wqView;
  // The years of every site: only readRows filters by site, and a year without rows costs an empty read.
  const [{ first, last }] = await db.select({ first: min(view.date), last: max(view.date) }).from(view);
  if (!first || !last) return;
  for (let year = +first.slice(0, 4); year <= +last.slice(0, 4); year++)
    yield await readRows(db, name, sites, { date: String(year) });
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new data link key for this sign-in account, replacing (so revoking) its earlier one. Only its hash is kept. */
export async function replaceDataLink(db: Db, account: string): Promise<string> {
  const key = randomBytes(32).toString("base64url");
  const link = { account, keyHash: hash(key), createdAt: new Date() };
  await db.insert(dataLinks).values(link).onConflictDoUpdate({ target: dataLinks.account, set: link });
  return key;
}

/** Access for a data link key: its sign-in account, checked as at sign-in, so a deactivated Operator gets nothing. */
export async function dataLinkAccess(
  db: Db,
  key: string,
  accountById: (id: string) => Promise<Parameters<typeof accessFor>[0]>,
  operatorByEmail: Parameters<typeof accessFor>[1],
): Promise<Access> {
  const [link] = await db
    .select()
    .from(dataLinks)
    .where(eq(dataLinks.keyHash, hash(key)));
  return link ? accessFor(await accountById(link.account), operatorByEmail) : "signedOut";
}

/** Pages of rows as CSV (RFC 4180, upper-case headers, blank for empty), streamed a page at a time. */
export function csv(columns: string[], pages: AsyncIterable<Record<string, unknown>[]>) {
  const field = (v: unknown) =>
    v == null ? "" : /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const line = (values: unknown[]) => values.map(field).join(",") + "\r\n";
  const encoder = new TextEncoder();
  const next = pages[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    start: (stream) => stream.enqueue(encoder.encode(line(columns.map((c) => c.toUpperCase())))),
    async pull(stream) {
      const page = await next.next();
      if (page.done) return stream.close();
      stream.enqueue(encoder.encode(page.value.map((r) => line(columns.map((c) => r[c]))).join("")));
    },
  });
}
