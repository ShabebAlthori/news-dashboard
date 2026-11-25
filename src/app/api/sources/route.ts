import type { NextRequest } from "next/server";
import { getDb } from "@/lib/server/db";
import { error, isSameOrigin, json } from "@/lib/server/http";
import { syncSources } from "@/lib/server/pipeline";
import { sourceById } from "@/lib/server/sources";
import { getSourcesHealth } from "@/lib/server/status";

export async function GET() {
  return json(getSourcesHealth());
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return error(403, "Forbidden");
  const body = (await request.json().catch(() => null)) as { id?: unknown; enabled?: unknown } | null;
  if (typeof body?.id !== "string" || !sourceById(body.id) || typeof body.enabled !== "boolean") return error(400, "Invalid request");
  const db = getDb();
  syncSources(db);
  db.prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(body.enabled ? 1 : 0, body.id);
  return json(getSourcesHealth());
}
