// End-to-end pipeline test with a mocked network and a mocked AI provider.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "news-test-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.AI_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "test-key-not-used";

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toUTCString();

function rss(items: { title: string; link: string; mins: number; desc: string }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items
    .map((i) => `<item><title>${i.title}</title><link>${i.link}</link><guid>${i.link}</guid><pubDate>${iso(i.mins)}</pubDate><description>${i.desc}</description></item>`)
    .join("")}</channel></rss>`;
}

const FEEDS: Record<string, string> = {
  "https://www.theverge.com/rss/index.xml": rss([
    { title: "Nvidia reinstates Jensen Huang as CEO", link: "https://www.theverge.com/a/huang?utm_source=rss", mins: 60, desc: "Nvidia's board reinstated Jensen Huang as chief executive on Monday, the company said." },
    { title: "Wordle today: hints and answers", link: "https://www.theverge.com/a/wordle", mins: 30, desc: "Puzzle." },
    { title: "Ubisoft lays off 166 staff in Montreal studios", link: "https://www.theverge.com/a/ubi", mins: 90, desc: "Ubisoft is laying off 166 employees at its Montreal and Quebec City studios." },
  ]),
  // Same Verge article appears in the gaming feed too -> must not be duplicated.
  "https://www.theverge.com/rss/games/index.xml": rss([
    { title: "Nvidia reinstates Jensen Huang as CEO", link: "https://www.theverge.com/a/huang", mins: 60, desc: "Duplicate." },
  ]),
  "https://techcrunch.com/feed/": rss([
    { title: "Jensen Huang reinstated as Nvidia CEO after board review", link: "https://techcrunch.com/huang", mins: 50, desc: "Nvidia said Jensen Huang has been reinstated as CEO after a board review." },
    { title: "Startup raises $5 million for AI note-taking app", link: "https://techcrunch.com/notes", mins: 20, desc: "A startup raised $5 million in seed funding." },
  ]),
  "https://www.eurogamer.net/feed/news": rss([
    { title: "Rings of Power Renewed by Amazon for Season 4", link: "https://www.eurogamer.net/rop", mins: 40, desc: "TV news." },
    { title: "Lords of the Fallen 2 delayed to April 2027", link: "https://www.eurogamer.net/lotf2", mins: 70, desc: "Lords of the Fallen 2 will now launch in April 2027." },
  ]),
  // Arabic-language source (Saudi technology).
  "https://aitnews.com/feed/": rss([
    { title: "شركة ناشئة سعودية تجمع 5 ملايين دولار في جولة تمويلية لتطوير منصة ذكاء اصطناعي", link: "https://aitnews.com/2026/11/25/startup", mins: 45, desc: "أعلنت شركة ناشئة سعودية مقرها الرياض أنها جمعت 5 ملايين دولار في جولة تمويلية لتطوير منصتها للذكاء الاصطناعي." },
  ]),
  "https://nvidianews.nvidia.com/releases.xml": rss([
    { title: "NVIDIA Board Reinstates Jensen Huang as President and CEO", link: "https://nvidianews.nvidia.com/huang", mins: 70, desc: "NVIDIA today announced that Jensen Huang has been reinstated as President and Chief Executive Officer." },
  ]),
};
let failing = new Set<string>(["https://www.wired.com/feed/rss"]);

const fakeFetch = vi.fn(async (input: string | URL) => {
  const url = String(input);
  if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
  if (failing.has(url)) return new Response("down", { status: 503 });
  const body = FEEDS[url] ?? rss([]);
  return new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } });
});
vi.stubGlobal("fetch", fakeFetch);

// Mock the Claude calls (batched): echo the source faithfully, except invent a number for the delay story.
vi.mock("../src/lib/server/ai/anthropic", () => ({
  generateWithClaude: vi.fn(async (req: { user: string }) => {
    if (req.user.startsWith("<stories>")) {
      // Triage: keep the rules' reading (primary "other" keeps no priority topic) — the pipeline
      // test checks clustering and summaries, not AI classification.
      const items = JSON.parse(req.user.replace(/^<stories>\n/, "").replace(/\n<\/stories>$/, "")) as { id: string; target: string; headline: string }[];
      return {
        model: "mock-model",
        data: {
          items: items.map((i) => {
            const h = i.headline;
            const [primary, secondary, companies] = /nvidia|huang/i.test(h)
              ? ["business", "ai", ["nvidia"]]
              : /ubisoft/i.test(h)
                ? ["business", "hardware-gaming", ["ubisoft"]]
                : /ناشئة/.test(h)
                  ? ["saudi", "business", []]
                  : /lords of the fallen/i.test(h)
                    ? ["hardware-gaming", "none", []]
                    : ["other", "none", []];
            return {
              id: i.id,
              translation: i.target === "none" ? "" : `[${i.target.toUpperCase()}] ${h}`,
              primary_category: primary,
              secondary_category: secondary,
              companies,
              buyers_guide: false,
              review: false,
              opinion: false,
            };
          }),
        },
      };
    }
    const articles = [...req.user.matchAll(/<article id="([^"]+)">[\s\S]*?<original_headline>([\s\S]*?)<\/original_headline>\n<text>\n([\s\S]*?)\n<\/text>/g)].map((m) => ({
      id: m[1],
      title: m[2],
      text: m[3],
    }));
    return {
      model: "mock-model",
      data: {
        items: articles.map((a) => {
          const invented = a.title.includes("Lords of the Fallen");
          return {
            id: a.id,
            headline_en: a.title,
            headline_ar: `[AR] ${a.title}`,
            summary_en: invented ? "The game was delayed by 9 months." : a.text,
            summary_ar: `[AR] ${a.text}`,
            significance: a.title.includes("Huang") ? 5 : 3,
            excluded_topic: a.title.includes("note-taking") ? "deals" : "none",
            speculative: false,
            insufficient_text: false,
            categories: [],
            companies: [],
          };
        }),
      },
    };
  }),
}));

type Pipeline = typeof import("@/lib/server/pipeline");
type Queries = typeof import("@/lib/server/queries");
type Db = typeof import("@/lib/server/db");
let pipeline: Pipeline;
let queries: Queries;
let dbmod: Db;

beforeAll(async () => {
  pipeline = await import("@/lib/server/pipeline");
  queries = await import("@/lib/server/queries");
  dbmod = await import("@/lib/server/db");
});

afterAll(() => {
  dbmod.getDb().close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("refresh pipeline", () => {
  it("ingests, dedupes, filters, clusters and summarizes", async () => {
    const result = await pipeline.runRefresh("cli");
    expect(result.status).toBe("partial"); // WIRED is down
    expect(result.sourcesFailed).toBe(1);

    const db = dbmod.getDb();
    const verge = db.prepare("SELECT COUNT(*) AS n FROM articles WHERE canonical_url = 'https://theverge.com/a/huang'").get() as { n: number };
    expect(verge.n).toBe(1); // same URL from two feeds stored once

    const excluded = db.prepare("SELECT title, exclude_reason FROM articles WHERE excluded = 1 ORDER BY title").all() as { title: string; exclude_reason: string }[];
    expect(excluded.map((e) => e.exclude_reason)).toEqual(expect.arrayContaining(["entertainment", "puzzles", "ai:deals"]));

    const { stories } = queries.listStories({ sort: "importance" });
    const huang = stories.find((s) => s.companies.includes("nvidia"))!;
    expect(huang.sourceCount).toBe(3); // Verge, TechCrunch and NVIDIA's newsroom
    expect(huang.coverage).toHaveLength(2);
    expect(stories[0].id).toBe(huang.id); // ranked first
    expect(huang.summary.origin).toBe("ai");
    expect(huang.title.ar).toMatch(/^\[AR]/);
    expect(huang.breaking).toBe(true); // fresh, 3 independent sources, major

    // The summary with an invented number was rejected; the publisher excerpt remains.
    const lotf = stories.find((s) => s.title.original.includes("Lords of the Fallen"))!;
    expect(lotf.summary.origin).toBe("feed");
    expect(lotf.summary.en).toContain("April 2027");
    const row = db.prepare("SELECT ai_status, ai_error FROM articles WHERE url = 'https://www.eurogamer.net/lotf2'").get() as { ai_status: string; ai_error: string };
    expect(row.ai_status).toBe("rejected");
    expect(row.ai_error).toContain("9");

    // Publication time is the publisher's; retrieval time is ours.
    expect(huang.publishedAt).not.toBeNull();
    expect(new Date(huang.fetchedAt).getTime()).toBeGreaterThan(new Date(huang.publishedAt!).getTime());
  });

  it("keeps articles when a source becomes unavailable and recovers later", async () => {
    const db = dbmod.getDb();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM articles WHERE source_id = 'techcrunch'").get() as { n: number }).n;
    failing = new Set(["https://techcrunch.com/feed/"]);
    db.prepare("DELETE FROM locks").run();
    const r = await pipeline.runRefresh("cli");
    expect(r.sourcesFailed).toBe(1);
    const after = (db.prepare("SELECT COUNT(*) AS n FROM articles WHERE source_id = 'techcrunch'").get() as { n: number }).n;
    expect(after).toBe(before);
    const src = db.prepare("SELECT last_status, consecutive_failures FROM sources WHERE id = 'techcrunch'").get() as { last_status: string; consecutive_failures: number };
    expect(src).toEqual({ last_status: "error", consecutive_failures: 1 });
    // Re-running does not create duplicates.
    expect(r.newArticles).toBe(0);
  });

  it("keeps Arabic-source stories in Arabic until translated", () => {
    const { stories } = queries.listStories({ q: "ناشئة" });
    expect(stories).toHaveLength(1);
    const s = stories[0];
    expect(s.lang).toBe("ar");
    expect(s.title.original).toMatch(/^شركة ناشئة سعودية/);
    // The (mock) AI also summarized it; its Arabic text still carries the source's facts.
    expect(s.title.ar).toContain(s.title.original);
    expect(s.summary.ar).toContain("5 ملايين دولار");
    const db = dbmod.getDb();
    const stored = db.prepare("SELECT title, excerpt FROM articles WHERE id = ?").get(s.leadArticleId) as { title: string; excerpt: string };
    expect(stored.title).toBe(s.title.original); // the publisher's original headline is kept
    // The AI files a story under at most two categories (here: Saudi tech + business).
    expect(s.categories).toEqual(expect.arrayContaining(["saudi", "strategy"]));
    expect(s.primaryCategory).toBe("saudi");
    expect(queries.listStories({ category: "saudi" }).stories.map((x) => x.id)).toContain(s.id);
  });

  it("re-tags stored stories once for the new categories (additive only)", async () => {
    const db = dbmod.getDb();
    const settings = await import("@/lib/server/settings");
    const now = Date.now();
    const id = Number(
      db
        .prepare(
          `INSERT INTO articles (source_id, guid, url, canonical_url, title, excerpt, content_text, published_at, fetched_at, updated_at,
             excluded, exclude_reason, ai_status, tokens)
           VALUES ('techcrunch', 'g-robotaxi', 'https://techcrunch.com/robotaxi', 'https://techcrunch.com/robotaxi',
             'Uber and Nuro begin driverless testing of Lucid robotaxis', 'Driverless robotaxi testing starts.', '', ?, ?, ?, 1, 'off-topic', 'skipped', '[]')`,
        )
        .run(now - 3_600_000, now, now).lastInsertRowid,
    );
    const before = db.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number };
    settings.setSetting("taxonomy_version", 1);
    const result = pipeline.upgradeTaxonomy(db);
    expect(result.restored).toBeGreaterThanOrEqual(1);
    const row = db.prepare("SELECT excluded, categories, cluster_id, ai_status FROM articles WHERE id = ?").get(id) as {
      excluded: number;
      categories: string;
      cluster_id: number | null;
      ai_status: string;
    };
    expect(row.excluded).toBe(0);
    expect(JSON.parse(row.categories)).toContain("robotics");
    expect(row.cluster_id).not.toBeNull();
    expect(row.ai_status).toBe("pending");
    // Nothing is deleted, and it runs only once.
    expect((db.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number }).n).toBe(before.n);
    expect(pipeline.upgradeTaxonomy(db)).toEqual({ retagged: 0, restored: 0 });
  });

  it("serves the dashboard and search", () => {
    const dash = queries.getDashboard();
    expect(dash.top.length).toBeGreaterThan(0);
    // "Your categories" follows the priority order.
    expect(dash.byCategory.map((c) => c.categoryId)).toEqual(["data", "ai", "business", "dev", "security", "hardware-gaming", "saudi", "robotics"]);
    expect(dash.byCategory.find((c) => c.categoryId === "saudi")?.count).toBeGreaterThanOrEqual(1);
    expect(dash.companies.find((c) => c.companyId === "nvidia")?.count).toBe(1);
    const search = queries.listStories({ q: "ubisoft" });
    expect(search.stories).toHaveLength(1);
    // Arabic fields are indexed too (the mock prefixes them with "[AR]").
    const arabic = queries.listStories({ q: "AR Ubisoft" });
    expect(arabic.total).toBe(1);
  });
});
