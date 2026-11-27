import type { NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { getReport } from "@/lib/server/report";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const report = getReport(Number.isInteger(id) && id > 0 ? id : null);
  // meta=1: the dashboard panel needs only the period and the next date.
  if (req.nextUrl.searchParams.get("meta") === "1") return json({ ...report, latest: null, archive: report.archive.slice(0, 1) });
  return json(report);
}
