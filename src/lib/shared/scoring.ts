// Importance scoring. Pure functions so they are easy to test and to explain.
//
//   importance (0–100) =
//       35 × significance   (what kind of event is it — acquisition, earnings, launch…)
//     + 20 × coverage       (how many independent publishers report it)
//     + 15 × credibility    (best source reliability in the cluster)
//     + 15 × impact         (size of the companies / sector involved)
//     + 15 × relevance      (match with the reader's selected categories & companies)
//     − penalties           (rumour, review/opinion, clickbait signals)

import { companyById, groupOfTopic, tierForScore, type EventType, type ImportanceTier } from "@/lib/shared/taxonomy";
import type { ImportanceBreakdown } from "@/lib/shared/types";

export const WEIGHTS = { significance: 35, coverage: 20, credibility: 15, impact: 15, relevance: 15 } as const;

export function coverageFactor(independentSources: number): number {
  if (independentSources <= 1) return 0;
  if (independentSources === 2) return 0.45;
  if (independentSources === 3) return 0.7;
  if (independentSources === 4) return 0.85;
  return 1;
}

const HIGH_IMPACT_CATEGORIES = new Set(["ai", "chips", "security", "earnings", "acquisitions", "layoffs", "leadership"]);

export function impactFactor(companies: string[], categories: string[]): number {
  let best = 0.3;
  for (const id of companies) {
    const tier = companyById(id)?.tier;
    if (tier === 1) best = Math.max(best, 1);
    else if (tier === 2) best = Math.max(best, 0.75);
    else if (tier === 3) best = Math.max(best, 0.55);
  }
  if (categories.some((c) => HIGH_IMPACT_CATEGORIES.has(c))) best = Math.min(1, best + 0.1);
  return best;
}

export function penaltyPoints(opts: { rumor: boolean; eventType: EventType; clickbait: number; headlineOnly: boolean }): number {
  let p = 0;
  if (opts.rumor) p += 6;
  if (opts.eventType === "review" || opts.eventType === "opinion") p += 12;
  p += Math.round(opts.clickbait * 8);
  if (opts.headlineOnly) p += 2;
  return p;
}

/** Score without the reader-relevance component (stored per cluster). */
export function baseScore(b: Omit<ImportanceBreakdown, "relevance">): number {
  return (
    WEIGHTS.significance * b.significance +
    WEIGHTS.coverage * b.coverage +
    WEIGHTS.credibility * b.credibility +
    WEIGHTS.impact * b.impact -
    b.penalties
  );
}

export interface RelevancePrefs {
  /** Enabled priority categories / extra topics. */
  interests: Set<string>;
  followed: Set<string>;
  /** Reader's priority order of the 8 categories (first = most important). */
  order: string[];
}

export function toRelevancePrefs(prefs: { interests: string[]; followedCompanies: string[]; categoryOrder: string[] }): RelevancePrefs {
  return { interests: new Set(prefs.interests), followed: new Set(prefs.followedCompanies), order: prefs.categoryOrder };
}

/**
 * How well a story matches the reader (0..1). Categories higher in the reader's priority
 * list weigh more: 1st → 1.0, each step down −0.05 (8th → 0.65); extra topics → 0.5.
 */
export function relevanceFactor(categories: string[], companies: string[], prefs: RelevancePrefs): number {
  let catWeight = 0;
  for (const topic of categories) {
    const group = groupOfTopic(topic);
    if (!prefs.interests.has(group)) continue;
    const rank = prefs.order.indexOf(group);
    catWeight = Math.max(catWeight, rank >= 0 ? 1 - rank * 0.05 : 0.5);
  }
  const companyMatch = companies.some((c) => prefs.followed.has(c));
  if (catWeight > 0 && companyMatch) return 1;
  if (companyMatch) return Math.max(0.85, 0.45 + 0.45 * catWeight);
  if (catWeight > 0) return Math.round((0.45 + 0.45 * catWeight) * 1000) / 1000;
  if (categories.length === 0 && companies.length === 0) return 0.35;
  return 0.25;
}

export function finalScore(base: number, relevance: number): number {
  return Math.max(0, Math.min(100, Math.round(base + WEIGHTS.relevance * relevance)));
}

/**
 * "Breaking" is deliberately hard to earn: the story must be fresh, confirmed
 * (not a rumour), rated a major event and independently reported by at least
 * three publishers.
 */
export function isBreaking(opts: {
  firstPublishedAt: number | null;
  now: number;
  sourceCount: number;
  significance: number;
  rumor: boolean;
  score: number;
}): boolean {
  if (!opts.firstPublishedAt || opts.rumor) return false;
  const ageHours = (opts.now - opts.firstPublishedAt) / 3_600_000;
  return ageHours >= 0 && ageHours <= 6 && opts.sourceCount >= 3 && opts.significance >= 0.7 && opts.score >= 72;
}

export function tier(score: number): ImportanceTier {
  return tierForScore(score);
}

/** Combine rule-based significance with an AI rating (1–5) when available. */
export function combinedSignificance(heuristic: number, aiRating: number | null): number {
  if (aiRating == null) return heuristic;
  const ai = (Math.min(5, Math.max(1, aiRating)) - 1) / 4;
  return Math.round((0.5 * heuristic + 0.5 * ai) * 1000) / 1000;
}
