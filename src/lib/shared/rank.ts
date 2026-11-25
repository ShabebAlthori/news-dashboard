// In-browser query engine for the web edition. Mirrors lib/server/queries.ts, but works
// on the JSON snapshot so the site can be hosted as static files.
import { matchesSearch, searchTerms } from "./search";
import { finalScore, isBreaking, relevanceFactor, tier, type RelevancePrefs } from "./scoring";
import { COMPANIES, type Section } from "./taxonomy";
import type { CompanyPulse, DashboardResponse, Prefs, SnapshotStory, StoriesResponse, Story } from "./types";

const HOUR = 3_600_000;

export interface RankContext {
  prefs: Prefs;
  /** Saved stories, keyed by lead article URL (stored in full so they outlive the snapshot). */
  saved: Map<string, SnapshotStory>;
  /** URLs the reader has opened. */
  read: Set<string>;
  now: number;
  generatedAt: string;
}

export interface StaticQuery {
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

interface Ranked extends SnapshotStory {
  score: number;
  relevance: number;
}

function relevancePrefs(prefs: Prefs): RelevancePrefs {
  return {
    interests: new Set(prefs.interests),
    followed: new Set(prefs.followedCompanies),
    allInterests: prefs.interests.length === 0 || prefs.interests.length >= 23,
  };
}

function urlsOf(s: Story): string[] {
  return [s.url, ...s.coverage.map((c) => c.url)];
}

function searchableText(s: Story): string {
  return [s.title.original, s.title.en, s.title.ar ?? "", s.summary.en ?? "", s.summary.ar ?? "", ...s.coverage.map((c) => c.title)].join(" \n ");
}

function rank(stories: SnapshotStory[], q: StaticQuery, ctx: RankContext): Ranked[] {
  const rp = relevancePrefs(ctx.prefs);
  const terms = q.q?.trim() ? searchTerms(q.q) : [];
  const savedUrls = new Set(ctx.saved.keys());
  const out: Ranked[] = [];
  for (const s of stories) {
    if (q.from != null && s.lastActivity < q.from) continue;
    if (q.to != null && s.sortTime > q.to) continue;
    if (q.section && q.section !== "all" && !s.sections.includes(q.section)) continue;
    if (q.category && !s.categories.includes(q.category)) continue;
    if (q.company && !s.companies.includes(q.company)) continue;
    if (!ctx.prefs.showReviews && (s.eventType === "review" || s.eventType === "opinion") && !q.savedOnly) continue;
    if (!ctx.prefs.includeTechPolicy && s.policy && !q.savedOnly) continue;
    if (terms.length && !matchesSearch(searchableText(s), terms)) continue;
    const relevance = relevanceFactor(s.categories, s.companies, rp);
    const score = finalScore(s.baseScore, relevance);
    const urls = urlsOf(s);
    out.push({
      ...s,
      relevance,
      score,
      importance: score,
      tier: tier(score),
      breaking: isBreaking({
        firstPublishedAt: s.firstPublishedAt,
        now: ctx.now,
        sourceCount: s.sourceCount,
        significance: s.significance,
        rumor: s.rumor,
        score,
      }),
      breakdown: { ...s.breakdown, relevance },
      saved: urls.some((u) => savedUrls.has(u)),
      read: urls.some((u) => ctx.read.has(u)),
    });
  }
  return out;
}

function sortRanked(list: Ranked[], sort: "newest" | "importance") {
  if (sort === "newest") list.sort((a, b) => b.sortTime - a.sortTime || b.score - a.score);
  else list.sort((a, b) => b.score - a.score || b.sortTime - a.sortTime);
}

/** Saved stories: the fresh snapshot version when available, otherwise the stored copy. */
function savedPool(stories: SnapshotStory[], ctx: RankContext): SnapshotStory[] {
  const byUrl = new Map<string, SnapshotStory>();
  for (const s of stories) for (const u of urlsOf(s)) byUrl.set(u, s);
  const seen = new Set<number>();
  const pool: SnapshotStory[] = [];
  for (const [url, stored] of ctx.saved) {
    const fresh = byUrl.get(url) ?? stored;
    if (seen.has(fresh.id)) continue;
    seen.add(fresh.id);
    pool.push(fresh);
  }
  return pool;
}

function ungroup(list: Ranked[]): Story[] {
  const out: Story[] = [];
  for (const s of list) {
    out.push({ ...s, coverage: [] });
    for (const c of s.coverage) {
      out.push({
        ...s,
        id: -c.articleId,
        leadArticleId: c.articleId,
        title: { original: c.title, en: c.title, ar: null },
        summary: { en: c.excerpt ?? null, ar: null, origin: c.excerpt ? "feed" : "none", aiModel: null },
        url: c.url,
        source: { id: c.sourceId, name: c.sourceName, official: c.official },
        publishedAt: c.publishedAt,
        fetchedAt: c.fetchedAt,
        coverage: [],
        imageUrl: null,
      });
    }
  }
  return out;
}

const INTERNAL_FIELDS = ["score", "relevance", "sortTime", "lastActivity", "firstPublishedAt", "significance", "baseScore", "policy"] as const;

function strip(s: Ranked): Story {
  // Drop internal fields the UI does not need (keeps the Story shape identical to the API).
  const story: Record<string, unknown> = { ...s };
  for (const key of INTERNAL_FIELDS) delete story[key];
  return story as unknown as Story;
}

export function queryStories(stories: SnapshotStory[], q: StaticQuery, ctx: RankContext): StoriesResponse {
  const pool = q.savedOnly ? savedPool(stories, ctx) : stories;
  const list = rank(pool, q, ctx);
  sortRanked(list, q.sort ?? "importance");
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);
  const offset = Math.max(q.cursor ?? 0, 0);
  const all = q.group === false ? ungroup(list) : list.map(strip);
  const page = all.slice(offset, offset + limit);
  return { stories: page, total: all.length, nextCursor: offset + limit < all.length ? offset + limit : null, generatedAt: ctx.generatedAt };
}

export function buildDashboard(stories: SnapshotStory[], ctx: RankContext): DashboardResponse {
  const now = ctx.now;
  const shown = new Set<number>();
  const pick = (list: Ranked[], n: number, minScore = 0) => {
    const out: Ranked[] = [];
    for (const c of list) {
      if (out.length >= n) break;
      if (shown.has(c.id) || c.score < minScore) continue;
      out.push(c);
      shown.add(c.id);
    }
    return out.map(strip);
  };

  let recent = rank(stories, { from: now - 24 * HOUR }, ctx);
  if (recent.length < 12) recent = rank(stories, { from: now - 72 * HOUR }, ctx);
  sortRanked(recent, "importance");

  const top = pick(recent, 6);
  const tech = pick(recent.filter((c) => c.sections.includes("tech")), 6);
  const gaming = pick(recent.filter((c) => c.sections.includes("gaming")), 6);

  const announcementTypes = new Set(["launch", "earnings", "acquisition", "partnership", "leadership", "pricing", "layoffs", "delay"]);
  const recent48 = rank(stories, { from: now - 48 * HOUR }, ctx);
  sortRanked(recent48, "importance");
  const announcements = pick(recent48.filter((c) => announcementTypes.has(c.eventType) && !c.rumor && c.companies.length > 0), 6, 45);

  const older = rank(stories, { from: now - 96 * HOUR, to: now - 10 * HOUR }, ctx);
  sortRanked(older, "importance");
  const missed = pick(older.filter((c) => !c.read), 6, 50);

  const followed = ctx.prefs.followedCompanies.length ? ctx.prefs.followedCompanies : COMPANIES.filter((c) => c.core).map((c) => c.id);
  const companies: CompanyPulse[] = followed
    .map((companyId) => {
      const list = recent48.filter((c) => c.companies.includes(companyId));
      return { companyId, count: list.length, top: list[0] ? strip(list[0]) : null };
    })
    .sort((a, b) => b.count - a.count);

  return { top, tech, gaming, announcements, missed, companies, generatedAt: ctx.generatedAt };
}

export function countCompanies(stories: SnapshotStory[], from: number, ctx: RankContext): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of rank(stories, { from }, ctx)) for (const id of s.companies) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
