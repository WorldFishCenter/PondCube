import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { getOperatorName } from "./data";

// Each Operator signs in with their own Clerk account. Access = its verified primary email matches
// an active operator (emails are edited in Airtable and synced). The match names the Enumerator.
// ponytail: currentUser() is a Backend API call per page load and save; move the email into the
// session token's claims if Clerk's rate limit is ever hit.
export async function signedInOperator() {
  const email = (await currentUser())?.primaryEmailAddress;
  if (email?.verification?.status !== "verified") return null;
  return getOperatorName(email.emailAddress.toLowerCase());
}

// For server actions. A device that's signed out (or whose account left the operator list) gets
// null, and its page is refreshed so it swaps to the sign-in screen. (redirect("/") to the same URL
// can be served from the client router cache and leave the stale app showing.)
export async function operatorForSave() {
  const name = await signedInOperator();
  if (!name) refresh();
  return name;
}
