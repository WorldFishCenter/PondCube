import { signedInAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { readRows } from "@/lib/export";
import { waterQualityWorkbook } from "@/lib/workbook";

// The water-quality download: ?site=PEN&month=2025-07 as an .xlsx, from the signed-in Operator's sites only.

export async function GET(request: Request) {
  const access = await signedInAccess();
  if (access === "signedOut") return new Response(null, { status: 401 });
  if (access === "notOnList") return new Response(null, { status: 403 });
  const params = new URL(request.url).searchParams;
  const site = params.get("site") ?? "";
  const month = params.get("month") ?? "";
  if (!site) return new Response("site is missing, e.g. site=PEN", { status: 400 }); // one site per file
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response("month should look like 2025-07", { status: 400 });
  const only = { site, date: month.replace("-", "") };
  const [ponds, readings] = await Promise.all([
    readRows(db, "ponds", access.sites, only),
    readRows(db, "wq", access.sites, only),
  ]);
  if (!ponds.length) return new Response(`${site} isn't one of your sites`, { status: 404 });
  const file = await waterQualityWorkbook({ month: only.date, ponds, readings, madeOn: new Date() });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PondCube ${site} ${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
