import { signedInAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { replaceDataLink, VIEWS } from "@/lib/export";

// Makes the signed-in account's data link key, replacing (so revoking) its earlier one. The key is shown once,
// with the CSV links it reads (app/api/data).

export async function POST(request: Request) {
  // JSON only: another site can't send that without CORS, which this route never allows.
  if (request.headers.get("content-type") !== "application/json") return new Response(null, { status: 415 });
  const access = await signedInAccess();
  if (access === "signedOut") return new Response(null, { status: 401 });
  if (access === "notOnList") return new Response(null, { status: 403 });
  const key = await replaceDataLink(db, access.account);
  const links = Object.keys(VIEWS).map((f) => new URL(`/api/data/${f}.csv?key=${key}`, request.url).href);
  return Response.json({ key, links }, { headers: { "Cache-Control": "no-store" } });
}
