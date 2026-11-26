// Orchestrates AI translation and summarization of story lead articles.
//
// Order of work in every run (each step only for stories the site shows, most important
// and newest first):
//   1. Reuse cached results (keyed by a hash of the canonical article URL).
//   2. Translate missing headlines, many per request (cheap, and the most visible text).
//   3. Write bilingual summaries, a few stories per request.
// Requests are budgeted per run and per day, so the free tier is used for real work.
//
// Safety net for accuracy:
//  - The model only sees the publisher's own feed text (never scraped pages).
//  - Output is schema-validated, and every number in it must appear in the source.
//  - Anything that fails validation falls back to the verbatim feed excerpt / original headline.
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { SnapshotStory } from "@/lib/shared/types";
import { recomputeCluster } from "../cluster";
import { config } from "../config";
import { parseJsonArray } from "../db";
import { getSetting, setAiStatus, setSetting } from "../settings";
import { SOURCES, sourceById } from "../sources";
import { canonicalizeUrl } from "../text";
import { generateWithClaude } from "./anthropic";
import { AiError } from "./errors";
import { generateWithGemini, getGeminiState, restoreGeminiState, type GeminiState, type JsonRequest } from "./gemini";
import { generateWithOllama } from "./ollama";
import {
  buildSummaryBatchMessage,
  buildTitleBatchMessage,
  SUMMARY_BATCH_PROMPT,
  SummaryBatchSchema,
  TITLE_PROMPT,
  TitleBatchSchema,
  unverifiedNumbers,
  unverifiedNumbersIn,
  type AiOutput,
} from "./prompt";

const HOUR = 3_600_000;
const BUSINESS_CATEGORIES = new Set(["earnings", "acquisitions", "partnerships", "layoffs", "leadership", "strategy", "products"]);

function generate<T>(req: JsonRequest<T>): Promise<{ data: T; model: string }> {
  if (config.ai.provider === "anthropic") return generateWithClaude(req);
  if (config.ai.provider === "gemini") return generateWithGemini(req);
  if (config.ai.provider === "ollama") return generateWithOllama(req);
  throw new AiError("auth", "No AI provider configured");
}

// ---------------------------------------------------------------------------
// Cache

export function urlHash(url: string): string {
  return createHash("sha256").update(canonicalizeUrl(url)).digest("hex").slice(0, 32);
}

interface CacheRow {
  title_en: string | null;
  title_ar: string | null;
  summary_en: string | null;
  summary_ar: string | null;
  model: string | null;
}

function cacheGet(db: Database.Database, url: string): CacheRow | undefined {
  return db.prepare("SELECT title_en, title_ar, summary_en, summary_ar, model FROM ai_cache WHERE url_hash = ?").get(urlHash(url)) as CacheRow | undefined;
}

/** Store fields (only non-null ones overwrite) for an article URL. */
export function cachePut(db: Database.Database, url: string, fields: Partial<CacheRow>) {
  db.prepare(
    `INSERT INTO ai_cache (url_hash, title_en, title_ar, summary_en, summary_ar, model, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url_hash) DO UPDATE SET
       title_en = COALESCE(excluded.title_en, ai_cache.title_en), title_ar = COALESCE(excluded.title_ar, ai_cache.title_ar),
       summary_en = COALESCE(excluded.summary_en, ai_cache.summary_en), summary_ar = COALESCE(excluded.summary_ar, ai_cache.summary_ar),
       model = COALESCE(excluded.model, ai_cache.model), updated_at = excluded.updated_at`,
  ).run(urlHash(url), fields.title_en ?? null, fields.title_ar ?? null, fields.summary_en ?? null, fields.summary_ar ?? null, fields.model ?? null, Date.now());
}

/**
 * Warm the cache from a published snapshot (used when the database had to start empty, e.g.
 * after the Actions cache expired), so earlier translations are not paid for twice.
 */
export function seedCacheFromSnapshot(db: Database.Database, stories: SnapshotStory[]): number {
  let n = 0;
  const tx = db.transaction(() => {
    for (const s of stories) {
      const titleEn = s.lang === "ar" && s.title.en !== s.title.original ? s.title.en : null;
      const titleAr = s.lang !== "ar" ? s.title.ar : null;
      const ai = s.summary.origin === "ai";
      if (!titleEn && !titleAr && !ai) continue;
      cachePut(db, s.url, {
        title_en: titleEn ?? (ai ? s.title.en : null),
        title_ar: titleAr,
        summary_en: ai ? s.summary.en : null,
        summary_ar: ai ? s.summary.ar : null,
        model: s.summary.aiModel,
      });
      n++;
    }
  });
  tx();
  return n;
}

// ---------------------------------------------------------------------------
// Budget

interface Usage {
  day: string;
  requests: number;
}

function usageToday(): Usage {
  const day = new Date().toISOString().slice(0, 10);
  const u = getSetting<Usage>("ai_usage");
  return u && u.day === day ? u : { day, requests: 0 };
}

function addUsage(n: number) {
  const u = usageToday();
  setSetting("ai_usage", { day: u.day, requests: u.requests + n });
}

// ---------------------------------------------------------------------------
// Selection

const ARABIC_SOURCES = SOURCES.filter((s) => s.lang === "ar").map((s) => s.id);
const AR_LIST = ARABIC_SOURCES.length ? ARABIC_SOURCES.map((id) => `'${id.replace(/'/g, "''")}'`).join(",") : "''";

/** Most important first, with half a point less per hour of age — so newer stories go first among similar ones. */
const PRIORITY = "(c.base_score - (@now - c.sort_time) / 3600000.0 * 0.5) DESC";
const ELIGIBLE = `a.excluded = 0 AND c.excluded = 0 AND COALESCE(a.published_at, a.fetched_at) > @since
  AND a.source_id NOT IN (SELECT id FROM sources WHERE ai_allowed = 0)`;
const NEEDS_TITLE = `((a.source_id IN (${AR_LIST}) AND a.title_en IS NULL) OR (a.source_id NOT IN (${AR_LIST}) AND a.title_ar IS NULL))`;
const NEEDS_SUMMARY = `a.ai_status IN ('pending','failed') AND a.ai_attempts < 3`;

function windowStart(now: number) {
  return now - config.ai.windowDays * 24 * HOUR;
}

export function pendingAiCount(db: Database.Database): number {
  if (config.ai.provider === "none") return 0;
  const now = Date.now();
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM articles a JOIN clusters c ON c.lead_article_id = a.id WHERE ${ELIGIBLE} AND ${NEEDS_SUMMARY}`).get({ since: windowStart(now) }) as { n: number }
  ).n;
}

export function pendingTitleCount(db: Database.Database): number {
  if (config.ai.provider === "none") return 0;
  const now = Date.now();
  return (
    db
      .prepare(`SELECT COUNT(*) AS n FROM articles a JOIN clusters c ON c.lead_article_id = a.id WHERE ${ELIGIBLE} AND a.title_ai_attempts < 3 AND ${NEEDS_TITLE}`)
      .get({ since: windowStart(now) }) as { n: number }
  ).n;
}

// ---------------------------------------------------------------------------
// Steps

interface LeadRow {
  id: number;
  source_id: string;
  url: string;
  title: string;
  excerpt: string;
  content_text: string;
  published_at: number | null;
  categories: string;
  companies: string;
  rumor: number;
  ai_attempts: number;
  ai_status: string;
  cluster_id: number;
  title_en: string | null;
  title_ar: string | null;
}

const LEAD_COLUMNS = `a.id, a.source_id, a.url, a.title, a.excerpt, a.content_text, a.published_at, a.categories, a.companies, a.rumor,
  a.ai_attempts, a.ai_status, a.cluster_id, a.title_en, a.title_ar`;

function applyCache(db: Database.Database, now: number): number {
  const rows = db
    .prepare(
      `SELECT ${LEAD_COLUMNS} FROM articles a JOIN clusters c ON c.lead_article_id = a.id
       WHERE ${ELIGIBLE} AND (${NEEDS_TITLE} OR ${NEEDS_SUMMARY})`,
    )
    .all({ since: windowStart(now) }) as LeadRow[];
  let applied = 0;
  const setSummary = db.prepare(
    `UPDATE articles SET title_en = COALESCE(?, title_en), title_ar = COALESCE(?, title_ar), summary_en = ?, summary_ar = ?,
       summary_origin = 'ai', ai_status = 'done', ai_model = ?, ai_error = NULL, ai_at = ? WHERE id = ?`,
  );
  const setTitle = db.prepare("UPDATE articles SET title_en = COALESCE(title_en, ?), title_ar = COALESCE(title_ar, ?) WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of rows) {
      const hit = cacheGet(db, r.url);
      if (!hit) continue;
      const arabic = ARABIC_SOURCES.includes(r.source_id);
      if ((r.ai_status === "pending" || r.ai_status === "failed") && hit.summary_en && hit.summary_ar) {
        setSummary.run(hit.title_en, arabic ? null : hit.title_ar, hit.summary_en, hit.summary_ar, hit.model, now, r.id);
        applied++;
      } else if ((arabic && !r.title_en && hit.title_en) || (!arabic && !r.title_ar && hit.title_ar)) {
        setTitle.run(arabic ? hit.title_en : null, arabic ? null : hit.title_ar, r.id);
        applied++;
      }
    }
  });
  tx();
  return applied;
}

interface StepState {
  requestsLeft: number;
  requests: number;
  stoppedBy: string | null;
  errors: Record<string, number>;
}

async function request<T>(state: StepState, req: JsonRequest<T>): Promise<{ data: T; model: string } | null> {
  if (state.stoppedBy || state.requestsLeft <= 0) return null;
  state.requestsLeft--;
  state.requests++;
  addUsage(1);
  try {
    const res = await generate(req);
    setAiStatus({ lastSuccessAt: Date.now(), lastError: null });
    return res;
  } catch (err) {
    const e = err instanceof AiError ? err : new AiError("invalid", (err as Error).message);
    state.errors[e.kind] = (state.errors[e.kind] ?? 0) + 1;
    // The provider already waited out a per-minute limit; if it is still throttled, stop for this run.
    if (e.stopsRun || e.kind === "throttled") {
      state.stoppedBy = e.message;
      setAiStatus({ lastError: e.message, lastErrorAt: Date.now() });
      return null;
    }
    throw e;
  }
}

async function translateTitles(db: Database.Database, state: StepState, now: number): Promise<number> {
  const limit = state.requestsLeft * config.ai.titleBatch;
  if (limit <= 0) return 0;
  const rows = db
    .prepare(
      `SELECT ${LEAD_COLUMNS} FROM articles a JOIN clusters c ON c.lead_article_id = a.id
       WHERE ${ELIGIBLE} AND a.title_ai_attempts < 3 AND ${NEEDS_TITLE}
       ORDER BY ${PRIORITY} LIMIT @limit`,
    )
    .all({ since: windowStart(now), now, limit }) as LeadRow[];
  const failed = db.prepare("UPDATE articles SET title_ai_attempts = title_ai_attempts + 1 WHERE id = ?");
  const setEn = db.prepare("UPDATE articles SET title_en = ? WHERE id = ?");
  const setAr = db.prepare("UPDATE articles SET title_ar = ? WHERE id = ?");
  let done = 0;
  for (let i = 0; i < rows.length && !state.stoppedBy; i += config.ai.titleBatch) {
    const batch = rows.slice(i, i + config.ai.titleBatch);
    const items = batch.map((r) => ({ id: String(r.id), target: (ARABIC_SOURCES.includes(r.source_id) ? "en" : "ar") as "en" | "ar", headline: r.title }));
    let res: Awaited<ReturnType<typeof request<{ items: { id: string; translation: string }[] }>>>;
    try {
      res = await request(state, { system: TITLE_PROMPT, user: buildTitleBatchMessage(items), schema: TitleBatchSchema, maxOutputTokens: 6000 });
    } catch {
      for (const r of batch) failed.run(r.id);
      continue;
    }
    if (!res) break;
    const byId = new Map(res.data.items.map((it) => [it.id, it.translation.trim()]));
    const tx = db.transaction(() => {
      for (const r of batch) {
        const tr = byId.get(String(r.id));
        const target = ARABIC_SOURCES.includes(r.source_id) ? "en" : "ar";
        const ok = !!tr && tr !== r.title && unverifiedNumbersIn([tr], r.title, r.published_at).length === 0;
        if (!ok) {
          failed.run(r.id);
          continue;
        }
        (target === "en" ? setEn : setAr).run(tr, r.id);
        cachePut(db, r.url, target === "en" ? { title_en: tr, model: res.model } : { title_ar: tr, model: res.model });
        done++;
      }
    });
    tx();
  }
  return done;
}

function applyOutput(db: Database.Database, row: LeadRow, output: AiOutput, model: string) {
  const ruleCategories = parseJsonArray(row.categories);
  // Topic categories: prefer the model's reading when it gave one; always keep business categories from rules.
  const topical = output.categories.filter((c) => !BUSINESS_CATEGORIES.has(c));
  const categories = [
    ...new Set([...(topical.length ? topical : ruleCategories.filter((c) => !BUSINESS_CATEGORIES.has(c))), ...ruleCategories.filter((c) => BUSINESS_CATEGORIES.has(c))]),
  ].slice(0, 4);
  const companies = [...new Set([...parseJsonArray(row.companies), ...output.companies])];
  const excluded = output.excluded_topic !== "none";
  const arabic = ARABIC_SOURCES.includes(row.source_id);

  db.prepare(
    `UPDATE articles SET title_en = ?, title_ar = ?, summary_en = ?, summary_ar = ?, summary_origin = 'ai',
       ai_status = 'done', ai_model = ?, ai_significance = ?, ai_error = NULL, ai_at = ?, ai_attempts = ai_attempts + 1,
       rumor = ?, categories = ?, companies = ?,
       excluded = CASE WHEN ? THEN 1 ELSE excluded END,
       exclude_reason = CASE WHEN ? THEN ? ELSE exclude_reason END
     WHERE id = ?`,
  ).run(
    output.headline_en.trim(),
    // An Arabic publisher's own headline stays the Arabic headline.
    arabic ? row.title : output.headline_ar.trim(),
    output.summary_en.trim(),
    output.summary_ar.trim(),
    model,
    Math.min(5, Math.max(1, Math.round(output.significance))),
    Date.now(),
    row.rumor || output.speculative ? 1 : 0,
    JSON.stringify(categories),
    JSON.stringify(companies),
    excluded ? 1 : 0,
    excluded ? 1 : 0,
    `ai:${output.excluded_topic}`,
    row.id,
  );
  cachePut(db, row.url, {
    title_en: output.headline_en.trim(),
    title_ar: arabic ? null : output.headline_ar.trim(),
    summary_en: output.summary_en.trim(),
    summary_ar: output.summary_ar.trim(),
    model,
  });
  // Articles in a cluster report the same event, so an excluded topic applies to all of them.
  if (excluded) {
    db.prepare("UPDATE articles SET excluded = 1, exclude_reason = ? WHERE cluster_id = ? AND excluded = 0").run(`ai:${output.excluded_topic}`, row.cluster_id);
  }
}

function markFailure(db: Database.Database, row: LeadRow, err: AiError) {
  const terminal = err.kind === "refusal" || err.kind === "unverified" || row.ai_attempts + 1 >= 3;
  db.prepare("UPDATE articles SET ai_status = ?, ai_error = ?, ai_attempts = ai_attempts + 1, ai_at = ? WHERE id = ?").run(
    terminal ? (err.kind === "unverified" ? "rejected" : "failed-final") : "failed",
    err.message.slice(0, 500),
    Date.now(),
    row.id,
  );
}

async function summarize(db: Database.Database, state: StepState, now: number, maxStories: number): Promise<number> {
  const limit = Math.min(maxStories, state.requestsLeft * config.ai.summaryBatch);
  if (limit <= 0) return 0;
  const rows = db
    .prepare(
      `SELECT ${LEAD_COLUMNS} FROM articles a JOIN clusters c ON c.lead_article_id = a.id
       WHERE ${ELIGIBLE} AND ${NEEDS_SUMMARY}
       ORDER BY ${PRIORITY} LIMIT @limit`,
    )
    .all({ since: windowStart(now), now, limit }) as LeadRow[];

  // Stories that already failed once are retried on their own, so one problem article cannot sink a batch.
  const batches: LeadRow[][] = [];
  let current: LeadRow[] = [];
  for (const r of rows) {
    if (r.ai_attempts > 0) {
      batches.push([r]);
      continue;
    }
    current.push(r);
    if (current.length >= config.ai.summaryBatch) {
      batches.push(current);
      current = [];
    }
  }
  if (current.length) batches.push(current);

  let done = 0;
  for (const batch of batches) {
    if (state.stoppedBy || state.requestsLeft <= 0) break;
    const articles = batch.map((r) => ({
      id: String(r.id),
      sourceName: sourceById(r.source_id)?.name ?? r.source_id,
      title: r.title,
      text: r.content_text.length > r.excerpt.length ? r.content_text : r.excerpt,
      publishedAt: r.published_at,
    }));
    let res: Awaited<ReturnType<typeof request<{ items: (AiOutput & { id: string })[] }>>>;
    try {
      res = await request(state, {
        system: SUMMARY_BATCH_PROMPT,
        user: buildSummaryBatchMessage(articles),
        schema: SummaryBatchSchema,
        maxOutputTokens: 4000 + 2500 * batch.length,
        timeoutMs: 120_000,
      });
    } catch (err) {
      const e = err instanceof AiError ? err : new AiError("invalid", (err as Error).message);
      for (const r of batch) markFailure(db, r, e);
      continue;
    }
    if (!res) break;
    const byId = new Map(res.data.items.map((it) => [it.id, it]));
    for (const r of batch) {
      const out = byId.get(String(r.id));
      const art = articles.find((a) => a.id === String(r.id))!;
      if (!out) {
        markFailure(db, r, new AiError("invalid", "The model returned no item for this story"));
        continue;
      }
      const missing = unverifiedNumbers(out, `${r.title}\n${art.text}`, r.published_at);
      if (missing.length) {
        markFailure(db, r, new AiError("unverified", `Summary contained numbers not found in the source: ${missing.join(", ")}`));
        continue;
      }
      applyOutput(db, r, out, res.model);
      recomputeCluster(db, r.cluster_id);
      done++;
    }
  }
  return done;
}

export interface EnrichResult {
  cached: number;
  titles: number;
  summaries: number;
  requests: number;
  errors: Record<string, number>;
  stoppedBy: string | null;
  pendingTitles: number;
  pendingSummaries: number;
}

/** Translate headlines, then summarize the most important un-summarized stories. */
export async function enrichStories(db: Database.Database, opts: { maxArticles?: number } = {}): Promise<EnrichResult> {
  const empty: EnrichResult = { cached: 0, titles: 0, summaries: 0, requests: 0, errors: {}, stoppedBy: null, pendingTitles: 0, pendingSummaries: 0 };
  if (config.ai.provider === "none") return empty;

  // Publishers that opt out of AI use (robots.txt Content-Signal ai-input=no) are never sent to a model.
  db.prepare(
    `UPDATE articles SET ai_status = 'skipped' WHERE ai_status IN ('pending','failed')
     AND source_id IN (SELECT id FROM sources WHERE ai_allowed = 0)`,
  ).run();

  const now = Date.now();
  const cached = applyCache(db, now);
  const maxStories = opts.maxArticles ?? config.ai.maxPerRun;
  const state: StepState = {
    requestsLeft: maxStories === 0 ? 0 : Math.min(config.ai.maxRequestsPerRun, Math.max(0, config.ai.dailyLimit - usageToday().requests)),
    requests: 0,
    stoppedBy: null,
    errors: {},
  };

  if (config.ai.provider === "gemini") restoreGeminiState(getSetting<GeminiState>("gemini_state"));
  let titles = 0;
  let summaries = 0;
  try {
    titles = await translateTitles(db, state, now);
    summaries = await summarize(db, state, now, maxStories);
  } finally {
    if (config.ai.provider === "gemini") setSetting("gemini_state", getGeminiState());
  }
  return { cached, titles, summaries, requests: state.requests, errors: state.errors, stoppedBy: state.stoppedBy, pendingTitles: pendingTitleCount(db), pendingSummaries: pendingAiCount(db) };
}
