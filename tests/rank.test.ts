// The web edition ranks, filters and searches in the browser; check it matches the server rules.
import { describe, expect, it } from "vitest";
import { buildDashboard, queryStories, type RankContext } from "@/lib/shared/rank";
import { CATEGORY_IDS } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type Prefs, type SnapshotStory } from "@/lib/shared/types";

const now = Date.UTC(2026, 10, 25, 12);
const HOUR = 3_600_000;
const prefs: Prefs = { ...DEFAULT_PREFS, interests: [...CATEGORY_IDS], followedCompanies: ["nvidia", "sony"] };

let nextId = 1;
function story({ title, hoursAgo, ...p }: Omit<Partial<SnapshotStory>, "title"> & { title: string; hoursAgo: number }): SnapshotStory {
  const id = nextId++;
  const t = now - hoursAgo * HOUR;
  return {
    id,
    leadArticleId: id,
    title: { original: title, en: title, ar: title.includes("Nvidia") ? "إنفيديا تعيد تعيين رئيسها التنفيذي" : null },
    summary: { en: "Summary.", ar: null, origin: "feed", aiModel: null },
    url: `https://example.com/${id}`,
    source: { id: "verge", name: "The Verge", official: false },
    publishedAt: new Date(t).toISOString(),
    fetchedAt: new Date(t + 60_000).toISOString(),
    sections: ["tech"],
    categories: [],
    companies: [],
    eventType: "general",
    rumor: false,
    importance: 0,
    tier: "minor",
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
    baseScore: 40,
    policy: false,
    ...p,
  } as SnapshotStory;
}

const stories = [
  story({ title: "Nvidia reinstates its CEO", hoursAgo: 2, companies: ["nvidia"], categories: ["leadership"], sections: ["tech", "business"], baseScore: 75, significance: 0.85, sourceCount: 4, eventType: "leadership" }),
  story({ title: "Minor app update ships", hoursAgo: 1, categories: ["software"], baseScore: 30 }),
  story({ title: "PS6 review: fast and quiet", hoursAgo: 5, sections: ["gaming"], categories: ["consoles"], eventType: "review", baseScore: 50 }),
  story({ title: "EU fines a chipmaker", hoursAgo: 30, categories: ["chips"], policy: true, eventType: "regulation", baseScore: 60 }),
  story({ title: "Old story", hoursAgo: 200, baseScore: 90 }),
];

const ctx = (over: Partial<RankContext> = {}): RankContext => ({ prefs, saved: new Map(), read: new Set(), now, generatedAt: new Date(now).toISOString(), ...over });

describe("web edition ranking", () => {
  it("ranks by importance with reader relevance and marks breaking stories", () => {
    const { stories: list } = queryStories(stories, { from: now - 48 * HOUR }, ctx());
    expect(list[0].title.original).toBe("Nvidia reinstates its CEO");
    expect(list[0].breaking).toBe(true);
    expect(list[0].importance).toBe(90); // 75 + 15 × 1.0 (followed company + interest)
    expect(list.map((s) => s.title.original)).not.toContain("Old story"); // outside the date range
  });

  it("hides reviews unless enabled, and policy stories when disabled", () => {
    const base = queryStories(stories, {}, ctx()).stories.map((s) => s.title.original);
    expect(base).not.toContain("PS6 review: fast and quiet");
    const withReviews = queryStories(stories, {}, ctx({ prefs: { ...prefs, showReviews: true } })).stories.map((s) => s.title.original);
    expect(withReviews).toContain("PS6 review: fast and quiet");
    const noPolicy = queryStories(stories, {}, ctx({ prefs: { ...prefs, includeTechPolicy: false } })).stories.map((s) => s.title.original);
    expect(noPolicy).not.toContain("EU fines a chipmaker");
  });

  it("filters by section, category and company, sorts by newest and searches in Arabic", () => {
    expect(queryStories(stories, { company: "nvidia" }, ctx()).total).toBe(1);
    expect(queryStories(stories, { category: "software" }, ctx()).stories[0].title.original).toBe("Minor app update ships");
    expect(queryStories(stories, { section: "gaming" }, ctx({ prefs: { ...prefs, showReviews: true } })).total).toBe(1);
    expect(queryStories(stories, { sort: "newest", from: now - 48 * HOUR }, ctx()).stories[0].title.original).toBe("Minor app update ships");
    expect(queryStories(stories, { q: "إنفيديا" }, ctx()).total).toBe(1);
    expect(queryStories(stories, { q: "nvid" }, ctx()).total).toBe(1);
  });

  it("keeps saved stories even after they leave the snapshot", () => {
    const gone = story({ title: "Saved last month", hoursAgo: 900 });
    const res = queryStories(stories, { savedOnly: true }, ctx({ saved: new Map([[gone.url, gone]]) }));
    expect(res.stories.map((s) => s.title.original)).toEqual(["Saved last month"]);
    expect(res.stories[0].saved).toBe(true);
  });

  it("builds the dashboard and excludes opened stories from 'missed'", () => {
    // A normal day: enough recent stories that the dashboard keeps its 24-hour window.
    const recent = Array.from({ length: 14 }, (_, i) => story({ title: `Recent ${i}`, hoursAgo: 1 + i * 0.5, baseScore: 30 }));
    const older = story({ title: "Important from yesterday", hoursAgo: 30, baseScore: 70, categories: ["ai"] });
    const all = [...stories, ...recent, older];
    expect(buildDashboard(all, ctx()).top.map((s) => s.title.original)).not.toContain("Important from yesterday");
    expect(buildDashboard(all, ctx()).missed.map((s) => s.title.original)).toContain("Important from yesterday");
    const afterReading = buildDashboard(all, ctx({ read: new Set([older.url]) }));
    expect(afterReading.missed.map((s) => s.title.original)).not.toContain("Important from yesterday");
    expect(buildDashboard(all, ctx()).companies.find((c) => c.companyId === "nvidia")?.count).toBe(1);
  });
});
