import type { NextRequest } from "next/server";
import { error, json } from "@/lib/server/http";
import { getDashboard } from "@/lib/server/queries";
import { FILTER_IDS } from "@/lib/shared/taxonomy";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") || null;
  if (category && category !== "all" && !FILTER_IDS.includes(category)) return error(400, "Invalid category");
  return json(getDashboard(category));
}
