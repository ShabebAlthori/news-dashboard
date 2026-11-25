import type { NextRequest } from "next/server";
import { json, parseIntParam } from "@/lib/server/http";
import { companyCounts } from "@/lib/server/queries";

export async function GET(request: NextRequest) {
  const from = parseIntParam(request.nextUrl.searchParams.get("from")) ?? Date.now() - 48 * 3_600_000;
  return json(companyCounts(from));
}
