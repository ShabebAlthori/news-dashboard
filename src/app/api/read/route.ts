import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { error, isSameOrigin, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "Forbidden");
  const body = (await request.json().catch(() => null)) as { articleId?: unknown } | null;
  const articleId = Number(body?.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0) return error(400, "Invalid request");
  getDb().prepare("UPDATE articles SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(Date.now(), articleId);
  return json({ ok: true });
}
