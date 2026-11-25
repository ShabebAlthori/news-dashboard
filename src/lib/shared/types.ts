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

export interface DashboardResponse {
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
    provider: "anthropic" | "ollama" | "none";
    model: string | null;
    configured: boolean;
    lastError: string | null;
    pending: number;
  };
  serverTime: string;
}

export interface Prefs {
  interests: string[]; // category ids
  followedCompanies: string[];
  showReviews: boolean;
  includeTechPolicy: boolean;
  showImages: boolean;
  refreshMinutes: number; // 10..15
  retentionDays: number;
}

export const DEFAULT_PREFS: Prefs = {
  interests: [],
  followedCompanies: [],
  showReviews: false,
  includeTechPolicy: true,
  showImages: true,
  refreshMinutes: 12,
  retentionDays: 30,
};
