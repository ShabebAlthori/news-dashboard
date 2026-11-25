// Orchestrates AI summarization and translation of story lead articles.
//
// Safety net for accuracy:
//  - The model only sees the publisher's own feed text (never scraped pages).
//  - Output is schema-validated, and every number in it must appear in the source.
//  - Anything that fails validation falls back to the verbatim feed excerpt.
import type Database from "better-sqlite3";
import { config } from "../config";
import { parseJsonArray } from "../db";
import { recomputeCluster } from "../cluster";
import { setAiStatus } from "../settings";
import { sourceById } from "../sources";
import { summarizeWithClaude } from "./anthropic";
import { summarizeWithGemini } from "./gemini";
import { AiError } from "./errors";
import { summarizeWithOllama } from "./ollama";
import { unverifiedNumbers, type AiOutput, type PromptArticle } from "./prompt";

interface PendingRow {
  id: number;
  source_id: string;
  title: string;
  excerpt: string;
  content_text: string;
  published_at: number | null;
  categories: string;
  companies: string;
  rumor: number;
  ai_attempts: number;
  cluster_id: number;
}

const BUSINESS_CATEGORIES = new Set(["earnings", "acquisitions", "partnerships", "layoffs", "leadership", "strategy", "products"]);

async function callProvider(article: PromptArticle) {
  if (config.ai.provider === "anthropic") return summarizeWithClaude(article);
  if (config.ai.provider === "gemini") return summarizeWithGemini(article);
  if (config.ai.provider === "ollama") return summarizeWithOllama(article);
  throw new AiError("auth", "No AI provider configured");
}

function applyOutput(db: Database.Database, row: PendingRow, output: AiOutput, model: string) {
  const ruleCategories = parseJsonArray(row.categories);
  // Topic categories: prefer the model's reading when it gave one; always keep business categories from rules.
  const topical = output.categories.filter((c) => !BUSINESS_CATEGORIES.has(c));
  const categories = [
    ...new Set([...(topical.length ? topical : ruleCategories.filter((c) => !BUSINESS_CATEGORIES.has(c))), ...ruleCategories.filter((c) => BUSINESS_CATEGORIES.has(c))]),
  ].slice(0, 4);
  const companies = [...new Set([...parseJsonArray(row.companies), ...output.companies])];
  const excluded = output.excluded_topic !== "none";

  db.prepare(
    `UPDATE articles SET title_en = ?, title_ar = ?, summary_en = ?, summary_ar = ?, summary_origin = 'ai',
       ai_status = 'done', ai_model = ?, ai_significance = ?, ai_error = NULL, ai_at = ?, ai_attempts = ai_attempts + 1,
       rumor = ?, categories = ?, companies = ?,
       excluded = CASE WHEN ? THEN 1 ELSE excluded END,
       exclude_reason = CASE WHEN ? THEN ? ELSE exclude_reason END
     WHERE id = ?`,
  ).run(
    output.headline_en.trim(),
    output.headline_ar.trim(),
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
  // Articles in a cluster report the same event, so an excluded topic applies to all of them.
  if (excluded) {
    db.prepare("UPDATE articles SET excluded = 1, exclude_reason = ? WHERE cluster_id = ? AND excluded = 0").run(
      `ai:${output.excluded_topic}`,
      row.cluster_id,
    );
  }
}

function markFailure(db: Database.Database, row: PendingRow, err: AiError) {
  const terminal = err.kind === "refusal" || err.kind === "unverified" || row.ai_attempts + 1 >= 3;
  db.prepare("UPDATE articles SET ai_status = ?, ai_error = ?, ai_attempts = ai_attempts + 1, ai_at = ? WHERE id = ?").run(
    terminal ? (err.kind === "unverified" ? "rejected" : "failed-final") : "failed",
    err.message.slice(0, 500),
    Date.now(),
    row.id,
  );
}

export function pendingAiCount(db: Database.Database): number {
  if (config.ai.provider === "none") return 0;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM articles a JOIN clusters c ON c.lead_article_id = a.id
       WHERE a.excluded = 0 AND c.excluded = 0 AND a.ai_status IN ('pending','failed')`,
    )
    .get() as { n: number };
  return row.n;
}

/** Summarize/translate the most important un-summarized story leads. Returns the number completed. */
export async function enrichStories(db: Database.Database, opts: { maxArticles?: number } = {}): Promise<number> {
  if (config.ai.provider === "none" || config.ai.maxPerRun === 0) return 0;

  const dayAgo = Date.now() - 24 * 3_600_000;
  const usedToday = (db.prepare("SELECT COUNT(*) AS n FROM articles WHERE ai_at > ? AND ai_status = 'done'").get(dayAgo) as { n: number }).n;
  const budget = Math.min(opts.maxArticles ?? config.ai.maxPerRun, Math.max(0, config.ai.dailyLimit - usedToday));
  if (budget <= 0) return 0;

  // Publishers that opt out of AI use (robots.txt Content-Signal ai-input=no) are never sent to a model.
  db.prepare(
    `UPDATE articles SET ai_status = 'skipped' WHERE ai_status IN ('pending','failed')
     AND source_id IN (SELECT id FROM sources WHERE ai_allowed = 0)`,
  ).run();

  const rows = db
    .prepare(
      `SELECT a.id, a.source_id, a.title, a.excerpt, a.content_text, a.published_at, a.categories, a.companies, a.rumor,
              a.ai_attempts, a.cluster_id
       FROM articles a JOIN clusters c ON c.lead_article_id = a.id
       WHERE a.excluded = 0 AND c.excluded = 0 AND a.ai_status IN ('pending','failed') AND a.ai_attempts < 3
         AND COALESCE(a.published_at, a.fetched_at) > ?
       ORDER BY c.base_score DESC, c.sort_time DESC
       LIMIT ?`,
    )
    .all(Date.now() - 3 * 24 * 3_600_000, budget) as PendingRow[];

  let done = 0;
  let stop: AiError | null = null;
  const queue = [...rows];

  async function worker() {
    while (queue.length && !stop) {
      const row = queue.shift()!;
      const text = row.content_text.length > row.excerpt.length ? row.content_text : row.excerpt;
      const article: PromptArticle = {
        sourceName: sourceById(row.source_id)?.name ?? row.source_id,
        title: row.title,
        text,
        publishedAt: row.published_at,
      };
      try {
        const { output, model } = await callProvider(article);
        const missing = unverifiedNumbers(output, `${row.title}\n${text}`, row.published_at);
        if (missing.length) throw new AiError("unverified", `Summary contained numbers not found in the source: ${missing.join(", ")}`);
        applyOutput(db, row, output, model);
        recomputeCluster(db, row.cluster_id);
        done++;
        setAiStatus({ lastSuccessAt: Date.now(), lastError: null });
      } catch (err) {
        const e = err instanceof AiError ? err : new AiError("invalid", (err as Error).message);
        if (e.stopsRun) {
          stop = e;
          setAiStatus({ lastError: e.message, lastErrorAt: Date.now() });
          break;
        }
        markFailure(db, row, e);
      }
    }
  }

  // Gemini's free tier is rate-limited per minute, so its requests run one at a time.
  const concurrency = config.ai.provider === "gemini" ? 1 : config.ai.concurrency;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return done;
}
