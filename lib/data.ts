import "server-only";
import { cacheLife } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { assets, operators } from "./schema";

// Page reads live here, not in actions.ts: every export of a "use server" file is a public endpoint.
// Cached so the page prerenders and skips Neon on each request; DB edits show up within ~1 minute.

/** The active operator with this (lowercase) email, by name, or null. */
export async function getOperatorName(email: string) {
  "use cache";
  cacheLife("minutes");
  const [row] = await db
    .select({ name: operators.name })
    .from(operators)
    .where(and(eq(operators.email, email), eq(operators.active, true)));
  return row?.name ?? null;
}

export async function getPonds() {
  "use cache";
  cacheLife("minutes");
  return db
    .select({ pondCode: assets.pondCode, displayName: assets.displayName })
    .from(assets)
    .where(eq(assets.status, "active"))
    .orderBy(asc(assets.pondCode));
}
