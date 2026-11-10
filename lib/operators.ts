import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn, PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { feed, fert, operators, pond, treatment } from "./schema";

// Operator access: a signed-in account is an Operator when its verified primary email matches an
// active operator (emails are edited in Airtable and synced). The match names the Person and the
// Operator's sites, the only ones whose ponds they record.
// No server-only import, so scripts/check-access.ts can test it; lib/access.ts wires in Clerk.

/** How emails are compared everywhere: Airtable sync stores them this way, sign-in looks them up this way. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/** `account` is the sign-in account's id: stable when the Operator is renamed in Airtable. `sites`: the only
 * sites whose ponds the Operator sees and records. */
export type Access = "signedOut" | "notOnList" | { operator: string; account: string; sites: string[] };
type Operator = { name: string; sites: string[] };
type Account = {
  id: string;
  primaryEmailAddress: { emailAddress: string; verification: { status: string } | null } | null;
};

/** The account's access; `operatorByEmail` looks up an active operator by normalised email. */
export async function accessFor(
  account: Account | null,
  operatorByEmail: (email: string) => Promise<Operator | null>,
): Promise<Access> {
  if (!account) return "signedOut";
  const email = account.primaryEmailAddress;
  if (email?.verification?.status !== "verified") return "notOnList";
  const operator = await operatorByEmail(normaliseEmail(email.emailAddress));
  return operator ? { operator: operator.name, account: account.id, sites: operator.sites } : "notOnList";
}

/** The active operator with this normalised email (name and sites), or null. */
export async function findOperator(db: PgDatabase<PgQueryResultHKT>, email: string): Promise<Operator | null> {
  const [row] = await db
    .select({ name: operators.name, sites: operators.sites })
    .from(operators)
    .where(and(eq(operators.email, email), eq(operators.active, true)));
  return row ?? null;
}

/** Why an Operator with these sites can't record this Record, or null: its pond must be at one, and its feed,
 * fertiliser or treatment used there. */
export async function refusal(
  db: PgDatabase<PgQueryResultHKT>,
  sites: string[],
  record: { pondCode?: unknown; feed?: unknown; fert?: unknown; treatment?: unknown } | null,
): Promise<string | null> {
  const pondCode = String(record?.pondCode);
  const code = (v: unknown) => (v ? String(v) : "");
  const [feedCode, fertCode, treatmentCode] = [code(record?.feed), code(record?.fert), code(record?.treatment)];
  const usedHere = (column: AnyPgColumn, sitesColumn: AnyPgColumn, value: string) =>
    and(eq(column, value), sql`${pond.site} = any(${sitesColumn})`);
  // One round trip: the pond's site, and each item named when that site uses it.
  const [here] = await db
    .select({ site: pond.site, feed: feed.feed, fert: fert.fert, treatment: treatment.treatment })
    .from(pond)
    .leftJoin(feed, usedHere(feed.feed, feed.sites, feedCode))
    .leftJoin(fert, usedHere(fert.fert, fert.sites, fertCode))
    .leftJoin(treatment, usedHere(treatment.treatment, treatment.sites, treatmentCode))
    .where(eq(pond.pondCode, pondCode));
  if (!here || !sites.includes(here.site)) return `Pond ${pondCode} isn't at your site`;
  if (feedCode && !here.feed) return `Feed ${feedCode} isn't used at this pond's site`;
  if (fertCode && !here.fert) return `Fertiliser ${fertCode} isn't used at this pond's site`;
  return treatmentCode && !here.treatment ? `Treatment ${treatmentCode} isn't used at this pond's site` : null;
}
