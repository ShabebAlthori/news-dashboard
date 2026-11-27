// Item 3: AI classification mapping, the rule fallback, company subjects, shared company
// counts and multilingual duplicate merging.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { triageTags } from "@/lib/server/ai/triage";
import { classify, detectCompanies } from "@/lib/server/classify";
import { similarPairs } from "@/lib/server/merge";
import { sourceById } from "@/lib/server/sources";
import { buildDashboard } from "@/lib/shared/rank";
import { storyCategory } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type SnapshotStory } from "@/lib/shared/types";

const flags = { buyers_guide: false, review: false, opinion: false };

describe("AI classification → stored tags", () => {
  const gaming = { categories: ["consoles", "platforms", "products"], sections: ["gaming", "business"], eventType: "launch", sourceSection: "gaming" };

  it("files a PS Plus line-up under gaming only — not Business", () => {
    const t = triageTags(gaming, { primary_category: "hardware-gaming", secondary_category: "none", companies: ["sony"], ...flags });
    expect(t.categories).toEqual(["consoles", "platforms"]);
    expect(t.sections).toEqual(["gaming"]);
    expect(t.primary).toBe("hardware-gaming");
  });

  it("keeps business when the AI says the story is business", () => {
    const t = triageTags({ categories: ["game-industry", "partnerships"], sections: ["gaming", "business"], eventType: "partnership", sourceSection: "gaming" }, { primary_category: "hardware-gaming", secondary_category: "business", companies: ["sony"], ...flags });
    expect(t.categories).toEqual(["game-industry", "partnerships"]);
    expect(t.sections.sort()).toEqual(["business", "gaming"]);
  });

  it("drops a Saudi tag the AI does not confirm, and adds a missing category", () => {
    const t = triageTags({ categories: ["security", "saudi"], sections: ["tech"], eventType: "security-incident", sourceSection: "tech" }, { primary_category: "security", secondary_category: "none", companies: ["meta", "google"], ...flags });
    expect(t.categories).toEqual(["security"]);
    const d = triageTags({ categories: ["mobile"], sections: ["tech"], eventType: "general", sourceSection: "tech" }, { primary_category: "data", secondary_category: "none", companies: [], ...flags });
    expect(d.categories).toEqual(["data"]);
  });

  it("turns buyer's guides and reviews into reviews (hidden unless reviews are on)", () => {
    expect(triageTags({ categories: ["robotics"], sections: ["tech"], eventType: "general", sourceSection: "tech" }, { primary_category: "other", secondary_category: "none", companies: [], ...flags, buyers_guide: true }).eventType).toBe("review");
    expect(triageTags({ categories: [], sections: ["tech"], eventType: "general", sourceSection: "tech" }, { primary_category: "ai", secondary_category: "none", companies: [], ...flags, opinion: true }).eventType).toBe("opinion");
  });

  it("uses the AI's primary category for badges", () => {
    expect(storyCategory(["consoles", "products"], undefined, "hardware-gaming")).toBe("hardware-gaming");
    expect(storyCategory(["ai", "security"], undefined, "security")).toBe("security");
  });
});

describe("rule fallback", () => {
  const run = (title: string, src = "verge", text = "") => classify({ title, text, feedCategories: [], source: sourceById(src)! });

  it("does not file game news under Business", () => {
    const ps = run("Here are our PS Plus monthly games for December 2026", "eurogamer");
    expect(ps.sections).not.toContain("business");
    expect(ps.categories).not.toContain("products");
    const gta = run("Performance analysis reveals GTA 6 has a more stable frame-rate on Xbox Series X compared to PlayStation 5", "eurogamer");
    expect(gta.sections).not.toContain("business");
  });

  it("still files real business events under Business", () => {
    expect(run("Microsoft reports record quarterly earnings").sections).toContain("business");
  });

  it("does not read a certification database as data science", () => {
    expect(run("هاتف Vivo X500 FE يظهر في قاعدة بيانات NBD بذاكرة 8GB وتخزين 256GB", "tech-wd").categories).not.toContain("data");
  });

  it("treats buyer's guides as reviews", () => {
    expect(run("Best Robot Vacuum of 2026: Shark, Eufy, Roborock", "wired").eventType).toBe("review");
  });

  it("does not take the United Kingdom for Saudi Arabia", () => {
    expect(run("المملكة المتحدة تطلق منصة رقمية جديدة للشركات الناشئة", "aitnews").categories).not.toContain("saudi");
  });
});

describe("company subjects", () => {
  it("does not tag platforms that are only mentioned", () => {
    const c = detectCompanies("WhatsApp launches message scheduling for everyone on Android and iPhone", "");
    expect(c.all).toEqual(["meta"]);
    const ar = detectCompanies("واتساب تطلق ميزة جدولة الرسائل لجميع المستخدمين على Android وiPhone", "");
    expect(ar.all).toEqual(["meta"]);
  });

  it("tags a product that leads the headline, and companies named in it", () => {
    expect(detectCompanies("iPhone 18 Pro leak shows a new camera", "").all).toEqual(["apple"]);
    expect(detectCompanies("Apple and Google settle search deal case", "").all.sort()).toEqual(["apple", "google"]);
  });

  it("tracks Oracle and IBM without tagging every oracle", () => {
    expect(detectCompanies("Oracle signs a cloud deal worth billions", "").all).toEqual(["oracle"]);
    expect(detectCompanies("IBM unveils a new quantum processor", "").all).toEqual(["ibm"]);
    expect(detectCompanies("أوراكل توقع صفقة سحابية جديدة", "").all).toEqual(["oracle"]);
    expect(detectCompanies("آي بي إم تكشف عن معالج كمي جديد", "").all).toEqual(["ibm"]);
    expect(detectCompanies("A price oracle bug drained a DeFi protocol", "").all).toEqual([]);
  });

  it("weights mentions in the lead paragraph", () => {
    expect(detectCompanies("Chipmakers rally after earnings", "Nvidia said revenue rose. Nvidia expects more.").all).toEqual(["nvidia"]);
    expect(detectCompanies("New phone leaks", "It runs Android, like most phones.").all).toEqual([]);
  });
});

describe("shared company counts", () => {
  const now = Date.UTC(2026, 10, 26, 18);
  const story = (id: number, companies: string[]): SnapshotStory =>
    ({
      id,
      leadArticleId: id,
      title: { original: `S${id}`, en: `S${id}`, ar: null },
      summary: { en: null, ar: null, origin: "none", aiModel: null },
      url: `https://e.com/${id}`,
      lang: "en",
      source: { id: "verge", name: "The Verge", official: false },
      publishedAt: new Date(now - id * 3_600_000).toISOString(),
      fetchedAt: new Date(now).toISOString(),
      sections: ["gaming"],
      categories: ["consoles"],
      companies,
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
      sortTime: now - id * 3_600_000,
      lastActivity: now - id * 3_600_000,
      firstPublishedAt: now - id * 3_600_000,
      significance: 0.5,
      baseScore: 50,
      policy: false,
    }) as SnapshotStory;
  const stories = [story(1, ["take-two"]), story(2, ["take-two"]), story(3, ["take-two"]), story(4, ["nvidia"])];
  it("lists a busier company in Trending, and the takeaway names the same top company", () => {
    const d = buildDashboard(stories, { prefs: { ...DEFAULT_PREFS }, saved: new Map(), read: new Set(), now, generatedAt: new Date(now).toISOString() });
    expect(d.trending[0]).toMatchObject({ companyId: "take-two", count: 3 });
    expect(d.briefingFacts.topCompany).toEqual({ id: "take-two", count: 3 });
    expect(d.trending.some((c) => c.companyId === "palantir")).toBe(true); // configured companies stay listed
  });
});

describe("duplicate merging", () => {
  const v = (...xs: number[]) => {
    const n = Math.hypot(...xs);
    return Float32Array.from(xs.map((x) => x / n));
  };
  const t = Date.UTC(2026, 10, 26);
  it("merges similar stories from different publishers close in time", () => {
    const items = [
      { id: 1, publisher: "verge", time: t, vector: v(1, 0.1, 0) },
      { id: 2, publisher: "tech-wd", time: t + 3_600_000, vector: v(1, 0.12, 0.02) }, // same event, Arabic source
      { id: 3, publisher: "verge", time: t, vector: v(1, 0.1, 0.01) }, // same publisher: never merged
      { id: 4, publisher: "ign", time: t + 72 * 3_600_000, vector: v(1, 0.1, 0) }, // too far apart in time
      { id: 5, publisher: "gamespot", time: t, vector: v(0, 1, 0) }, // different story
    ];
    const pairs = similarPairs(items, 0.9).map((p) => [p.a, p.b]);
    expect(pairs).toContainEqual([1, 2]);
    expect(pairs).not.toContainEqual([1, 3]);
    expect(pairs.some((p) => p.includes(4))).toBe(false);
    expect(pairs.some((p) => p.includes(5))).toBe(false);
  });
});

describe("embeddings request", () => {
  let server: http.Server;
  let seen: { path: string; body: { requests: { model: string; taskType: string; outputDimensionality: number; content: { parts: { text: string }[] } }[] } } | null = null;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        seen = { path: req.url ?? "", body: JSON.parse(data) };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ embeddings: seen.body.requests.map((_, i) => ({ values: [3, 4 + i] })) }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.GEMINI_API_KEY = "k";
  });
  afterAll(() => server.close());

  it("calls batchEmbedContents and returns unit vectors", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const { embedTexts } = await import("@/lib/server/ai/embeddings");
    const out = await embedTexts(["Nvidia reinstates CEO", "إنفيديا تعيد رئيسها التنفيذي"]);
    expect(seen?.path).toBe("/v1beta/models/gemini-embedding-001:batchEmbedContents");
    expect(seen?.body.requests[1]).toMatchObject({ model: "models/gemini-embedding-001", taskType: "SEMANTIC_SIMILARITY", outputDimensionality: 768 });
    expect(Math.hypot(...out[0])).toBeCloseTo(1, 5);
  });
});

describe("data platform sources", () => {
  const run = (title: string, src: string, feedCategories: string[] = []) => classify({ title, text: "", feedCategories, source: sourceById(src)! });
  it("keeps data posts that general-news rules would drop", () => {
    expect(run("Hints and hazards: pg_plan_advice in PG19", "clickhouse-blog").categories).toContain("data");
    expect(run("Drowning in clicks: Scaling Black Friday pipelines with Managed Airflow", "gcloud-data").excluded).toBe(false);
    expect(run("How Vodafone is using the Data Engineering Agent", "gcloud-data", ["Media & Entertainment"]).excluded).toBe(false);
    expect(run("Data Modeling Best Practices for an Agentic CDP", "databricks-blog").categories).toEqual(expect.arrayContaining(["data", "ai"]));
  });
  it("still drops sponsored posts and newsletter round-ups", () => {
    expect(run("DuckDB Ecosystem Newsletter : November 2026", "motherduck").excluded).toBe(true);
  });
});
