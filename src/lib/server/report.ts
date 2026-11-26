// Weekly Tech Report: a roundup of the week's most important stories, built every Sunday
// from the stories this dashboard collected. It is assembled, not written: sections,
// counts and rankings are computed from real articles, and every entry keeps the
// publisher's headline, summary, source, link and publication time. No AI prose is added.
import type Database from "better-sqlite3";
import { lastReportSlot, nextReportAt } from "@/lib/shared/schedule";
import { PRIORITY_IDS, storyCategory, topicsOf, TRENDING_COMPANY_IDS } from "@/lib/shared/taxonomy";
import type { RadarItem, ReportResponse, ReportStory, SnapshotStory, WeeklyReport } from "@/lib/shared/types";
import { getDb } from "./db";
import { exportSnapshotStories } from "./queries";
import { listRadarItems } from "./radar";
import { getPrefs } from "./settings";

const DAY = 86_400_000;
const KEEP_REPORTS = 12;

function slim(s: SnapshotStory): ReportStory {
  return {
    id: s.id,
    title: s.title,
    summary: { en: s.summary.en, ar: s.summary.ar },
    lang: s.lang,
    url: s.url,
    source: s.source.name,
    publishedAt: s.publishedAt,
    importance: s.importance,
    sourceCount: s.sourceCount,
    imageUrl: s.imageUrl,
  };
}

const RADAR_ORDER: Record<RadarItem["type"], number> = { release: 0, update: 1, repository: 2, research: 3 };
const RADAR_LIMITS: Record<RadarItem["type"], number> = { release: 8, update: 4, repository: 3, research: 3 };

/** Build a report over [start, end) from stored stories and radar items. */
export function buildWeeklyReport(stories: SnapshotStory[], radar: RadarItem[], start: number, end: number, opts: { showReviews: boolean; includeTechPolicy: boolean }): Omit<WeeklyReport, "id"> {
  const inWeek = stories
    .filter((s) => s.sortTime >= start && s.sortTime < end)
    .filter((s) => opts.showReviews || (s.eventType !== "review" && s.eventType !== "opinion"))
    .filter((s) => opts.includeTechPolicy || !s.policy)
    .sort((a, b) => b.importance - a.importance || b.sortTime - a.sortTime);

  // Highlights: the most important stories, at most two from any one category.
  const perCategory = new Map<string, number>();
  const highlights: SnapshotStory[] = [];
  for (const s of inWeek) {
    if (highlights.length >= 5) break;
    const cat = storyCategory(s.categories, undefined, s.primaryCategory) ?? "other";
    const n = perCategory.get(cat) ?? 0;
    if (n >= 2) continue;
    perCategory.set(cat, n + 1);
    highlights.push(s);
  }
  const used = new Set(highlights.map((s) => s.id));
  const sections = PRIORITY_IDS.map((id) => {
    const topics = topicsOf(id);
    const all = inWeek.filter((s) => s.categories.some((t) => topics.includes(t)));
    // Each story appears once in the report: under its highest-priority category.
    const own = all.filter((s) => !used.has(s.id) && storyCategory(s.categories, undefined, s.primaryCategory) === id).slice(0, 4);
    for (const s of own) used.add(s.id);
    return { id, count: all.length, stories: own.map(slim) };
  }).filter((sec) => sec.count > 0);

  const companies = TRENDING_COMPANY_IDS.map((id) => {
    const list = inWeek.filter((s) => s.companies.includes(id));
    return { id, count: list.length, top: list[0] ? slim(list[0]) : null };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const taken: Record<string, number> = {};
  const radarInWeek = radar
    .filter((r) => {
      const t = Date.parse(r.publishedAt ?? r.fetchedAt);
      return t >= start && t < end;
    })
    .sort((a, b) => RADAR_ORDER[a.type] - RADAR_ORDER[b.type] || Date.parse(b.publishedAt ?? b.fetchedAt) - Date.parse(a.publishedAt ?? a.fetchedAt))
    .filter((r) => (taken[r.type] = (taken[r.type] ?? 0) + 1) <= RADAR_LIMITS[r.type]);

  return {
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(),
    generatedAt: new Date(end).toISOString(),
    totals: { stories: inWeek.length, sources: new Set(inWeek.flatMap((s) => [s.source.name, ...s.coverage.map((c) => c.sourceName)])).size, radar: radarInWeek.length },
    highlights: highlights.map(slim),
    sections,
    companies,
    radar: radarInWeek,
  };
}

/**
 * Publish a report when one is due: every Sunday at 02:00 UTC, or straight away when none
 * exists yet. Each report covers the 7 days before it was generated.
 */
export function maybeGenerateWeeklyReport(db: Database.Database = getDb(), now = Date.now()): WeeklyReport | null {
  const latest = db.prepare("SELECT generated_at FROM weekly_reports ORDER BY generated_at DESC LIMIT 1").get() as { generated_at: number } | undefined;
  if (latest && latest.generated_at >= lastReportSlot(now)) return null;
  const start = now - 7 * DAY;
  const prefs = getPrefs();
  const report = buildWeeklyReport(exportSnapshotStories(8, 5000), listRadarItems(8, 200, db, start, now), start, now, prefs);
  if (report.totals.stories === 0) return null;
  const id = Number(
    db.prepare("INSERT INTO weekly_reports (period_start, period_end, generated_at, data) VALUES (?, ?, ?, ?)").run(start, now, now, JSON.stringify(report)).lastInsertRowid,
  );
  db.prepare("DELETE FROM weekly_reports WHERE id NOT IN (SELECT id FROM weekly_reports ORDER BY generated_at DESC LIMIT ?)").run(KEEP_REPORTS);
  return { id, ...report };
}

interface ReportRow {
  id: number;
  period_start: number;
  period_end: number;
  generated_at: number;
  data: string;
}

function parseReport(r: ReportRow): WeeklyReport | null {
  try {
    return { id: r.id, ...(JSON.parse(r.data) as Omit<WeeklyReport, "id">) };
  } catch {
    return null;
  }
}

export function listReports(limit = KEEP_REPORTS, db: Database.Database = getDb()): WeeklyReport[] {
  const rows = db.prepare("SELECT * FROM weekly_reports ORDER BY generated_at DESC LIMIT ?").all(limit) as ReportRow[];
  return rows.map(parseReport).filter((r): r is WeeklyReport => r !== null);
}

export function getReport(id?: number | null, db: Database.Database = getDb()): ReportResponse {
  const rows = db.prepare("SELECT id, period_start, period_end, generated_at FROM weekly_reports ORDER BY generated_at DESC").all() as Omit<ReportRow, "data">[];
  const wanted = id ? rows.find((r) => r.id === id) : rows[0];
  const full = wanted ? (db.prepare("SELECT * FROM weekly_reports WHERE id = ?").get(wanted.id) as ReportRow | undefined) : undefined;
  const now = Date.now();
  return {
    latest: full ? parseReport(full) : null,
    archive: rows.map((r) => ({ id: r.id, periodStart: new Date(r.period_start).toISOString(), periodEnd: new Date(r.period_end).toISOString() })),
    nextAt: new Date(nextReportAt(now)).toISOString(),
    generatedAt: new Date(now).toISOString(),
  };
}
