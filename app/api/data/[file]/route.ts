import { dataLinkAccessFor } from "@/lib/access";
import { db } from "@/lib/db";
import { columnsOf, csv, rowsByYear, VIEWS, type ViewName } from "@/lib/export";

// A data link CSV, e.g. /api/data/wq.csv?key=…: every row of the key's Operator's sites, worked out on each request.
// Streamed a year at a time: a site-year of water quality (~5 MB) is over Vercel's 4.5 MB limit for responses that
// aren't, and all years at once would have to fit in memory.

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = file.replace(/\.csv$/, "") as ViewName;
  if (!file.endsWith(".csv") || !Object.hasOwn(VIEWS, name)) return new Response(null, { status: 404 });
  const access = await dataLinkAccessFor(new URL(request.url).searchParams.get("key") ?? "");
  if (access === "signedOut")
    return new Response("This data link doesn't work any more. Make a new one in PondCube.", { status: 401 });
  if (access === "notOnList") return new Response("You are no longer on the operator list.", { status: 403 });
  return new Response(csv(columnsOf(name), rowsByYear(db, name, access.sites)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
