// The refresh pipeline: fetch → parse → dedupe → classify → cluster → score → summarize.
import type Database from "better-sqlite3";
import { enrichStories } from "./ai";
import { classify } from "./classify";
import { assignClusters, recomputeCluster, type ClusterCandidate } from "./cluster";
import { config } from "./config";
import { getDb, parseJsonArray } from "./db";
import { parseFeed, type ParsedItem } from "./feed-parser";
import { fetchFeed } from "./fetcher";
import { checkRobots } from "./robots";
import { getPrefs } from "./settings";
import { SOURCES, sourceById, type SourceDef } from "./sources";
import { canonicalizeUrl, feedExcerptSummary, tokenize } from "./text";

const LOCK_NAME = "refresh";
const LOCK_TTL_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 6 * 3_600_000;
const FUTURE_TOLERANCE_MS = 60 * 60_000;

export interface RefreshResult {
  runId: number;
  status: "ok" | "partial" | "failed" | "skipped";
  sourcesOk: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  newArticles: number;
  summarized: number;
  durationMs: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Locking (works across the web server and a separate worker process)

function acquireLock(db: Database.Database, holder: string): boolean {
  const now = Date.now();
  const res = db
    .prepare(
      `INSERT INTO locks (name, holder, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
       WHERE locks.expires_at < ?`,
    )
    .run(LOCK_NAME, holder, now + LOCK_TTL_MS, now);
  return res.changes > 0;
}

function releaseLock(db: Database.Database, holder: string) {
  db.prepare("DELETE FROM locks WHERE name = ? AND holder = ?").run(LOCK_NAME, holder);
}

export function isRefreshRunning(): boolean {
  const row = getDb().prepare("SELECT expires_at FROM locks WHERE name = ?").get(LOCK_NAME) as { expires_at: number } | undefined;
  return !!row && row.expires_at > Date.now();
}

// ---------------------------------------------------------------------------

export function syncSources(db: Database.Database) {
  const upsert = db.prepare(
    `INSERT INTO sources (id, name, publisher, url, homepage, section, kind, credibility)
     VALUES (@id, @name, @publisher, @url, @homepage, @section, @kind, @credibility)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, publisher = excluded.publisher, url = excluded.url,
       homepage = excluded.homepage, section = excluded.section, kind = excluded.kind, credibility = excluded.credibility`,
  );
  const tx = db.transaction((defs: SourceDef[]) => {
    for (const s of defs) upsert.run(s);
  });
  tx(SOURCES);
}

interface SourceRow {
  id: string;
  url: string;
  enabled: number;
  etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
  next_attempt_at: number | null;
}

type SourceOutcome = "ok" | "failed" | "skipped";

function sanitizeDate(publishedAt: number | null, now: number): number | null {
  if (publishedAt == null) return null;
  if (publishedAt > now + FUTURE_TOLERANCE_MS) return null; // implausible future date: treat as not provided
  if (publishedAt < Date.UTC(2000, 0, 1)) return null;
  return publishedAt;
}

function insertItems(db: Database.Database, source: SourceDef, items: ParsedItem[], now: number): number[] {
  const cutoff = now - config.ingestMaxAgeDays * 24 * 3_600_000;
  const exists = db.prepare("SELECT id FROM articles WHERE (source_id = ? AND guid = ?) OR canonical_url = ? LIMIT 1");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles (
       source_id, guid, url, canonical_url, title, excerpt, content_text, author, image_url, published_at, fetched_at, updated_at,
       feed_categories, sections, categories, companies, event_type, significance, rumor, policy, clickbait, excluded, exclude_reason,
       tokens, summary_en, summary_origin, ai_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const inserted: number[] = [];
  const tx = db.transaction(() => {
    for (const item of items) {
      const publishedAt = sanitizeDate(item.publishedAt, now);
      if (publishedAt != null && publishedAt < cutoff) continue;
      const canonical = canonicalizeUrl(item.url);
      if (exists.get(source.id, item.guid, canonical)) continue;

      const text = item.content.length > item.description.length ? item.content : item.description;
      const excerptSource = item.description.length >= 60 ? item.description : text;
      const c = classify({ title: item.title, text, feedCategories: item.categories, source });
      const summary = excerptSource ? feedExcerptSummary(excerptSource, item.title) : "";
      const tokens = [...tokenize(item.title), ...c.titleCompanies.map((id) => `@${id}`)];
      const res = insert.run(
        source.id,
        item.guid,
        item.url,
        canonical,
        item.title,
        excerptSource.slice(0, 1500),
        text.slice(0, 8000),
        item.author,
        item.imageUrl,
        publishedAt,
        now,
        now,
        JSON.stringify(item.categories),
        JSON.stringify(c.sections),
        JSON.stringify(c.categories),
        JSON.stringify(c.companies),
        c.eventType,
        c.significance,
        c.rumor ? 1 : 0,
        c.policy ? 1 : 0,
        c.clickbaitPenalty,
        c.excluded ? 1 : 0,
        c.excludeReason,
        JSON.stringify(tokens),
        summary || null,
        summary ? "feed" : "none",
        c.excluded ? "skipped" : "pending",
      );
      if (res.changes > 0) inserted.push(Number(res.lastInsertRowid));
    }
  });
  tx();
  return inserted;
}

async function refreshSource(db: Database.Database, source: SourceDef, row: SourceRow, now: number, newIds: number[]): Promise<SourceOutcome> {
  if (row.next_attempt_at && row.next_attempt_at > now) return "skipped";

  const robots = await checkRobots(source.url);
  db.prepare("UPDATE sources SET ai_allowed = ? WHERE id = ?").run(robots.aiInputAllowed ? 1 : 0, source.id);
  if (!robots.allowed) {
    db.prepare("UPDATE sources SET last_attempt_at = ?, last_status = 'blocked', last_error = ? WHERE id = ?").run(
      now,
      robots.reason ?? "Disallowed by robots.txt",
      source.id,
    );
    return "skipped";
  }

  const outcome = await fetchFeed(source.url, { etag: row.etag, lastModified: row.last_modified });
  const intervalMs = getPrefs().refreshMinutes * 60_000;

  const fail = (message: string, retryAfterMs: number | null) => {
    const failures = row.consecutive_failures + 1;
    const backoff = retryAfterMs ?? Math.min(MAX_BACKOFF_MS, intervalMs * 2 ** Math.max(0, failures - 2));
    db.prepare(
      `UPDATE sources SET last_attempt_at = ?, last_status = 'error', last_error = ?, consecutive_failures = ?, next_attempt_at = ?
       WHERE id = ?`,
    ).run(now, message.slice(0, 300), failures, failures >= 2 || retryAfterMs ? now + backoff : null, source.id);
    return "failed" as const;
  };

  if (outcome.kind === "error") return fail(outcome.message, outcome.retryAfterMs);
  if (outcome.kind === "not-modified") {
    db.prepare(
      `UPDATE sources SET last_attempt_at = ?, last_success_at = ?, last_status = 'not-modified', last_error = NULL,
         consecutive_failures = 0, next_attempt_at = NULL WHERE id = ?`,
    ).run(now, now, source.id);
    return "ok";
  }

  let items: ParsedItem[];
  try {
    items = parseFeed(outcome.body).items;
  } catch (err) {
    return fail(`Could not parse feed: ${(err as Error).message}`, null);
  }
  const ids = insertItems(db, source, items, now);
  newIds.push(...ids);
  db.prepare(
    `UPDATE sources SET etag = ?, last_modified = ?, last_attempt_at = ?, last_success_at = ?, last_status = 'ok',
       last_error = NULL, consecutive_failures = 0, next_attempt_at = NULL WHERE id = ?`,
  ).run(outcome.etag, outcome.lastModified, now, now, source.id);
  return "ok";
}

function clusterNewArticles(db: Database.Database, newIds: number[]): Set<number> {
  const touched = new Set<number>();
  if (!newIds.length) return touched;
  const placeholders = newIds.map(() => "?").join(",");
  const incomingRows = db
    .prepare(
      `SELECT id, source_id, tokens, companies, COALESCE(published_at, fetched_at) AS t FROM articles
       WHERE id IN (${placeholders}) AND excluded = 0`,
    )
    .all(...newIds) as { id: number; source_id: string; tokens: string; companies: string; t: number }[];
  if (!incomingRows.length) return touched;

  const minTime = Math.min(...incomingRows.map((r) => r.t)) - 2 * 24 * 3_600_000;
  const existingRows = db
    .prepare(
      `SELECT id, source_id, tokens, companies, cluster_id, COALESCE(published_at, fetched_at) AS t FROM articles
       WHERE excluded = 0 AND cluster_id IS NOT NULL AND COALESCE(published_at, fetched_at) >= ?`,
    )
    .all(minTime) as { id: number; source_id: string; tokens: string; companies: string; cluster_id: number; t: number }[];

  const toCandidate = (r: { id: number; source_id: string; tokens: string; companies: string; t: number }, clusterId: number | null): ClusterCandidate => ({
    id: r.id,
    tokens: parseJsonArray(r.tokens),
    companies: parseJsonArray(r.companies),
    time: r.t,
    clusterId,
    sourcePublisher: sourceById(r.source_id)?.publisher ?? r.source_id,
  });

  const createCluster = db.prepare("INSERT INTO clusters (sort_time, first_seen_at, updated_at) VALUES (?, ?, ?)");
  const setCluster = db.prepare("UPDATE articles SET cluster_id = ? WHERE id = ?");
  const now = Date.now();

  const tx = db.transaction(() => {
    const assignments = assignClusters(
      existingRows.map((r) => toCandidate(r, r.cluster_id)),
      incomingRows.map((r) => toCandidate(r, null)),
      (seed) => Number(createCluster.run(seed.time, now, now).lastInsertRowid),
    );
    for (const a of assignments) {
      setCluster.run(a.clusterId, a.articleId);
      if (a.clusterId != null) touched.add(a.clusterId);
    }
    for (const id of touched) recomputeCluster(db, id);
  });
  tx();
  return touched;
}

function cleanup(db: Database.Database) {
  const retentionMs = getPrefs().retentionDays * 24 * 3_600_000;
  const cutoff = Date.now() - retentionMs;
  db.prepare(
    `DELETE FROM articles WHERE fetched_at < ? AND COALESCE(published_at, fetched_at) < ?
       AND id NOT IN (SELECT article_id FROM saved)`,
  ).run(cutoff, cutoff);
  db.prepare("DELETE FROM clusters WHERE id NOT IN (SELECT DISTINCT cluster_id FROM articles WHERE cluster_id IS NOT NULL)").run();
  db.prepare("DELETE FROM fetch_runs WHERE id NOT IN (SELECT id FROM fetch_runs ORDER BY id DESC LIMIT 500)").run();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runRefresh(trigger: "schedule" | "manual" | "cron" | "cli" = "schedule"): Promise<RefreshResult> {
  const db = getDb();
  const started = Date.now();
  const holder = `${process.pid}-${started}`;
  if (!acquireLock(db, holder)) {
    return { runId: 0, status: "skipped", sourcesOk: 0, sourcesFailed: 0, sourcesSkipped: 0, newArticles: 0, summarized: 0, durationMs: 0, message: "A refresh is already running" };
  }
  const runId = Number(
    db.prepare("INSERT INTO fetch_runs (started_at, status, trigger) VALUES (?, 'running', ?)").run(started, trigger).lastInsertRowid,
  );

  try {
    syncSources(db);
    const rows = db.prepare("SELECT id, url, enabled, etag, last_modified, consecutive_failures, next_attempt_at FROM sources").all() as SourceRow[];
    const enabled = rows.filter((r) => r.enabled && sourceById(r.id));
    const newIds: number[] = [];
    const outcomes = await mapLimit(enabled, 6, (row) => refreshSource(db, sourceById(row.id)!, row, Date.now(), newIds));
    const ok = outcomes.filter((o) => o === "ok").length;
    const failed = outcomes.filter((o) => o === "failed").length;
    const skipped = outcomes.filter((o) => o === "skipped").length;

    clusterNewArticles(db, newIds);
    let summarized = 0;
    try {
      summarized = await enrichStories(db);
    } catch (err) {
      console.error("[refresh] AI enrichment failed:", err);
    }
    cleanup(db);

    const status: RefreshResult["status"] = ok === 0 && enabled.length > 0 ? "failed" : failed > 0 ? "partial" : "ok";
    db.prepare(
      `UPDATE fetch_runs SET finished_at = ?, status = ?, sources_ok = ?, sources_failed = ?, sources_skipped = ?, new_articles = ?, summarized = ?
       WHERE id = ?`,
    ).run(Date.now(), status, ok, failed, skipped, newIds.length, summarized, runId);
    return { runId, status, sourcesOk: ok, sourcesFailed: failed, sourcesSkipped: skipped, newArticles: newIds.length, summarized, durationMs: Date.now() - started };
  } catch (err) {
    const message = (err as Error).message;
    db.prepare("UPDATE fetch_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?").run(Date.now(), message.slice(0, 500), runId);
    console.error("[refresh] failed:", err);
    return { runId, status: "failed", sourcesOk: 0, sourcesFailed: 0, sourcesSkipped: 0, newArticles: 0, summarized: 0, durationMs: Date.now() - started, message };
  } finally {
    releaseLock(db, holder);
  }
}

/** Re-run AI enrichment without fetching (used after configuring a provider). */
export async function runEnrichmentOnly(): Promise<number> {
  return enrichStories(getDb());
}
