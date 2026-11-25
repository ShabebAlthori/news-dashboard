import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { error, isSameOrigin, json } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "Forbidden");
  const body = (await request.json().catch(() => null)) as { articleId?: unknown; saved?: unknown } | null;
  const articleId = Number(body?.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0 || typeof body?.saved !== "boolean") return error(400, "Invalid request");
  const db = getDb();
  const exists = db.prepare("SELECT id, cluster_id FROM articles WHERE id = ?").get(articleId) as { id: number; cluster_id: number | null } | undefined;
  if (!exists) return error(404, "Article not found");
  if (body.saved) {
    db.prepare("INSERT OR IGNORE INTO saved (article_id, saved_at) VALUES (?, ?)").run(articleId, Date.now());
  } else {
    // Un-saving a story removes every saved article of that story.
    if (exists.cluster_id != null) {
      db.prepare("DELETE FROM saved WHERE article_id IN (SELECT id FROM articles WHERE cluster_id = ?)").run(exists.cluster_id);
    }
    db.prepare("DELETE FROM saved WHERE article_id = ?").run(articleId);
  }
  return json({ ok: true });
}
