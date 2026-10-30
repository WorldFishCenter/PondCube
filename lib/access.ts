import "server-only";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { getOperator } from "./data";
import { db } from "./db";
import { dataLinkAccess } from "./export";
import { accessFor } from "./operators";

// Operator access (lib/operators.ts) for the signed-in Clerk account.
// ponytail: currentUser() is a Backend API call per page load and save; move the email into the
// session token's claims if Clerk's rate limit is ever hit.
export const signedInAccess = async () => accessFor(await currentUser(), getOperator);

// The same for a data link key's sign-in account (lib/export.ts); an account deleted in Clerk counts as signed out.
// ponytail: a Backend API call per CSV fetched; cache the account for a minute if Clerk's rate limit is ever hit.
export const dataLinkAccessFor = (key: string) =>
  dataLinkAccess(
    db,
    key,
    async (id) => {
      try {
        return await (await clerkClient()).users.getUser(id);
      } catch (err) {
        if (isClerkAPIResponseError(err) && err.status === 404) return null;
        throw err;
      }
    },
    getOperator,
  );
