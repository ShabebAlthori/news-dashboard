// Personalized priority categories: taxonomy, preference migration, ranking and classification.
import { describe, expect, it } from "vitest";
import { classify } from "@/lib/server/classify";
import { sourceById } from "@/lib/server/sources";
import { normalizePrefs } from "@/lib/shared/prefs";
import { queryStories } from "@/lib/shared/rank";
import { relevanceFactor, toRelevancePrefs } from "@/lib/shared/scoring";
import { INTEREST_IDS, PRIORITY_CATEGORIES, PRIORITY_IDS, primaryCategory, topicsOf } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type Prefs, type SnapshotStory } from "@/lib/shared/types";

describe("priority categories", () => {
  it("are exactly the eight requested categories, in order", () => {
    expect(PRIORITY_CATEGORIES.map((c) => c.en)).toEqual([
      "Data Science & Analytics",
      "AI & Artificial Intelligence",
      "Business & Financial Results",
      "Programming & Open Source",
      "Cybersecurity & Hacking",
      "PC Hardware & Gaming",
      "Saudi Technology & Startups",
      "Robotics",
    ]);
  });

  it("group the existing detailed topics", () => {
    expect(topicsOf("hardware-gaming")).toEqual(expect.arrayContaining(["hardware", "chips", "consoles", "pc-gaming", "engines"]));
    expect(topicsOf("business")).toEqual(expect.arrayContaining(["earnings", "acquisitions", "layoffs"]));
    expect(topicsOf("consoles")).toEqual(["consoles"]);
    expect(primaryCategory(["consoles", "ai"])).toBe("ai");
    expect(primaryCategory(["consoles", "ai"], ["hardware-gaming", ...PRIORITY_IDS.filter((id) => id !== "hardware-gaming")])).toBe("hardware-gaming");
  });
});

describe("preference migration", () => {
  it("maps old topic-level interests to categories and switches on the new ones", () => {
    const old = { ...DEFAULT_PREFS, interests: ["ai", "security", "consoles", "earnings", "mobile"], categoryOrder: undefined } as unknown as Prefs;
    const p = normalizePrefs(old);
    expect(p.categoryOrder).toEqual(PRIORITY_IDS);
    expect(p.interests).toEqual(["data", "ai", "business", "security", "hardware-gaming", "saudi", "robotics", "mobile"]);
  });

  it("keeps a reader's own order and disabled categories", () => {
    const p = normalizePrefs({ ...DEFAULT_PREFS, interests: ["ai", "robotics"], categoryOrder: ["robotics", "ai"] });
    expect(p.categoryOrder.slice(0, 2)).toEqual(["robotics", "ai"]);
    expect(p.categoryOrder).toHaveLength(8);
    expect(p.interests).toEqual(["ai", "robotics"]);
  });

  it("starts with everything on", () => {
    expect(normalizePrefs({ ...DEFAULT_PREFS }).interests).toEqual(INTEREST_IDS);
  });
});

describe("priority-weighted relevance", () => {
  const prefs = toRelevancePrefs(normalizePrefs({ ...DEFAULT_PREFS }));
  it("ranks higher-priority categories higher", () => {
    const data = relevanceFactor(["data"], [], prefs);
    const ai = relevanceFactor(["ai"], [], prefs);
    const robotics = relevanceFactor(["robotics"], [], prefs);
    const phones = relevanceFactor(["mobile"], [], prefs);
    expect(data).toBeGreaterThan(ai);
    expect(ai).toBeGreaterThan(robotics);
    expect(robotics).toBeGreaterThan(phones);
  });
  it("follows the reader's order and switches", () => {
    const custom = toRelevancePrefs(normalizePrefs({ ...DEFAULT_PREFS, interests: [...INTEREST_IDS], categoryOrder: ["robotics", ...PRIORITY_IDS.filter((x) => x !== "robotics")] }));
    expect(relevanceFactor(["robotics"], [], custom)).toBeGreaterThan(relevanceFactor(["data"], [], custom));
    const off = toRelevancePrefs(normalizePrefs({ ...DEFAULT_PREFS, interests: ["ai"], categoryOrder: PRIORITY_IDS }));
    expect(relevanceFactor(["robotics"], [], off)).toBeLessThan(relevanceFactor(["ai"], [], off));
  });
});

describe("category filter", () => {
  const base = { saved: false, read: false, sortTime: 1, lastActivity: 1, firstPublishedAt: null, significance: 0.5, baseScore: 50, policy: false };
  const mk = (id: number, categories: string[]) =>
    ({
      ...base,
      id,
      leadArticleId: id,
      title: { original: `S${id}`, en: `S${id}`, ar: null },
      summary: { en: null, ar: null, origin: "none", aiModel: null },
      url: `https://e.com/${id}`,
      lang: "en",
      source: { id: "verge", name: "The Verge", official: false },
      publishedAt: null,
      fetchedAt: new Date(0).toISOString(),
      sections: ["tech"],
      categories,
      companies: [],
      eventType: "general",
      rumor: false,
      importance: 0,
      tier: "minor",
      breaking: false,
      breakdown: { significance: 0.5, coverage: 0, credibility: 0.8, impact: 0.3, relevance: 0, penalties: 0 },
      sourceCount: 1,
      coverage: [],
      imageUrl: null,
    }) as SnapshotStory;
  const stories = [mk(1, ["consoles"]), mk(2, ["hardware"]), mk(3, ["ai"])];
  const ctx = { prefs: { ...DEFAULT_PREFS }, saved: new Map(), read: new Set<string>(), now: 10, generatedAt: "" };
  it("matches every topic of a priority category", () => {
    expect(queryStories(stories, { category: "hardware-gaming" }, ctx).total).toBe(2);
    expect(queryStories(stories, { category: "consoles" }, ctx).total).toBe(1);
  });
});

describe("classification of the new categories", () => {
  const tech = sourceById("verge")!;
  const arabic = sourceById("aitnews")!;
  const run = (title: string, source = tech, text = "") => classify({ title, text, feedCategories: [], source });

  it.each([
    ["Ocient raises $100 million as agentic AI drives growth in large-scale analytics", "data"],
    ["DuckDB 2.0 vs Polars 2.0 in five real-world tests", "data"],
    ["SoftBank acquires Marc Raibert's Robotics and AI Institute", "robotics"],
    ["Genesis AI raises $500M to deploy glove-wearing robots", "robotics"],
    ["Saudi's BRKZ closes $17M Series A for its construction tech platform", "saudi"],
    ["Humain planning $10B VC fund to invest in US, European, and Asian startups", "saudi"],
  ])("%s → %s", (title, topic) => {
    const c = run(title);
    expect(c.excluded).toBe(false);
    expect(c.categories).toContain(topic);
  });

  it("does not tag security stories as data science, or passing Saudi mentions as Saudi tech", () => {
    expect(run("Database Leaks Expose 3.5 Billion Usernames, Passwords, and Documents").categories).not.toContain("data");
    expect(run("Saudi OpenAI eavesdropper who bugged company office had hundreds of private recordings").categories).not.toContain("saudi");
    expect(run("Google is opening an AI hub in Saudi Arabia").categories).toContain("saudi");
  });

  it("needs a technology angle for Saudi stories", () => {
    expect(run("Saudi Arabia announces new tourism visa rules").excluded).toBe(true);
    // Government tech initiatives are technology news, not politics.
    const c = run("Saudi minister announces SDAIA AI program for government services");
    expect(c.excluded).toBe(false);
    expect(c.categories).toContain("saudi");
  });

  it("classifies Arabic headlines", () => {
    const saudiAi = run("السعودية تعتزم إطلاق وكيل ذكاء اصطناعي شخصي عبر «توكلنا» في فبراير 2027", arabic);
    expect(saudiAi.categories).toEqual(expect.arrayContaining(["saudi", "ai"]));
    expect(saudiAi.rumor).toBe(true); // "تعتزم" = intends: not yet done
    const samsung = run("سامسونج تخفض مستهدف شحنات هواتفها في 2027 إلى 210 ملايين وحدة", arabic);
    expect(samsung.companies).toContain("samsung");
    expect(samsung.categories).toContain("mobile");
    expect(run("شركة ناشئة سعودية تجمع 5 ملايين دولار في جولة تمويلية", arabic).categories).toEqual(expect.arrayContaining(["saudi", "strategy"]));
    expect(run("اختراق يطال بيانات ملايين المستخدمين", arabic).eventType).toBe("security-incident");
  });

  it.each([
    ["عروض نيسان للشركات بخصومات تصل إلى 38 ألف درهم", "deals"],
    ["كيفية تفعيل الوضع الداكن في واتساب", "guides"],
    ["الهلال يفوز على النصر في دوري روشن", "sports"],
    ["ترامب كلف فانس بالتواصل مع جنسن هوانغ قبل عودته", "politics"],
    ["مسلسل جديد يتصدر شباك التذاكر", "entertainment"],
  ])("excludes Arabic %s as %s", (title, reason) => {
    const c = run(title, arabic);
    expect(c.excluded).toBe(true);
    expect(c.excludeReason).toBe(reason);
  });

  it("drops publishers' own event promotions", () => {
    expect(run("2 days till TechCrunch Founder Summit: Boston founders don't need a Silicon Valley ad").excludeReason).toBe("sponsored");
  });
});
