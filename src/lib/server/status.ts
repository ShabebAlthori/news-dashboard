import type { SourceHealth, StatusResponse } from "@/lib/shared/types";
import { pendingAiCount } from "./ai";
import { aiModelLabel, config } from "./config";
import { getDb } from "./db";
import { isRefreshRunning } from "./pipeline";
import { getAiStatus, getPrefs } from "./settings";
import { SOURCES } from "./sources";

const globalForScheduler = globalThis as unknown as { __newsNextRunAt?: number };

export function setNextRunAt(t: number | null) {
  globalForScheduler.__newsNextRunAt = t ?? undefined;
}

export function getSourcesHealth(): SourceHealth[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id, s.enabled, s.last_success_at, s.last_attempt_at, s.last_status, s.last_error, s.consecutive_failures, s.ai_allowed,
              (SELECT COUNT(*) FROM articles a WHERE a.source_id = s.id) AS article_count
       FROM sources s`,
    )
    .all() as {
    id: string;
    enabled: number;
    last_success_at: number | null;
    last_attempt_at: number | null;
    last_status: string | null;
    last_error: string | null;
    consecutive_failures: number;
    ai_allowed: number;
    article_count: number;
  }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
  return SOURCES.map((s) => {
    const r = byId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      section: s.section,
      kind: s.kind,
      homepage: s.homepage,
      enabled: r ? r.enabled === 1 : true,
      lastSuccessAt: iso(r?.last_success_at),
      lastAttemptAt: iso(r?.last_attempt_at),
      lastStatus: r?.last_status ?? null,
      lastError: r?.last_error ?? null,
      consecutiveFailures: r?.consecutive_failures ?? 0,
      articleCount: r?.article_count ?? 0,
      aiAllowed: r ? r.ai_allowed === 1 : true,
    };
  });
}

export function getStatus(): StatusResponse {
  const db = getDb();
  const lastOk = db
    .prepare("SELECT finished_at FROM fetch_runs WHERE status IN ('ok','partial') AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get() as { finished_at: number } | undefined;
  const lastRun = db.prepare("SELECT started_at, finished_at, status FROM fetch_runs ORDER BY id DESC LIMIT 1").get() as
    | { started_at: number; finished_at: number | null; status: string }
    | undefined;
  const sources = getSourcesHealth();
  const enabled = sources.filter((s) => s.enabled);
  const failing = enabled.filter((s) => s.lastStatus === "error" || s.lastStatus === "blocked");
  const counts = db
    .prepare("SELECT (SELECT COUNT(*) FROM articles WHERE excluded = 0) AS articles, (SELECT COUNT(*) FROM clusters WHERE excluded = 0) AS stories")
    .get() as { articles: number; stories: number };
  const ai = getAiStatus();
  const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
  return {
    lastSuccessAt: iso(lastOk?.finished_at),
    lastRunAt: iso(lastRun?.finished_at ?? lastRun?.started_at),
    lastRunStatus: lastRun?.status ?? null,
    running: isRefreshRunning(),
    nextRunAt: iso(globalForScheduler.__newsNextRunAt),
    intervalMinutes: getPrefs().refreshMinutes,
    sources: { total: sources.length, enabled: enabled.length, healthy: enabled.length - failing.length, failing: failing.length },
    failingSources: failing.map((s) => ({ id: s.id, name: s.name, error: s.lastError })),
    articles: counts.articles,
    stories: counts.stories,
    ai: {
      provider: config.ai.provider,
      model: aiModelLabel(),
      configured: config.ai.provider !== "none",
      lastError: ai.lastError,
      pending: pendingAiCount(db),
    },
    serverTime: new Date().toISOString(),
  };
}
