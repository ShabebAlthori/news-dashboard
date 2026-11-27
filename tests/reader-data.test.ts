// Item 9: export / import of the reader's data (web edition). Imported files are untrusted.
import { describe, expect, it } from "vitest";
import { buildReaderData, mergeReaderData, parseReaderData, safeUrl, sanitizeStory } from "@/lib/shared/reader-data";
import { PRIORITY_IDS } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type Prefs, type SnapshotStory } from "@/lib/shared/types";

const t = Date.UTC(2026, 10, 26, 12);
function story(id: number, extra: Partial<SnapshotStory> = {}): SnapshotStory {
  return {
    id,
    leadArticleId: id * 10,
    title: { original: `Story ${id}`, en: `Story ${id}`, ar: `خبر ${id}` },
    summary: { en: "Summary.", ar: "ملخص.", origin: "ai", aiModel: "model-x" },
    url: `https://example.com/news/${id}`,
    lang: "en",
    source: { id: "verge", name: "The Verge", official: false, homepage: "https://www.theverge.com" },
    publishedAt: new Date(t).toISOString(),
    fetchedAt: new Date(t + 60_000).toISOString(),
    sections: ["tech"],
    categories: ["ai"],
    primaryCategory: "ai",
    companies: ["nvidia"],
    eventType: "launch",
    rumor: false,
    importance: 64,
    tier: "notable",
    breaking: false,
    breakdown: { significance: 0.6, coverage: 0.2, credibility: 0.9, impact: 0.4, relevance: 0.1, penalties: 0 },
    sourceCount: 2,
    coverage: [{ articleId: id * 10 + 1, sourceId: "engadget", sourceName: "Engadget", title: "Other take", url: `https://engadget.com/${id}`, publishedAt: null, fetchedAt: new Date(t).toISOString(), official: false }],
    imageUrl: "https://img.example.com/1.jpg",
    saved: true,
    read: false,
    sortTime: t,
    lastActivity: t,
    firstPublishedAt: t,
    significance: 0.6,
    baseScore: 62,
    policy: false,
    ...extra,
  };
}

const prefs: Prefs = { ...DEFAULT_PREFS, interests: ["ai", "data"], categoryOrder: [...PRIORITY_IDS].reverse(), followedCompanies: ["nvidia", "apple"], showImages: false };
const file = () =>
  JSON.parse(JSON.stringify(buildReaderData({ settings: prefs, display: { lang: "ar", theme: "light" }, saved: [story(1), story(2)], read: ["https://example.com/news/1", "https://other.example/x"] }, new Date(t))));

describe("reader data export / import", () => {
  it("round-trips an export unchanged", () => {
    const parsed = parseReaderData(file())!;
    expect(parsed).not.toBeNull();
    expect(parsed.saved).toEqual([story(1), story(2)]);
    expect(parsed.read).toEqual(["https://example.com/news/1", "https://other.example/x"]);
    expect(parsed.display).toEqual({ lang: "ar", theme: "light" });
    expect(parsed.settings.followedCompanies).toEqual(["nvidia", "apple"]);
    expect(parsed.settings.categoryOrder).toEqual([...PRIORITY_IDS].reverse());
    expect(parsed.settings.showImages).toBe(false);
  });

  it("refuses files that are not a TechPulse export", () => {
    expect(parseReaderData(null)).toBeNull();
    expect(parseReaderData([])).toBeNull();
    expect(parseReaderData({ app: "Other", kind: "reader-data", version: 1 })).toBeNull();
    expect(parseReaderData({ ...file(), version: 2 })).toBeNull();
  });

  it("keeps only http(s) links", () => {
    expect(safeUrl("https://a.example/x?y=1")).toBe("https://a.example/x?y=1");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "/relative", "ftp://x.example", 42, null]) expect(safeUrl(bad)).toBeNull();
    const raw = file();
    raw.saved.push({ ...story(3), url: "javascript:alert(1)" });
    raw.saved[0].imageUrl = "javascript:alert(2)";
    raw.saved[0].source.homepage = "data:text/html,x";
    raw.saved[0].coverage.push({ ...raw.saved[0].coverage[0], url: "javascript:alert(3)" });
    raw.read.push("javascript:alert(4)", 7);
    const parsed = parseReaderData(raw)!;
    expect(parsed.saved.map((s) => s.id)).toEqual([1, 2]);
    expect(parsed.saved[0].imageUrl).toBeNull();
    expect(parsed.saved[0].source.homepage).toBeUndefined();
    expect(parsed.saved[0].coverage).toHaveLength(1);
    expect(parsed.read).toHaveLength(2);
  });

  it("rebuilds damaged stories with safe defaults, and drops unusable ones", () => {
    expect(sanitizeStory({ id: 5, url: "https://x.example/5", title: {}, source: {} })).toBeNull(); // no headline
    const s = sanitizeStory({ id: 6, url: "https://x.example/6", title: { original: "Six" }, source: { name: "X" }, tier: "mega", eventType: "nonsense", companies: ["nvidia", "evil"], sections: ["tech", "x"], importance: 500 })!;
    expect(s).toMatchObject({ tier: "standard", eventType: "general", companies: ["nvidia"], sections: ["tech"], importance: 100, coverage: [], saved: true });
    expect(s.title.en).toBe("Six");
  });

  it("checks the settings and display values", () => {
    const raw = file();
    raw.settings = { followedCompanies: ["nvidia", "not-a-company"], refreshMinutes: 1, retentionDays: "x", showReviews: "yes" };
    raw.display = { lang: "fr", theme: "neon" };
    const parsed = parseReaderData(raw, { ...DEFAULT_PREFS, retentionDays: 14 })!;
    expect(parsed.settings.followedCompanies).toEqual(["nvidia"]);
    expect(parsed.settings.refreshMinutes).toBe(10);
    expect(parsed.settings.retentionDays).toBe(14);
    expect(parsed.settings.showReviews).toBe(false);
    expect(parsed.settings.categoryOrder).toHaveLength(PRIORITY_IDS.length);
    expect(parsed.display).toEqual({ lang: "en", theme: "dark" });
  });

  it("merges saved articles and read history without losing what the browser has", () => {
    const incoming = parseReaderData(file())!;
    const merged = mergeReaderData({ saved: [story(2), story(9)], read: ["https://example.com/news/1"] }, incoming);
    expect(merged.saved.map((s) => s.id)).toEqual([2, 9, 1]);
    expect(merged.addedSaved).toBe(1);
    expect(merged.read).toEqual(["https://example.com/news/1", "https://other.example/x"]);
    expect(merged.addedRead).toBe(1);
  });
});
