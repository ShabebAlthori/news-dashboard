import type Database from "better-sqlite3";
import { topicsOf, type EventType, type Section } from "@/lib/shared/taxonomy";
import { buildDashboard } from "@/lib/shared/rank";
import type { CoverageRef, DashboardResponse, Prefs, SnapshotStory, Story, StoriesResponse } from "@/lib/shared/types";
import { getDb, parseJsonArray } from "./db";
import { coverageFactor, finalScore, impactFactor, isBreaking, relevanceFactor, tier, toRelevancePrefs, type RelevancePrefs } from "./scoring";
import { searchTerms } from "@/lib/shared/search";
import { getPrefs } from "./settings";
import { SOURCES, sourceById } from "./sources";

const HOUR = 3_600_000;

interface ClusterRow {
  id: number;
  lead_article_id: number;
  primary_category?: string | null;
  first_published_at: number | null;
  last_published_at: number | null;
  sort_time: number;
  first_seen_at: number;
  source_count: number;
  sections: string;
  categories: string;
  companies: string;
  event_type: string;
  significance: number;
  credibility: number;
  rumor: number;
  policy: number;
  penalties: number;
  base_score: number;
}

interface ArticleRow {
  id: number;
  cluster_id: number | null;
  source_id: string;
  url: string;
  title: string;
  title_en: string | null;
  title_ar: string | null;
  summary_en: string | null;
  summary_ar: string | null;
  summary_origin: string;
  ai_model: string | null;
  published_at: number | null;
  fetched_at: number;
  image_url: string | null;
  read_at: number | null;
}

export interface StoryQuery {
  section?: Section | "all";
  category?: string;
  company?: string;
  from?: number;
  to?: number;
  q?: string;
  sort?: "newest" | "importance";
  group?: boolean;
  savedOnly?: boolean;
  limit?: number;
  cursor?: number;
}

function relevancePrefs(prefs: Prefs): RelevancePrefs {
  return toRelevancePrefs(prefs);
}

const iso = (t: number | null) => (t == null ? null : new Date(t).toISOString());

const ARTICLE_COLUMNS = `id, cluster_id, source_id, url, title, title_en, title_ar, summary_en, summary_ar, summary_origin, ai_model,
  published_at, fetched_at, image_url, read_at`;

function enabledSourceIds(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT id FROM sources WHERE enabled = 1").all() as { id: string }[];
  const registry = new Set(SOURCES.map((s) => s.id));
  return new Set(rows.map((r) => r.id).filter((id) => registry.has(id)));
}

/** Build Story objects for the given clusters (keeps input order). */
function hydrate(db: Database.Database, clusters: (ClusterRow & { score: number; relevance?: number })[], now: number, enabled: Set<string>): Story[] {
  if (!clusters.length) return [];
  const ids = clusters.map((c) => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const members = db
    .prepare(`SELECT ${ARTICLE_COLUMNS} FROM articles WHERE cluster_id IN (${placeholders}) AND excluded = 0`)
    .all(...ids) as ArticleRow[];
  const savedRows = db.prepare(`SELECT article_id FROM saved`).all() as { article_id: number }[];
  const saved = new Set(savedRows.map((r) => r.article_id));
  const byCluster = new Map<number, ArticleRow[]>();
  for (const m of members) {
    if (!enabled.has(m.source_id)) continue;
    const list = byCluster.get(m.cluster_id!) ?? [];
    list.push(m);
    byCluster.set(m.cluster_id!, list);
  }

  const stories: Story[] = [];
  for (const c of clusters) {
    const list = byCluster.get(c.id) ?? [];
    const lead = list.find((m) => m.id === c.lead_article_id) ?? list[0];
    if (!lead) continue;
    const others = list
      .filter((m) => m.id !== lead.id)
      .sort((a, b) => (a.published_at ?? a.fetched_at) - (b.published_at ?? b.fetched_at));
    const coverage: CoverageRef[] = others.map((m) => {
      const src = sourceById(m.source_id);
      return {
        articleId: m.id,
        sourceId: m.source_id,
        sourceName: src?.name ?? m.source_id,
        title: m.title,
        url: m.url,
        publishedAt: iso(m.published_at),
        fetchedAt: iso(m.fetched_at)!,
        official: src?.kind === "official",
        excerpt: m.summary_en ?? m.summary_ar,
        lang: src?.lang ?? "en",
      };
    });
    const src = sourceById(lead.source_id);
    const categories = parseJsonArray(c.categories);
    const companies = parseJsonArray(c.companies);
    const publishers = new Set(list.map((m) => sourceById(m.source_id)?.publisher ?? m.source_id)).size;
    stories.push({
      id: c.id,
      leadArticleId: lead.id,
      title: { original: lead.title, en: lead.title_en || lead.title, ar: lead.title_ar },
      summary: {
        en: lead.summary_en,
        ar: lead.summary_ar,
        origin: (lead.summary_origin as Story["summary"]["origin"]) ?? "none",
        aiModel: lead.ai_model,
      },
      url: lead.url,
      lang: src?.lang ?? "en",
      source: { id: lead.source_id, name: src?.name ?? lead.source_id, official: src?.kind === "official", ...(src ? { homepage: src.homepage } : {}) },
      publishedAt: iso(lead.published_at),
      fetchedAt: iso(lead.fetched_at)!,
      sections: parseJsonArray(c.sections) as Section[],
      categories,
      primaryCategory: c.primary_category ?? null,
      companies,
      eventType: c.event_type as EventType,
      rumor: c.rumor === 1,
      importance: c.score,
      tier: tier(c.score),
      breaking: isBreaking({
        firstPublishedAt: c.first_published_at,
        now,
        sourceCount: publishers,
        significance: c.significance,
        rumor: c.rumor === 1,
        score: c.score,
      }),
      breakdown: {
        significance: Math.round(c.significance * 100) / 100,
        coverage: coverageFactor(publishers),
        credibility: c.credibility,
        impact: impactFactor(companies, categories),
        relevance: c.relevance ?? 0,
        penalties: c.penalties,
      },
      sourceCount: publishers,
      coverage,
      imageUrl: lead.image_url,
      saved: list.some((m) => saved.has(m.id)),
      read: list.some((m) => m.read_at != null),
    });
  }
  return stories;
}

interface Candidate extends ClusterRow {
  score: number;
  relevance: number;
}

function candidates(db: Database.Database, q: StoryQuery, prefs: Prefs, opts: { raw?: boolean } = {}): Candidate[] {
  const where: string[] = ["c.excluded = 0", "c.lead_article_id IS NOT NULL"];
  const params: unknown[] = [];
  if (q.from != null) {
    where.push("COALESCE(c.last_published_at, c.sort_time) >= ?");
    params.push(q.from);
  }
  if (q.to != null) {
    where.push("c.sort_time <= ?");
    params.push(q.to);
  }
  if (q.section && q.section !== "all") {
    where.push("c.sections LIKE ?");
    params.push(`%"${q.section}"%`);
  }
  if (q.category) {
    // A priority category (e.g. "hardware-gaming") matches any of its topics.
    const topics = topicsOf(q.category);
    where.push(`(${topics.map(() => "c.categories LIKE ?").join(" OR ")})`);
    params.push(...topics.map((t) => `%"${t}"%`));
  }
  if (q.company) {
    where.push("c.companies LIKE ?");
    params.push(`%"${q.company}"%`);
  }
  if (!opts.raw && !prefs.showReviews) where.push("c.event_type NOT IN ('review', 'opinion')");
  if (!opts.raw && !prefs.includeTechPolicy) where.push("c.policy = 0");
  if (q.savedOnly) where.push("c.id IN (SELECT a.cluster_id FROM saved s JOIN articles a ON a.id = s.article_id)");
  if (q.q && q.q.trim()) {
    const match = toFtsQuery(q.q);
    if (!match) return [];
    where.push(
      "c.id IN (SELECT a.cluster_id FROM articles_fts f JOIN articles a ON a.id = f.rowid WHERE articles_fts MATCH ? AND a.excluded = 0)",
    );
    params.push(match);
  }
  const rows = db
    .prepare(
      `SELECT c.id, c.lead_article_id, c.primary_category, c.first_published_at, c.last_published_at, c.sort_time, c.first_seen_at, c.source_count,
              c.sections, c.categories, c.companies, c.event_type, c.significance, c.credibility, c.rumor, c.policy, c.penalties, c.base_score
       FROM clusters c WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as ClusterRow[];
  const rp = relevancePrefs(prefs);
  return rows.map((r) => {
    const relevance = relevanceFactor(parseJsonArray(r.categories), parseJsonArray(r.companies), rp);
    return { ...r, relevance, score: finalScore(r.base_score, relevance) };
  });
}

/** Convert free text into a safe FTS5 prefix query (Arabic terms also match English synonyms). */
export function toFtsQuery(input: string): string | null {
  const terms = searchTerms(input);
  if (!terms.length) return null;
  return terms.map((alternatives) => (alternatives.length === 1 ? `"${alternatives[0]}"*` : `(${alternatives.map((s) => `"${s}"*`).join(" OR ")})`)).join(" AND ");
}

function sortCandidates(list: Candidate[], sort: "newest" | "importance") {
  if (sort === "newest") list.sort((a, b) => b.sort_time - a.sort_time || b.score - a.score);
  else list.sort((a, b) => b.score - a.score || b.sort_time - a.sort_time);
}

export function listStories(q: StoryQuery): StoriesResponse {
  const db = getDb();
  const prefs = getPrefs();
  const now = Date.now();
  const enabled = enabledSourceIds(db);
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);
  const offset = Math.max(q.cursor ?? 0, 0);
  const list = candidates(db, q, prefs);
  sortCandidates(list, q.sort ?? "importance");

  if (q.group === false) {
    // Ungrouped: every article on its own card (exact duplicates are still removed at ingest).
    return listUngrouped(db, list, now, enabled, limit, offset);
  }

  const page = list.slice(offset, offset + limit);
  const stories = hydrate(db, page, now, enabled);
  return {
    stories,
    total: list.length,
    nextCursor: offset + limit < list.length ? offset + limit : null,
    generatedAt: new Date(now).toISOString(),
  };
}

function listUngrouped(db: Database.Database, clusters: Candidate[], now: number, enabled: Set<string>, limit: number, offset: number): StoriesResponse {
  const order = new Map(clusters.map((c, i) => [c.id, i]));
  const ids = clusters.map((c) => c.id);
  if (!ids.length) return { stories: [], total: 0, nextCursor: null, generatedAt: new Date(now).toISOString() };
  const rows = db
    .prepare(`SELECT id, cluster_id, published_at, fetched_at, source_id FROM articles WHERE excluded = 0 AND cluster_id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as { id: number; cluster_id: number; published_at: number | null; fetched_at: number; source_id: string }[];
  const visible = rows.filter((r) => enabled.has(r.source_id));
  visible.sort((a, b) => order.get(a.cluster_id)! - order.get(b.cluster_id)! || (b.published_at ?? b.fetched_at) - (a.published_at ?? a.fetched_at));
  const page = visible.slice(offset, offset + limit);
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const stories: Story[] = [];
  for (const r of page) {
    const c = byId.get(r.cluster_id)!;
    const [story] = hydrate(db, [{ ...c, lead_article_id: r.id }], now, enabled);
    if (story) {
      const lead = db.prepare(`SELECT ${ARTICLE_COLUMNS} FROM articles WHERE id = ?`).get(r.id) as ArticleRow;
      const src = sourceById(lead.source_id);
      stories.push({
        ...story,
        id: -lead.id, // unique key per article in ungrouped mode
        leadArticleId: lead.id,
        title: { original: lead.title, en: lead.title_en || lead.title, ar: lead.title_ar },
        summary: { en: lead.summary_en, ar: lead.summary_ar, origin: lead.summary_origin as Story["summary"]["origin"], aiModel: lead.ai_model },
        url: lead.url,
        lang: src?.lang ?? "en",
        source: { id: lead.source_id, name: src?.name ?? lead.source_id, official: src?.kind === "official", ...(src ? { homepage: src.homepage } : {}) },
        publishedAt: iso(lead.published_at),
        fetchedAt: iso(lead.fetched_at)!,
        coverage: [],
        imageUrl: lead.image_url,
      });
    }
  }
  return { stories, total: visible.length, nextCursor: offset + limit < visible.length ? offset + limit : null, generatedAt: new Date(now).toISOString() };
}

/**
 * The dashboard uses the same ranking engine as the web edition (lib/shared/rank.ts),
 * run over the last week of stories with this server's preferences, saved and read state.
 */
export function getDashboard(category?: string | null): DashboardResponse {
  const prefs = getPrefs();
  const stories = exportSnapshotStories(7, 3000, { keepReaderState: true });
  const saved = new Map<string, SnapshotStory>();
  const read = new Set<string>();
  for (const s of stories) {
    if (s.saved) saved.set(s.url, s);
    if (s.read) for (const u of [s.url, ...s.coverage.map((c) => c.url)]) read.add(u);
  }
  const now = Date.now();
  return buildDashboard(stories, { prefs, saved, read, now, generatedAt: new Date(now).toISOString() }, { category });
}

export function companyCounts(fromMs: number): Record<string, number> {
  const db = getDb();
  const prefs = getPrefs();
  const list = candidates(db, { from: fromMs }, prefs);
  const counts: Record<string, number> = {};
  for (const c of list) for (const id of parseJsonArray(c.companies)) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/**
 * Every visible story from the last `days` days with its raw ranking inputs, for the
 * static web edition. Reader filters (reviews, policy) are applied in the browser.
 */
export function exportSnapshotStories(days: number, limit = 2500, opts: { keepReaderState?: boolean } = {}): SnapshotStory[] {
  const db = getDb();
  const prefs = getPrefs();
  const now = Date.now();
  const list = candidates(db, { from: now - days * 24 * HOUR }, prefs, { raw: true });
  sortCandidates(list, "newest");
  const page = list.slice(0, limit);
  const byId = new Map(page.map((c) => [c.id, c]));
  return hydrate(db, page, now, enabledSourceIds(db)).map((s) => {
    const c = byId.get(s.id)!;
    return {
      ...s,
      saved: opts.keepReaderState ? s.saved : false,
      read: opts.keepReaderState ? s.read : false,
      sortTime: c.sort_time,
      lastActivity: c.last_published_at ?? c.sort_time,
      firstPublishedAt: c.first_published_at,
      significance: c.significance,
      baseScore: c.base_score,
      policy: c.policy === 1,
    };
  });
}
