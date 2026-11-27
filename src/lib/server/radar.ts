// Data Radar: releases, research and product updates from data platforms and tools.
//
// Every source is a public feed or API offered by the project itself for this purpose:
// - Project news/blog feeds (PostgreSQL, Apache Kafka, Apache Airflow, DuckDB, Microsoft Fabric, Power BI).
// - PyPI's official per-project release feeds (pypi.org/rss/project/<name>/releases.xml) for projects
//   that publish releases there (Apache Spark via PySpark, dbt Core, Polars, PyIceberg, the
//   Databricks SDK for Python and Snowflake's Snowpark for Python).
// - arXiv's official RSS service for new database research (cs.DB).
// - The GitHub REST API (search) for notable new data repositories — only when GITHUB_TOKEN is set,
//   e.g. in GitHub Actions. This is GitHub's documented API, used within its rate limits.
//
// Feeds are fetched with the same polite fetcher as news sources: robots.txt is checked,
// requests are conditional (ETag / Last-Modified) and failing sources back off.
// Not used: github.com release/tag Atom feeds (served from github.com, whose robots.txt
// rules for automated clients could not be verified), and spark.apache.org (no feed).
import type Database from "better-sqlite3";
import type { RadarItem, RadarResponse, RadarSourceStatus, RadarType } from "@/lib/shared/types";
import { config } from "./config";
import { getDb } from "./db";
import { parseFeed, type ParsedItem } from "./feed-parser";
import { fetchFeed } from "./fetcher";
import { checkRobots } from "./robots";

export interface RadarSourceDef {
  id: string;
  /** Project or platform name shown on each item. */
  platform: string;
  homepage: string;
  url: string;
  kind: "feed" | "pypi" | "github-search";
  /** Minimum minutes between fetches; slow-moving sources are fetched less often. */
  everyMinutes: number;
  /** Badge for items that are not recognisably a release. */
  type: RadarType;
  /** Only keep items whose link matches (e.g. the blog part of a site-wide feed). */
  linkFilter?: RegExp;
  /** PyPI: name used in release titles, e.g. "Apache Spark" for the pyspark package. */
  releaseName?: string;
  /** GitHub search query; a creation-date bound is appended. */
  query?: string;
}

export const RADAR_SOURCES: RadarSourceDef[] = [
  { id: "postgresql", platform: "PostgreSQL", homepage: "https://www.postgresql.org/about/newsarchive/", url: "https://www.postgresql.org/news.rss", kind: "feed", everyMinutes: 0, type: "update" },
  { id: "fabric", platform: "Microsoft Fabric", homepage: "https://blog.fabric.microsoft.com/en-US/blog/", url: "https://blog.fabric.microsoft.com/en-US/blog/feed/", kind: "feed", everyMinutes: 0, type: "update" },
  { id: "powerbi", platform: "Power BI", homepage: "https://powerbi.microsoft.com/en-us/blog/", url: "https://powerbi.microsoft.com/en-us/blog/feed/", kind: "feed", everyMinutes: 0, type: "update" },
  { id: "spark", platform: "Apache Spark", homepage: "https://spark.apache.org/news/", url: "https://pypi.org/rss/project/pyspark/releases.xml", kind: "pypi", everyMinutes: 60, type: "release", releaseName: "Apache Spark" },
  { id: "kafka", platform: "Apache Kafka", homepage: "https://kafka.apache.org/blog/", url: "https://kafka.apache.org/index.xml", kind: "feed", everyMinutes: 360, type: "update", linkFilter: /^https:\/\/kafka\.apache\.org\/blog\/\d{4}\// },
  { id: "airflow", platform: "Apache Airflow", homepage: "https://airflow.apache.org/blog/", url: "https://airflow.apache.org/blog/index.xml", kind: "feed", everyMinutes: 120, type: "update" },
  { id: "duckdb", platform: "DuckDB", homepage: "https://duckdb.org/news/", url: "https://duckdb.org/feed.xml", kind: "feed", everyMinutes: 120, type: "update" },
  { id: "dbt", platform: "dbt", homepage: "https://pypi.org/project/dbt-core/", url: "https://pypi.org/rss/project/dbt-core/releases.xml", kind: "pypi", everyMinutes: 120, type: "release", releaseName: "dbt Core" },
  { id: "polars", platform: "Polars", homepage: "https://pypi.org/project/polars/", url: "https://pypi.org/rss/project/polars/releases.xml", kind: "pypi", everyMinutes: 120, type: "release", releaseName: "Polars" },
  { id: "iceberg", platform: "Apache Iceberg", homepage: "https://py.iceberg.apache.org/", url: "https://pypi.org/rss/project/pyiceberg/releases.xml", kind: "pypi", everyMinutes: 120, type: "release", releaseName: "PyIceberg" },
  { id: "databricks", platform: "Databricks", homepage: "https://pypi.org/project/databricks-sdk/", url: "https://pypi.org/rss/project/databricks-sdk/releases.xml", kind: "pypi", everyMinutes: 120, type: "release", releaseName: "Databricks SDK for Python" },
  { id: "snowflake", platform: "Snowflake", homepage: "https://pypi.org/project/snowflake-snowpark-python/", url: "https://pypi.org/rss/project/snowflake-snowpark-python/releases.xml", kind: "pypi", everyMinutes: 120, type: "release", releaseName: "Snowpark for Python" },
  { id: "arxiv-db", platform: "arXiv", homepage: "https://arxiv.org/list/cs.DB/recent", url: "https://rss.arxiv.org/rss/cs.DB", kind: "feed", everyMinutes: 360, type: "research" },
  { id: "github-data", platform: "GitHub", homepage: "https://github.com/topics/data-engineering", url: "https://api.github.com/search/repositories", kind: "github-search", everyMinutes: 360, type: "repository", query: "topic:data-engineering" },
  { id: "github-db", platform: "GitHub", homepage: "https://github.com/topics/database", url: "https://api.github.com/search/repositories", kind: "github-search", everyMinutes: 360, type: "repository", query: "topic:database" },
];

export function radarSourceById(id: string): RadarSourceDef | undefined {
  return RADAR_SOURCES.find((s) => s.id === id);
}

const DAY = 86_400_000;
/** Feed items older than this are not ingested. */
const MAX_AGE_MS = 60 * DAY;
const RETENTION_MS = 90 * DAY;

export interface NormalizedRadarItem {
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  type: RadarType;
  version: string | null;
  publishedAt: number | null;
  extra?: { stars?: number; language?: string | null };
}

// Community events (calls for papers, meetups, conferences) are not product news.
const EVENT_RE = /\b(call for (papers|proposals|speakers|sponsors)|cfp|pgday|pgconf|conferences?|meetups?|webinars?|user groups?|workshops?|sponsors?hip|sponsors)\b/i;
const RELEASE_RE = /\b(released?|release announcement|now available|is out)\b|^announcing\b/i;
const DOTTED_VERSION = /\bv?(\d+\.\d+(?:\.\d+){0,2})\b/;
const MAJOR_VERSION = /\b(?:PostgreSQL|Postgres) (\d{2})\b/i;
const PRERELEASE_RE = /(a|b|rc|dev|alpha|beta|pre|preview)\.?\d*$|\.post\d+$/i;

function clip(text: string, max = 260): string {
  // Feeds sometimes carry Markdown: keep link text, drop the URLs.
  const t = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).replace(/[,;:.\s]+$/, "")}…`;
}

function versionOf(title: string): string | null {
  return title.match(DOTTED_VERSION)?.[1] ?? title.match(MAJOR_VERSION)?.[1] ?? null;
}

/** Turn a feed item into a radar item, or null when it is out of scope. */
export function normalizeFeedItem(def: RadarSourceDef, item: ParsedItem, now: number): NormalizedRadarItem | null {
  if (def.linkFilter && !def.linkFilter.test(item.url)) return null;
  if (item.publishedAt != null && item.publishedAt < now - MAX_AGE_MS) return null;
  const title = item.title.trim();
  if (!title) return null;

  if (def.kind === "pypi") {
    const version = title.replace(/^v/i, "");
    if (!/^\d+(\.\d+)+/.test(version) || PRERELEASE_RE.test(version)) return null;
    return {
      guid: version,
      title: `${def.releaseName ?? def.platform} ${version}`,
      summary: null,
      url: item.url,
      type: "release",
      version,
      publishedAt: item.publishedAt,
    };
  }

  if (def.type === "research") {
    // arXiv lists new papers and revisions; only new papers (and cross-listings) count.
    const m = item.description.match(/Announce Type:\s*(\w+)/i);
    if (m && !["new", "cross"].includes(m[1].toLowerCase())) return null;
    const abstract = item.description.split(/Abstract:\s*/i)[1] ?? "";
    return {
      guid: item.guid || item.url,
      title,
      summary: abstract ? clip(abstract) : null,
      url: item.url,
      type: "research",
      version: null,
      publishedAt: item.publishedAt,
    };
  }

  if (EVENT_RE.test(title)) return null;
  const version = versionOf(title);
  const release = (RELEASE_RE.test(title) && version !== null) || (def.id === "airflow" && /^Apache Airflow \d+\.\d+/.test(title));
  const text = item.description || item.content;
  return {
    guid: item.guid || item.url,
    title,
    summary: text ? clip(text) : null,
    url: item.url,
    type: release ? "release" : def.type,
    version: release ? version : null,
    publishedAt: item.publishedAt,
  };
}

interface GithubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  created_at: string;
  stargazers_count: number;
  language: string | null;
  fork: boolean;
  archived: boolean;
}

export function normalizeGithubRepos(items: GithubRepo[]): NormalizedRadarItem[] {
  return items
    .filter((r) => !r.fork && !r.archived && r.html_url.startsWith("https://github.com/"))
    // Starter kits and app templates tagged with data topics are not data tooling news.
    .filter((r) => !/\b(starter|template|boilerplate|app builder|awesome[- ]list)\b/i.test(`${r.full_name} ${r.description ?? ""}`))
    .map((r) => ({
      guid: String(r.id),
      title: r.full_name,
      summary: r.description ? clip(r.description, 200) : null,
      url: r.html_url,
      type: "repository" as const,
      version: null,
      publishedAt: Date.parse(r.created_at) || null,
      extra: { stars: r.stargazers_count, language: r.language },
    }));
}

interface RadarSourceRow {
  id: string;
  etag: string | null;
  last_modified: string | null;
  last_attempt_at: number | null;
  consecutive_failures: number;
  next_attempt_at: number | null;
}

type Outcome = "ok" | "failed" | "skipped";

function store(db: Database.Database, def: RadarSourceDef, items: NormalizedRadarItem[], now: number): number {
  const insert = db.prepare(
    `INSERT INTO radar_items (source_id, guid, platform, title, summary, url, type, version, published_at, fetched_at, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id, guid) DO UPDATE SET title = excluded.title, summary = excluded.summary, url = excluded.url,
       type = excluded.type, version = excluded.version, extra = excluded.extra,
       published_at = COALESCE(radar_items.published_at, excluded.published_at)`,
  );
  let added = 0;
  db.transaction(() => {
    for (const it of items) {
      const res = insert.run(def.id, it.guid, def.platform, it.title, it.summary, it.url, it.type, it.version, it.publishedAt, now, JSON.stringify(it.extra ?? {}));
      if (res.changes && res.lastInsertRowid) added++;
    }
  })();
  return added;
}

async function fetchGithub(def: RadarSourceDef, now: number): Promise<{ ok: true; items: NormalizedRadarItem[] } | { ok: false; message: string; skip?: boolean }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, message: "GITHUB_TOKEN not set", skip: true };
  const since = new Date(now - 60 * DAY).toISOString().slice(0, 10);
  const q = `${def.query} created:>${since} stars:>=100`;
  const url = `${def.url}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": config.userAgent,
      },
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const body = (await res.json()) as { items?: GithubRepo[] };
    return { ok: true, items: normalizeGithubRepos(body.items ?? []) };
  } catch (err) {
    return { ok: false, message: (err as Error).name === "TimeoutError" ? "Request timed out" : "Network error" };
  }
}

async function refreshRadarSource(db: Database.Database, def: RadarSourceDef, row: RadarSourceRow | undefined, now: number): Promise<Outcome> {
  if (row?.next_attempt_at && row.next_attempt_at > now) return "skipped";
  // Allow a little slack so a 15-minute schedule does not skip "every 15 minutes" sources.
  if (def.everyMinutes > 0 && row?.last_attempt_at && now - row.last_attempt_at < def.everyMinutes * 60_000 - 120_000) return "skipped";
  db.prepare("INSERT OR IGNORE INTO radar_sources (id) VALUES (?)").run(def.id);

  const ok = (status: string) =>
    db
      .prepare(
        `UPDATE radar_sources SET last_attempt_at = ?, last_success_at = ?, last_status = ?, last_error = NULL,
           consecutive_failures = 0, next_attempt_at = NULL WHERE id = ?`,
      )
      .run(now, now, status, def.id);
  const fail = (message: string, retryAfterMs: number | null = null) => {
    const failures = (row?.consecutive_failures ?? 0) + 1;
    const backoff = retryAfterMs ?? Math.min(6 * 3_600_000, 15 * 60_000 * 2 ** Math.max(0, failures - 1));
    db.prepare(
      `UPDATE radar_sources SET last_attempt_at = ?, last_status = 'error', last_error = ?, consecutive_failures = ?, next_attempt_at = ? WHERE id = ?`,
    ).run(now, message.slice(0, 300), failures, failures >= 2 || retryAfterMs ? now + backoff : null, def.id);
    return "failed" as const;
  };

  if (def.kind === "github-search") {
    const result = await fetchGithub(def, now);
    if (!result.ok) {
      if (result.skip) {
        db.prepare("UPDATE radar_sources SET last_status = 'skipped', last_error = ? WHERE id = ?").run(result.message, def.id);
        return "skipped";
      }
      return fail(result.message);
    }
    store(db, def, result.items, now);
    ok("ok");
    return "ok";
  }

  const robots = await checkRobots(def.url);
  if (!robots.allowed) {
    db.prepare("UPDATE radar_sources SET last_attempt_at = ?, last_status = 'blocked', last_error = ? WHERE id = ?").run(now, robots.reason ?? "Disallowed by robots.txt", def.id);
    return "skipped";
  }
  const outcome = await fetchFeed(def.url, { etag: row?.etag ?? null, lastModified: row?.last_modified ?? null });
  if (outcome.kind === "error") return fail(outcome.message, outcome.retryAfterMs);
  if (outcome.kind === "not-modified") {
    ok("not-modified");
    return "ok";
  }
  let parsed: ParsedItem[];
  try {
    parsed = parseFeed(outcome.body).items;
  } catch (err) {
    return fail(`Could not parse feed: ${(err as Error).message}`);
  }
  const items = parsed.map((it) => normalizeFeedItem(def, it, now)).filter((x): x is NormalizedRadarItem => x !== null);
  store(db, def, items, now);
  db.prepare("UPDATE radar_sources SET etag = ?, last_modified = ? WHERE id = ?").run(outcome.etag, outcome.lastModified, def.id);
  ok("ok");
  return "ok";
}

/** Refresh every due radar source. Never throws; news refreshes are unaffected by radar failures. */
export async function refreshRadar(db: Database.Database = getDb()): Promise<{ ok: number; failed: number; skipped: number }> {
  const rows = new Map((db.prepare("SELECT id, etag, last_modified, last_attempt_at, consecutive_failures, next_attempt_at FROM radar_sources").all() as RadarSourceRow[]).map((r) => [r.id, r]));
  const outcomes: Outcome[] = [];
  const queue = [...RADAR_SOURCES];
  async function worker() {
    for (let def = queue.shift(); def; def = queue.shift()) {
      try {
        outcomes.push(await refreshRadarSource(db, def, rows.get(def.id), Date.now()));
      } catch (err) {
        console.error(`[radar] ${def.id} failed:`, err);
        outcomes.push("failed");
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  db.prepare("DELETE FROM radar_items WHERE COALESCE(published_at, fetched_at) < ?").run(Date.now() - RETENTION_MS);
  return {
    ok: outcomes.filter((o) => o === "ok").length,
    failed: outcomes.filter((o) => o === "failed").length,
    skipped: outcomes.filter((o) => o === "skipped").length,
  };
}

interface RadarItemRow {
  id: number;
  source_id: string;
  platform: string;
  title: string;
  summary: string | null;
  url: string;
  type: RadarType;
  version: string | null;
  published_at: number | null;
  fetched_at: number;
  extra: string;
}

function toItem(r: RadarItemRow): RadarItem {
  let extra: { stars?: number; language?: string | null } = {};
  try {
    extra = JSON.parse(r.extra) ?? {};
  } catch {
    // ignore malformed extra data
  }
  return {
    id: r.id,
    sourceId: r.source_id,
    platform: r.platform,
    title: r.title,
    summary: r.summary,
    url: r.url,
    type: r.type,
    version: r.version,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    fetchedAt: new Date(r.fetched_at).toISOString(),
    ...(r.type === "repository" ? { stars: extra.stars ?? null, language: extra.language ?? null } : {}),
  };
}

/** Radar items from the last `days` days, newest first, at most `perSource` from each source. */
export function listRadarItems(days = 45, perSource = 30, db: Database.Database = getDb(), from?: number, to?: number): RadarItem[] {
  const start = from ?? Date.now() - days * DAY;
  const rows = db
    .prepare(
      `SELECT * FROM radar_items WHERE COALESCE(published_at, fetched_at) >= ? AND COALESCE(published_at, fetched_at) < ?
       ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC`,
    )
    .all(start, to ?? Date.now() + DAY) as RadarItemRow[];
  const perSourceCount = new Map<string, number>();
  const out: RadarItem[] = [];
  for (const r of rows) {
    if (!radarSourceById(r.source_id)) continue;
    const n = perSourceCount.get(r.source_id) ?? 0;
    if (n >= perSource) continue;
    perSourceCount.set(r.source_id, n + 1);
    out.push(toItem(r));
  }
  return out;
}

export function getRadar(db: Database.Database = getDb()): RadarResponse {
  const rows = db.prepare("SELECT * FROM radar_sources").all() as (RadarSourceRow & { last_success_at: number | null; last_status: string | null; last_error: string | null })[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
  const githubEnabled = !!process.env.GITHUB_TOKEN || rows.some((r) => r.id.startsWith("github-") && r.last_success_at);
  const sources: RadarSourceStatus[] = RADAR_SOURCES.filter((d) => d.kind !== "github-search" || githubEnabled).map((d) => {
    const r = byId.get(d.id);
    return {
      id: d.id,
      platform: d.platform,
      homepage: d.homepage,
      lastSuccessAt: iso(r?.last_success_at),
      lastAttemptAt: iso(r?.last_attempt_at),
      lastStatus: r?.last_status ?? null,
      lastError: r?.last_error ?? null,
    };
  });
  const last = Math.max(0, ...rows.map((r) => r.last_success_at ?? 0));
  return { items: listRadarItems(45, 30, db), lastSuccessAt: last ? new Date(last).toISOString() : null, sources, generatedAt: new Date().toISOString() };
}
