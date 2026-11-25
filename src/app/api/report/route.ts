import type { NextRequest } from "next/server";
import { json } from "@/lib/server/http";
import { getReport } from "@/lib/server/report";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  return json(getReport(Number.isInteger(id) && id > 0 ? id : null));
}
