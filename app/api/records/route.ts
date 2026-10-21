import { ZodError } from "zod";
import { signedInAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { createRecordIntake, neonWriter } from "@/lib/intake";
import { APP_VERSION } from "@/lib/version";

// Where the Outbox sends each Record: a fixed URL, as a server action's id changes with every deploy.

const intake = createRecordIntake(neonWriter(db), APP_VERSION);

export async function POST(request: Request) {
  // JSON only: another site can't send that without CORS, which this route never allows.
  if (request.headers.get("content-type") !== "application/json") return new Response(null, { status: 415 });
  const access = await signedInAccess();
  if (access === "notOnList") return new Response(null, { status: 403 });
  const { kind, account, record } = await request.json();
  // Signed out, or signed in as someone other than whoever saved it: never stored under their name.
  if (access === "signedOut" || account !== access.account) return new Response(null, { status: 401 });
  try {
    await intake.save(kind, record, access.operator);
  } catch (err) {
    if (err instanceof ZodError) return new Response(err.issues.map((i) => i.message).join("; "), { status: 422 });
    throw err;
  }
  return new Response(null, { status: 204 }); // stored, or already stored (a resend)
}
