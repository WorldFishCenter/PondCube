import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { getOperator } from "./data";
import { accessFor } from "./operators";

// Operator access (lib/operators.ts) for the signed-in Clerk account.
// ponytail: currentUser() is a Backend API call per page load and save; move the email into the
// session token's claims if Clerk's rate limit is ever hit.
export const signedInAccess = async () => accessFor(await currentUser(), getOperator);
