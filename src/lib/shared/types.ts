// Client-safe types shared between API routes and UI.
import type { EventType, ImportanceTier, Section } from "./taxonomy";

export type Lang = "en" | "ar";

export interface CoverageRef {
  articleId: number;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string | null;
  fetchedAt: string;
  official: boolean;
  /** The publisher's own excerpt for this article (used when stories are not grouped). */
  excerpt?: string | null;
  /** Language the article was published in. */
  lang?: Lang;
}

export type SummaryOrigin = "ai" | "feed" | "none";

export interface ImportanceBreakdown {
  significance: number; // 0..1
  coverage: number; // 0..1
  credibility: number; // 0..1
  impact: number; // 0..1
  relevance: number; // 0..1
  penalties: number; // points subtracted
}

export interface Story {
  id: number; // cluster id
  leadArticleId: number;
  title: { original: string; en: string; ar: string | null };
  summary: { en: string | null; ar: string | null; origin: SummaryOrigin; aiModel: string | null };
  url: string;
  /** Language the lead article was published in ("ar" for Arabic-language sources). */
  lang: Lang;
  source: { id: string; name: string; official: boolean };
  publishedAt: string | null; // as reported by the source; null if the source gave none
  fetchedAt: string; // when this dashboard first retrieved the lead article
  sections: Section[];
  categories: string[];
  companies: string[];
  eventType: EventType;
  rumor: boolean;
  importance: number; // 0..100
  tier: ImportanceTier;
  breaking: boolean;
  breakdown: ImportanceBreakdown;
  sourceCount: number; // independent publishers covering the story
  coverage: CoverageRef[]; // other articles in the cluster (excluding lead)
  imageUrl: string | null;
  saved: boolean;
  read: boolean;
}

export interface StoriesResponse {
  stories: Story[];
  total: number;
  nextCursor: number | null;
  generatedAt: string;
}

export interface CompanyPulse {
  companyId: string;
  count: number;
  top: Story | null;
}

export interface CategoryPulse {
  categoryId: string; // a priority category id
  count: number; // stories in the last 48 hours
  stories: Story[]; // the most important few
}

export interface DashboardResponse {
  /** The reader's priority categories, in their order. */
  byCategory: CategoryPulse[];
  top: Story[];
  tech: Story[];
  gaming: Story[];
  announcements: Story[];
  missed: Story[];
  companies: CompanyPulse[];
  generatedAt: string;
}

export interface SourceHealth {
  id: string;
  name: string;
  section: string;
  kind: "publisher" | "official";
  homepage: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  articleCount: number;
  aiAllowed: boolean;
}

export interface StatusResponse {
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  running: boolean;
  nextRunAt: string | null;
  intervalMinutes: number;
  sources: { total: number; enabled: number; healthy: number; failing: number };
  failingSources: { id: string; name: string; error: string | null }[];
  articles: number;
  stories: number;
  ai: {
    provider: "anthropic" | "gemini" | "ollama" | "none";
    model: string | null;
    configured: boolean;
    lastError: string | null;
    pending: number;
  };
  serverTime: string;
}

export interface Prefs {
  interests: string[]; // enabled priority categories / extra topics (legacy: topic ids)
  categoryOrder: string[]; // the reader's priority order of the 8 categories
  followedCompanies: string[];
  showReviews: boolean;
  includeTechPolicy: boolean;
  showImages: boolean;
  refreshMinutes: number; // 10..15
  retentionDays: number;
}

export const DEFAULT_PREFS: Prefs = {
  interests: [],
  categoryOrder: [],
  followedCompanies: [],
  showReviews: false,
  includeTechPolicy: true,
  showImages: true,
  refreshMinutes: 12,
  retentionDays: 30,
};

// ---------------------------------------------------------------------------
// Web edition (static hosting): the whole dataset ships as one JSON snapshot.

/** A story plus the raw ranking inputs, so the browser can rank with the reader's own preferences. */
export interface SnapshotStory extends Story {
  sortTime: number; // first publication (or retrieval) time, ms
  lastActivity: number; // latest publication time in the cluster, ms
  firstPublishedAt: number | null;
  significance: number;
  baseScore: number; // importance without the reader-relevance component
  policy: boolean;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  retentionDays: number;
  status: StatusResponse;
  sources: SourceHealth[];
  defaultPrefs: Prefs;
  stories: SnapshotStory[];
}
