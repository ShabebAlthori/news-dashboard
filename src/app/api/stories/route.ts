import type { NextRequest } from "next/server";
import { COMPANY_IDS, FILTER_IDS, type Section } from "@/lib/shared/taxonomy";
import { error, json, parseIntParam } from "@/lib/server/http";
import { listStories } from "@/lib/server/queries";

const SECTIONS = new Set(["all", "tech", "gaming", "business"]);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const section = p.get("section") ?? "all";
  const category = p.get("category") || undefined;
  const company = p.get("company") || undefined;
  const sort = p.get("sort") === "newest" ? "newest" : "importance";
  if (!SECTIONS.has(section)) return error(400, "Invalid section");
  if (category && !FILTER_IDS.includes(category)) return error(400, "Invalid category");
  if (company && !COMPANY_IDS.includes(company)) return error(400, "Invalid company");
  const q = (p.get("q") ?? "").slice(0, 200);
  const result = listStories({
    section: section as Section | "all",
    category,
    company,
    from: parseIntParam(p.get("from")),
    to: parseIntParam(p.get("to")),
    q: q || undefined,
    sort,
    group: p.get("group") !== "0",
    savedOnly: p.get("saved") === "1",
    limit: parseIntParam(p.get("limit")),
    cursor: parseIntParam(p.get("cursor")),
  });
  return json(result);
}
