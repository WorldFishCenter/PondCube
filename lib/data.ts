import "server-only";
import { cacheLife } from "next/cache";
import { and, arrayOverlaps, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { findOperator } from "./operators";
import { feed, pond } from "./schema";

// Page reads. Cached so the page prerenders and skips Neon on each request; DB edits show up within ~1 minute.

/** The active operator with this (normalised) email (name and sites), or null. */
export async function getOperator(email: string) {
  "use cache";
  cacheLife("minutes");
  return findOperator(db, email);
}

/** Active ponds at these sites. */
export async function getPonds(sites: string[]) {
  "use cache";
  cacheLife("minutes");
  return db
    .select({ pondCode: pond.pondCode, displayName: pond.displayName, site: pond.site, area: pond.area })
    .from(pond)
    .where(and(eq(pond.status, "active"), inArray(pond.site, sites)))
    .orderBy(asc(pond.pondCode));
}

/** Feeds used at any of these sites, with the sites that use each. */
export async function getFeeds(sites: string[]) {
  "use cache";
  cacheLife("minutes");
  return db
    .select({ feed: feed.feed, noteFeed: feed.noteFeed, sites: feed.sites })
    .from(feed)
    .where(arrayOverlaps(feed.sites, sites))
    .orderBy(asc(feed.feed));
}
