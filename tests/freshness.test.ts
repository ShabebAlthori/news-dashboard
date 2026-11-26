// Item 1: stale-data detection and dashboard windows measured from the data's own time.
import { describe, expect, it } from "vitest";
import { dataFreshness, formatAge } from "@/lib/shared/freshness";
import { buildDashboard } from "@/lib/shared/rank";
import { DEFAULT_PREFS, type SnapshotStory } from "@/lib/shared/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.UTC(2026, 10, 26, 18);
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("data freshness", () => {
  it("uses the published interval: green < 2×, amber 2×–6×, red beyond", () => {
    expect(dataFreshness(ago(20 * MIN), 15, now).level).toBe("fresh");
    expect(dataFreshness(ago(31 * MIN), 15, now).level).toBe("aging");
    expect(dataFreshness(ago(89 * MIN), 15, now).level).toBe("aging");
    expect(dataFreshness(ago(91 * MIN), 15, now).level).toBe("stale");
    expect(dataFreshness(ago(4.5 * HOUR), 15, now).level).toBe("stale");
    // A longer interval moves the thresholds.
    expect(dataFreshness(ago(50 * MIN), 30, now).level).toBe("fresh");
  });

  it("handles missing data", () => {
    expect(dataFreshness(null, 15, now)).toEqual({ level: "unknown", ageMs: null });
    expect(dataFreshness("garbage", 15, now).level).toBe("unknown");
  });

  it("formats the age in both languages", () => {
    expect(formatAge(4.5 * HOUR, "en")).toBe("5 hours");
    expect(formatAge(35 * MIN, "en")).toBe("35 minutes");
    expect(formatAge(2 * HOUR, "ar")).toBe("ساعتان");
  });
});

describe("dashboard windows follow the snapshot time", () => {
  const generatedAt = now - 5 * HOUR;
  const story = (id: number, hoursBeforeSnapshot: number): SnapshotStory => {
    const t = generatedAt - hoursBeforeSnapshot * HOUR;
    return {
      id,
      leadArticleId: id,
      title: { original: `S${id}`, en: `S${id}`, ar: null },
      summary: { en: null, ar: null, origin: "none", aiModel: null },
      url: `https://e.com/${id}`,
      lang: "en",
      source: { id: "verge", name: "The Verge", official: false },
      publishedAt: new Date(t).toISOString(),
      fetchedAt: new Date(t).toISOString(),
      sections: ["tech"],
      categories: ["ai"],
      companies: [],
      eventType: "general",
      rumor: false,
      importance: 50,
      tier: "standard",
      breaking: false,
      breakdown: { significance: 0.5, coverage: 0, credibility: 0.9, impact: 0.3, relevance: 0, penalties: 0 },
      sourceCount: 1,
      coverage: [],
      imageUrl: null,
      saved: false,
      read: false,
      sortTime: t,
      lastActivity: t,
      firstPublishedAt: t,
      significance: 0.5,
      baseScore: 50,
      policy: false,
    } as SnapshotStory;
  };
  // 10 stories spread over the 22 hours before the snapshot was generated.
  const stories = Array.from({ length: 10 }, (_, i) => story(i + 1, 1 + i * 2.3));
  const ctx = { prefs: { ...DEFAULT_PREFS }, saved: new Map(), read: new Set<string>(), now, generatedAt: new Date(generatedAt).toISOString() };

  it("counts the last 24 hours relative to generatedAt, not the reader's clock", () => {
    const withAsOf = buildDashboard(stories, { ...ctx, asOf: generatedAt });
    expect(withAsOf.briefingFacts.stories).toBe(10);
    // Without asOf the same snapshot, viewed 5 hours later, would lose stories from the window.
    const clockOnly = buildDashboard(stories, ctx);
    expect(clockOnly.briefingFacts.stories).toBeLessThan(10);
  });
});
