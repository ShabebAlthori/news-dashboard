// Export / import of the reader's own data in the web edition (saved articles, read history,
// settings, language and theme), as a JSON file. An imported file is untrusted input: every
// field is rebuilt with known types, and only http(s) links are kept.
import { normalizePrefs } from "./prefs";
import { COMPANY_IDS, EVENT_LABELS, type EventType, type ImportanceTier, type Section } from "./taxonomy";
import { DEFAULT_PREFS, type CoverageRef, type Lang, type Prefs, type SnapshotStory } from "./types";

export type ThemeChoice = "light" | "dark" | "system";

export interface ReaderData {
  app: "TechPulse";
  kind: "reader-data";
  version: 1;
  exportedAt: string;
  settings: Prefs;
  display: { lang: Lang; theme: ThemeChoice };
  saved: SnapshotStory[];
  read: string[];
}

export const MAX_SAVED = 500;
export const MAX_READ = 4000;
/** Larger files are refused before parsing (a full export is well under 2 MB). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function buildReaderData(input: { settings: Prefs; display: ReaderData["display"]; saved: SnapshotStory[]; read: string[] }, now = new Date()): ReaderData {
  return { app: "TechPulse", kind: "reader-data", version: 1, exportedAt: now.toISOString(), ...input };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const isoOrNull = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

/** Only absolute http(s) links (never javascript:, data: or relative ones). */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048) return null;
  try {
    const u = new URL(v);
    // The original spelling is kept: read history is matched against story links as published.
    return u.protocol === "https:" || u.protocol === "http:" ? v : null;
  } catch {
    return null;
  }
}

const TIERS: ImportanceTier[] = ["major", "notable", "standard", "minor"];
const SECTION_IDS: Section[] = ["tech", "gaming", "business"];

function sanitizeCoverage(v: unknown): CoverageRef | null {
  if (!isObj(v)) return null;
  const url = safeUrl(v.url);
  if (!url) return null;
  return {
    articleId: num(v.articleId),
    sourceId: str(v.sourceId),
    sourceName: str(v.sourceName),
    title: str(v.title),
    url,
    publishedAt: isoOrNull(v.publishedAt),
    fetchedAt: isoOrNull(v.fetchedAt) ?? new Date(0).toISOString(),
    official: bool(v.official),
    ...(v.lang === "ar" || v.lang === "en" ? { lang: v.lang } : {}),
  };
}

/** A saved story rebuilt from untrusted JSON, or null without an id, a safe link and a headline. */
export function sanitizeStory(v: unknown): SnapshotStory | null {
  if (!isObj(v) || !isObj(v.title) || !isObj(v.source)) return null;
  const url = safeUrl(v.url);
  const original = str(v.title.original).trim();
  const id = num(v.id, NaN);
  if (!url || !original || !Number.isFinite(id)) return null;
  const summary = isObj(v.summary) ? v.summary : {};
  const breakdown = isObj(v.breakdown) ? v.breakdown : {};
  const fetchedAt = isoOrNull(v.fetchedAt) ?? new Date(0).toISOString();
  const publishedAt = isoOrNull(v.publishedAt);
  const homepage = safeUrl(v.source.homepage);
  const origin = summary.origin === "ai" || summary.origin === "feed" ? summary.origin : "none";
  const fallbackTime = Date.parse(publishedAt ?? fetchedAt);
  return {
    id,
    leadArticleId: num(v.leadArticleId, id),
    title: { original, en: str(v.title.en, original) || original, ar: strOrNull(v.title.ar) },
    summary: { en: strOrNull(summary.en), ar: strOrNull(summary.ar), origin, aiModel: strOrNull(summary.aiModel) },
    url,
    lang: v.lang === "ar" ? "ar" : "en",
    source: { id: str(v.source.id, "unknown"), name: str(v.source.name, new URL(url).hostname), official: bool(v.source.official), ...(homepage ? { homepage } : {}) },
    publishedAt,
    fetchedAt,
    sections: strings(v.sections).filter((s): s is Section => SECTION_IDS.includes(s as Section)),
    categories: strings(v.categories),
    primaryCategory: strOrNull(v.primaryCategory),
    companies: strings(v.companies).filter((c) => COMPANY_IDS.includes(c)),
    eventType: typeof v.eventType === "string" && v.eventType in EVENT_LABELS ? (v.eventType as EventType) : "general",
    rumor: bool(v.rumor),
    importance: Math.min(100, Math.max(0, num(v.importance))),
    tier: TIERS.includes(v.tier as ImportanceTier) ? (v.tier as ImportanceTier) : "standard",
    breaking: bool(v.breaking),
    breakdown: {
      significance: num(breakdown.significance),
      coverage: num(breakdown.coverage),
      credibility: num(breakdown.credibility),
      impact: num(breakdown.impact),
      relevance: num(breakdown.relevance),
      penalties: num(breakdown.penalties),
    },
    sourceCount: Math.max(1, num(v.sourceCount, 1)),
    coverage: (Array.isArray(v.coverage) ? v.coverage : []).map(sanitizeCoverage).filter((c): c is CoverageRef => !!c).slice(0, 50),
    imageUrl: safeUrl(v.imageUrl),
    saved: true,
    read: false,
    sortTime: num(v.sortTime, fallbackTime),
    lastActivity: num(v.lastActivity, fallbackTime),
    firstPublishedAt: typeof v.firstPublishedAt === "number" && Number.isFinite(v.firstPublishedAt) ? v.firstPublishedAt : null,
    significance: num(v.significance),
    baseScore: num(v.baseScore, num(v.importance)),
    policy: bool(v.policy),
  };
}

function sanitizePrefs(v: unknown, defaults: Prefs): Prefs {
  const p = isObj(v) ? v : {};
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  return normalizePrefs({
    interests: Array.isArray(p.interests) ? strings(p.interests) : defaults.interests,
    categoryOrder: Array.isArray(p.categoryOrder) ? strings(p.categoryOrder) : defaults.categoryOrder,
    followedCompanies: Array.isArray(p.followedCompanies) ? strings(p.followedCompanies).filter((c) => COMPANY_IDS.includes(c)) : defaults.followedCompanies,
    showReviews: bool(p.showReviews, defaults.showReviews),
    includeTechPolicy: bool(p.includeTechPolicy, defaults.includeTechPolicy),
    showImages: bool(p.showImages, defaults.showImages),
    refreshMinutes: clamp(num(p.refreshMinutes, defaults.refreshMinutes), 10, 15),
    retentionDays: clamp(num(p.retentionDays, defaults.retentionDays), 3, 365),
  });
}

/** Parses an export file's JSON; null when it is not a TechPulse reader-data export. */
export function parseReaderData(raw: unknown, defaults: Prefs = DEFAULT_PREFS): ReaderData | null {
  if (!isObj(raw) || raw.app !== "TechPulse" || raw.kind !== "reader-data" || raw.version !== 1) return null;
  const display = isObj(raw.display) ? raw.display : {};
  const seen = new Set<string>();
  const saved: SnapshotStory[] = [];
  for (const s of Array.isArray(raw.saved) ? raw.saved : []) {
    const story = sanitizeStory(s);
    if (story && !seen.has(story.url)) {
      seen.add(story.url);
      saved.push(story);
    }
  }
  const read = [...new Set((Array.isArray(raw.read) ? raw.read : []).map(safeUrl).filter((u): u is string => !!u))];
  return {
    app: "TechPulse",
    kind: "reader-data",
    version: 1,
    exportedAt: isoOrNull(raw.exportedAt) ?? new Date(0).toISOString(),
    settings: sanitizePrefs(raw.settings, defaults),
    display: {
      lang: display.lang === "ar" ? "ar" : "en",
      theme: display.theme === "light" || display.theme === "system" ? display.theme : "dark",
    },
    saved: saved.slice(-MAX_SAVED),
    read: read.slice(-MAX_READ),
  };
}

/**
 * Combine imported data with what this browser already has: saved articles and read history are
 * merged (nothing already here is lost unless the limits are reached); settings are replaced.
 */
export function mergeReaderData(current: { saved: SnapshotStory[]; read: string[] }, incoming: ReaderData): { saved: SnapshotStory[]; read: string[]; addedSaved: number; addedRead: number } {
  const have = new Set(current.saved.map((s) => s.url));
  const newSaved = incoming.saved.filter((s) => !have.has(s.url));
  const haveRead = new Set(current.read);
  const newRead = incoming.read.filter((u) => !haveRead.has(u));
  return {
    saved: [...current.saved, ...newSaved].slice(-MAX_SAVED),
    read: [...current.read, ...newRead].slice(-MAX_READ),
    addedSaved: newSaved.length,
    addedRead: newRead.length,
  };
}
