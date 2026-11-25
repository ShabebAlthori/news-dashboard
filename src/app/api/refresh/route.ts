import type { NextRequest } from "next/server";
import { config } from "@/lib/server/config";
import { getDb } from "@/lib/server/db";
import { error, isSameOrigin, json } from "@/lib/server/http";
import { isRefreshRunning, runRefresh } from "@/lib/server/pipeline";

const MANUAL_MIN_GAP_MS = 3 * 60_000;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const viaCron = !!config.cronSecret && auth === `Bearer ${config.cronSecret}`;
  if (!viaCron && !isSameOrigin(request)) return error(403, "Forbidden");

  if (isRefreshRunning()) return json({ status: "running" }, { status: 202 });
  // Manual refreshes are rate-limited to stay polite to news sources.
  if (!viaCron) {
    const last = getDb().prepare("SELECT started_at FROM fetch_runs ORDER BY id DESC LIMIT 1").get() as { started_at: number } | undefined;
    if (last && Date.now() - last.started_at < MANUAL_MIN_GAP_MS) {
      return json({ status: "too-soon", retryAfterSeconds: Math.ceil((MANUAL_MIN_GAP_MS - (Date.now() - last.started_at)) / 1000) }, { status: 429 });
    }
  }
  const wait = request.nextUrl.searchParams.get("wait") === "1";
  const run = runRefresh(viaCron ? "cron" : "manual");
  if (wait) return json(await run);
  run.catch((err) => console.error("[refresh] background run failed", err));
  return json({ status: "started" }, { status: 202 });
}
