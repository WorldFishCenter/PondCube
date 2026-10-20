import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { getOperatorName } from "./data";
import { accessFor } from "./operators";

// Operator access (lib/operators.ts) for the signed-in Clerk account.
// ponytail: currentUser() is a Backend API call per page load and save; move the email into the
// session token's claims if Clerk's rate limit is ever hit.
export const signedInAccess = async () => accessFor(await currentUser(), getOperatorName);

// For server actions. A device that's signed out (or whose account left the operator list) gets
// null, and its page is refreshed so it swaps to the sign-in screen. (redirect("/") to the same URL
// can be served from the client router cache and leave the stale app showing.)
export async function operatorForSave() {
  const access = await signedInAccess();
  if (typeof access === "object") return access.operator;
  refresh();
  return null;
}
