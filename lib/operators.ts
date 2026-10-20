import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { operators } from "./schema";

// Operator access: a signed-in account is an Operator when its verified primary email matches an
// active operator (emails are edited in Airtable and synced). The match names the Enumerator.
// No server-only import, so scripts/check-access.ts can test it; lib/access.ts wires in Clerk.

/** How emails are compared everywhere: Airtable sync stores them this way, sign-in looks them up this way. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export type Access = "signedOut" | "notOnList" | { operator: string };
type Account = { primaryEmailAddress: { emailAddress: string; verification: { status: string } | null } | null };

/** The account's access; `operatorByEmail` looks up an active operator's name by normalised email. */
export async function accessFor(
  account: Account | null,
  operatorByEmail: (email: string) => Promise<string | null>,
): Promise<Access> {
  if (!account) return "signedOut";
  const email = account.primaryEmailAddress;
  if (email?.verification?.status !== "verified") return "notOnList";
  const operator = await operatorByEmail(normaliseEmail(email.emailAddress));
  return operator ? { operator } : "notOnList";
}

/** The active operator with this normalised email, by name, or null. */
export async function findOperator(db: PgDatabase<PgQueryResultHKT>, email: string) {
  const [row] = await db
    .select({ name: operators.name })
    .from(operators)
    .where(and(eq(operators.email, email), eq(operators.active, true)));
  return row?.name ?? null;
}
