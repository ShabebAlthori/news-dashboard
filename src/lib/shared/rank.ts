// In-browser query engine for the web edition. Mirrors lib/server/queries.ts, but works
// on the JSON snapshot so the site can be hosted as static files.
import { normalizePrefs } from "./prefs";
import { matchesSearch, searchTerms } from "./search";
import { finalScore, isBreaking, relevanceFactor, tier, toRelevancePrefs, type RelevancePrefs } from "./scoring";
import { COMPANIES, FILTER_IDS, groupOfTopic, PRIORITY_IDS, subjectTopics, topicsOf, TRENDING_COMPANY_IDS, type Section } from "./taxonomy";
import type { CategoryPulse, CompanyPulse, DashboardResponse, HomeFile, PackedDashboard, Prefs, RadarItem, Snapshot, SnapshotStory, StoriesResponse, Story } from "./types";

const HOUR = 3_600_000;

export interface RankContext {
  prefs: Prefs;
  /** Saved stories, keyed by lead article URL (stored in full so they outlive the snapshot). */
  saved: Map<string, SnapshotStory>;
  /** URLs the reader has opened. */
  read: Set<string>;
  now: number;
  generatedAt: string;
  /**
   * The moment the data describes (the snapshot's generation time). Dashboard windows such as
   * "last 24 hours" are measured from here, so counts do not shrink as a snapshot ages.
   */
  asOf?: number;
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

/** Preferences saved by older versions are migrated before ranking. */
function withNormalizedPrefs(ctx: RankContext): RankContext {
  return { ...ctx, prefs: normalizePrefs(ctx.prefs) };
}

function relevancePrefs(prefs: Prefs): RelevancePrefs {
  return toRelevancePrefs(prefs);
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
    if (q.category && !topicsOf(q.category).some((t) => s.categories.includes(t))) continue;
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
        title: { original: c.title, en: c.title, ar: c.lang === "ar" ? c.title : null },
        summary: c.lang === "ar"
          ? { en: null, ar: c.excerpt ?? null, origin: c.excerpt ? "feed" : "none", aiModel: null }
          : { en: c.excerpt ?? null, ar: null, origin: c.excerpt ? "feed" : "none", aiModel: null },
        url: c.url,
        lang: c.lang ?? "en",
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

export function queryStories(stories: SnapshotStory[], q: StaticQuery, rawCtx: RankContext): StoriesResponse {
  const ctx = withNormalizedPrefs(rawCtx);
  const pool = q.savedOnly ? savedPool(stories, ctx) : stories;
  const list = rank(pool, q, ctx);
  sortRanked(list, q.sort ?? "importance");
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 100);
  const offset = Math.max(q.cursor ?? 0, 0);
  const all = q.group === false ? ungroup(list) : list.map(strip);
  const page = all.slice(offset, offset + limit);
  return { stories: page, total: all.length, nextCursor: offset + limit < all.length ? offset + limit : null, generatedAt: ctx.generatedAt };
}

export interface DashboardOptions {
  /** Filter every section to one priority category (or topic); null/"all" = everything. */
  category?: string | null;
  /** Candidates for "You might have missed" (more when read stories are filtered later, in the browser). */
  missedCount?: number;
}

export function buildDashboard(stories: SnapshotStory[], rawCtx: RankContext, opts: DashboardOptions = {}): DashboardResponse {
  const ctx = withNormalizedPrefs(rawCtx);
  const now = Math.min(ctx.asOf ?? ctx.now, ctx.now);
  const category = opts.category && opts.category !== "all" && FILTER_IDS.includes(opts.category) ? opts.category : null;
  const scope: StaticQuery = category ? { category } : {};
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

  // The last 24 hours, widened on quiet days (and for narrow category filters).
  const minimum = category ? 6 : 12;
  let windowHours = 24;
  let recent = rank(stories, { ...scope, from: now - windowHours * HOUR }, ctx);
  for (const wider of [72, 168]) {
    if (recent.length >= minimum) break;
    windowHours = wider;
    recent = rank(stories, { ...scope, from: now - windowHours * HOUR }, ctx);
  }
  sortRanked(recent, "importance");

  // Featured: the most important stories, preferring those with the publisher's own image.
  const leaders = recent.slice(0, 10);
  const featured = [...leaders.filter((s) => s.imageUrl), ...leaders.filter((s) => !s.imageUrl)].slice(0, 5);
  const top = pick(featured, 5);

  // Daily Briefing: the leading story of each priority category in the last 24 hours (48 on quiet days).
  const order = ctx.prefs.categoryOrder.filter((id) => ctx.prefs.interests.includes(id));
  let briefWindow = 24;
  let day = rank(stories, { ...scope, from: now - briefWindow * HOUR }, ctx);
  if (day.length < 5) {
    briefWindow = 48;
    day = rank(stories, { ...scope, from: now - briefWindow * HOUR }, ctx);
  }
  sortRanked(day, "importance");
  const briefingPicks: Ranked[] = [];
  const briefed = new Set<number>();
  for (const id of category ? [] : order) {
    const topics = topicsOf(id);
    const lead = day.find((s) => !briefed.has(s.id) && s.categories.some((t) => topics.includes(t)));
    if (lead) {
      briefingPicks.push(lead);
      briefed.add(lead.id);
    }
    if (briefingPicks.length >= 5) break;
  }
  for (const s of day) {
    if (briefingPicks.length >= 5) break;
    if (!briefed.has(s.id)) {
      briefingPicks.push(s);
      briefed.add(s.id);
    }
  }
  briefingPicks.sort((a, b) => b.score - a.score);
  const catCounts = new Map<string, number>();
  for (const s of day) {
    for (const g of new Set(subjectTopics(s.categories).map(groupOfTopic))) if (PRIORITY_IDS.includes(g)) catCounts.set(g, (catCounts.get(g) ?? 0) + 1);
  }
  // Highest count; ties go to the reader's higher-priority category (or the first seen).
  const rankOf = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? 99 : i;
  };
  const best = (m: Map<string, number>, byPriority = false) => {
    let out: { id: string; count: number } | null = null;
    for (const [id, count] of m) {
      if (!out || count > out.count || (byPriority && count === out.count && rankOf(id) < rankOf(out.id))) out = { id, count };
    }
    return out;
  };

  // Latest: newest first, with the reader's two highest-priority categories nudged forward.
  // A story whose source gave no publication time is not treated as brand new, and no
  // publisher fills more than two of the six cards.
  const boosted = new Set(order.slice(0, 2).flatMap(topicsOf));
  const latestPool = recent.filter((s) => !shown.has(s.id));
  const nudge = (s: Ranked) => (s.firstPublishedAt ?? s.sortTime - 24 * HOUR) + (s.categories.some((t) => boosted.has(t)) ? 6 * HOUR : 0);
  latestPool.sort((a, b) => nudge(b) - nudge(a) || b.score - a.score);
  const perSource = new Map<string, number>();
  const latestCandidates = latestPool.filter((s) => {
    const n = perSource.get(s.source.id) ?? 0;
    if (n >= 2) return false;
    perSource.set(s.source.id, n + 1);
    return true;
  });
  const latest = pick(latestCandidates, 6);

  const tech = pick(recent.filter((c) => c.sections.includes("tech")), 6);
  const gaming = pick(recent.filter((c) => c.sections.includes("gaming")), 6);

  const announcementTypes = new Set(["launch", "earnings", "acquisition", "partnership", "leadership", "pricing", "layoffs", "delay"]);
  const recent48 = rank(stories, { ...scope, from: now - 48 * HOUR }, ctx);
  sortRanked(recent48, "importance");
  const announcements = pick(recent48.filter((c) => announcementTypes.has(c.eventType) && !c.rumor && c.companies.length > 0), 6, 45);

  const older = rank(stories, { ...scope, from: now - 96 * HOUR, to: now - 10 * HOUR }, ctx);
  sortRanked(older, "importance");
  const missed = pick(older.filter((c) => !c.read), opts.missedCount ?? 6, 50);
  // A third row of Latest cards for wide screens (shown from 1280px, next to the taller right
  // column): only stories that no other section uses, so narrower screens lose nothing.
  const latestMore = latestCandidates.filter((s) => !shown.has(s.id)).slice(0, 3).map(strip);

  const pulse = (ids: string[]): CompanyPulse[] =>
    ids
      .map((companyId) => {
        const list = recent48.filter((c) => c.companies.includes(companyId));
        return { companyId, count: list.length, top: list[0] ? strip(list[0]) : null };
      })
      .sort((a, b) => b.count - a.count);
  const followed = ctx.prefs.followedCompanies.length ? ctx.prefs.followedCompanies : COMPANIES.filter((c) => c.core).map((c) => c.id);
  const companies = pulse(followed);
  // Trending Companies and the key takeaway share one count: stories per company in 48 hours.
  // The configured companies are always listed; any other tracked company joins when it is busier.
  const trending = pulse([...new Set([...TRENDING_COMPANY_IDS, ...COMPANIES.map((c) => c.id)])]).filter(
    (p) => TRENDING_COMPANY_IDS.includes(p.companyId) || p.count > 0,
  );
  const busiest = trending.find((p) => p.count > 0);

  const all48 = category ? rank(stories, { from: now - 48 * HOUR }, ctx) : recent48;
  if (category) sortRanked(all48, "importance");
  const byCategory: CategoryPulse[] = order.map((categoryId) => {
    const topics = topicsOf(categoryId);
    const list = all48.filter((c) => c.categories.some((t) => topics.includes(t)));
    return { categoryId, count: list.length, stories: list.slice(0, 3).map(strip) };
  });

  return {
    category,
    byCategory,
    top,
    briefing: briefingPicks.map(strip),
    briefingFacts: { windowHours: briefWindow, stories: day.length, topCategory: category ? null : best(catCounts, true), topCompany: busiest ? { id: busiest.companyId, count: busiest.count } : null },
    latest,
    latestMore,
    trending,
    tech,
    gaming,
    announcements,
    missed,
    companies,
    generatedAt: ctx.generatedAt,
  };
}

export function countCompanies(stories: SnapshotStory[], from: number, rawCtx: RankContext): Record<string, number> {
  const ctx = withNormalizedPrefs(rawCtx);
  const counts: Record<string, number> = {};
  for (const s of rank(stories, { from }, ctx)) for (const id of s.companies) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** True when the reader's preferences equal the defaults (the published home dashboard applies). */
export function isDefaultPrefs(prefs: Prefs, defaults: Prefs): boolean {
  const a = normalizePrefs(prefs);
  const b = normalizePrefs(defaults);
  const key = (p: Prefs) =>
    JSON.stringify([p.categoryOrder, [...p.interests].sort(), [...p.followedCompanies].sort(), p.showReviews, p.includeTechPolicy]);
  return key(a) === key(b);
}

/**
 * Mark saved and read stories in a dashboard computed without reader state (the published home
 * dashboard), and drop read stories from "You might have missed".
 */
export function withReaderState(d: DashboardResponse, saved: Set<string>, read: Set<string>, missedCount = 6): DashboardResponse {
  const mark = (s: Story): Story => {
    const urls = urlsOf(s);
    return { ...s, saved: urls.some((u) => saved.has(u)), read: urls.some((u) => read.has(u)) };
  };
  const list = (xs: Story[]) => xs.map(mark);
  return {
    ...d,
    top: list(d.top),
    briefing: list(d.briefing),
    latest: list(d.latest),
    latestMore: list(d.latestMore ?? []),
    tech: list(d.tech),
    gaming: list(d.gaming),
    announcements: list(d.announcements),
    missed: list(d.missed).filter((s) => !s.read).slice(0, missedCount),
    byCategory: d.byCategory.map((c) => ({ ...c, stories: list(c.stories) })),
    trending: d.trending.map((c) => ({ ...c, top: c.top ? mark(c.top) : null })),
    companies: d.companies.map((c) => ({ ...c, top: c.top ? mark(c.top) : null })),
  };
}

/** Build the web edition's home.json from the full snapshot and the panels' data. */
export function buildHomeFile(
  snapshot: Pick<Snapshot, "stories" | "generatedAt" | "defaultPrefs">,
  radar: { lastSuccessAt: string | null; items: RadarItem[] },
  latestReport: { id: number; periodStart: string; periodEnd: string } | null,
): HomeFile {
  const ref = Date.parse(snapshot.generatedAt);
  const ctx: RankContext = { prefs: normalizePrefs(snapshot.defaultPrefs), saved: new Map(), read: new Set(), now: ref, generatedAt: snapshot.generatedAt, asOf: ref };
  const alerts = queryStories(snapshot.stories, { from: ref - 24 * HOUR, sort: "importance", limit: 40 }, ctx).stories.filter((s) => s.breaking || s.tier === "major").slice(0, 8);
  return {
    version: 1,
    generatedAt: snapshot.generatedAt,
    defaultPrefs: snapshot.defaultPrefs,
    // More "missed" candidates than shown: the browser drops the ones this reader has opened.
    dashboard: packDashboard(buildDashboard(snapshot.stories, ctx, { missedCount: 16 })),
    alerts,
    // The radar panel shows the newest item of each type; a few per type is plenty.
    radar: { lastSuccessAt: radar.lastSuccessAt, items: (["release", "research", "update", "repository"] as const).flatMap((t) => radar.items.filter((i) => i.type === t).slice(0, 3)) },
    report: { latest: latestReport },
  };
}

/** Store each story once; the dashboard never shows coverage excerpts, so they are dropped. */
export function packDashboard(d: DashboardResponse): PackedDashboard {
  const stories = new Map<number, Story>();
  const ref = (s: Story) => {
    if (!stories.has(s.id)) stories.set(s.id, { ...s, coverage: s.coverage.map(({ excerpt: _e, ...c }) => (void _e, c)) });
    return s.id;
  };
  const ids = (xs: Story[]) => xs.map(ref);
  return {
    top: ids(d.top),
    briefing: ids(d.briefing),
    latest: ids(d.latest),
    latestMore: ids(d.latestMore ?? []),
    tech: ids(d.tech),
    gaming: ids(d.gaming),
    announcements: ids(d.announcements),
    missed: ids(d.missed),
    byCategory: d.byCategory.map((c) => ({ categoryId: c.categoryId, count: c.count, stories: ids(c.stories) })),
    trending: d.trending.map((c) => ({ companyId: c.companyId, count: c.count, top: c.top ? ref(c.top) : null })),
    companies: d.companies.map((c) => ({ companyId: c.companyId, count: c.count, top: c.top ? ref(c.top) : null })),
    rest: { category: d.category, briefingFacts: d.briefingFacts, generatedAt: d.generatedAt },
    stories: [...stories.values()],
  };
}

export function unpackDashboard(p: PackedDashboard): DashboardResponse {
  const byId = new Map(p.stories.map((s) => [s.id, s]));
  const get = (id: number) => byId.get(id)!;
  const list = (xs: number[]) => xs.map(get).filter(Boolean);
  return {
    ...p.rest,
    top: list(p.top),
    briefing: list(p.briefing),
    latest: list(p.latest),
    latestMore: list(p.latestMore ?? []),
    tech: list(p.tech),
    gaming: list(p.gaming),
    announcements: list(p.announcements),
    missed: list(p.missed),
    byCategory: p.byCategory.map((c) => ({ categoryId: c.categoryId, count: c.count, stories: list(c.stories) })),
    trending: p.trending.map((c) => ({ companyId: c.companyId, count: c.count, top: c.top != null ? (byId.get(c.top) ?? null) : null })),
    companies: p.companies.map((c) => ({ companyId: c.companyId, count: c.count, top: c.top != null ? (byId.get(c.top) ?? null) : null })),
  };
}

