import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { refresh } from "next/cache";

// v1 has no logins: one shared site code (ACCESS_CODE), entered once per device.
// The cookie holds a hash of the code, so changing ACCESS_CODE locks out every device.
// ponytail: no rate limit on unlock; use a long code, add a Vercel Firewall rate limit if it's guessed at.
const COOKIE = "pondcube_access";
const ONE_YEAR = 60 * 60 * 24 * 365;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function expectedHash() {
  const code = process.env.ACCESS_CODE;
  if (!code) throw new Error("ACCESS_CODE is not set. Add it to .env (and per environment on Vercel).");
  return hash(code);
}

const matches = (candidateHash: string) => timingSafeEqual(Buffer.from(candidateHash), Buffer.from(expectedHash()));

export async function hasAccess() {
  const value = (await cookies()).get(COOKIE)?.value;
  return value?.length === 64 && matches(value);
}

// For server actions. A device whose cookie is missing or outdated (code rotated) gets false, and its
// page is refreshed so it swaps to the unlock screen. (redirect("/") to the same URL can be served
// from the client router cache and leave the stale app showing.)
export async function canSave() {
  if (await hasAccess()) return true;
  refresh();
  return false;
}

export async function grantAccess(code: string) {
  if (!matches(hash(code))) return false;
  (await cookies()).set(COOKIE, expectedHash(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return true;
}
