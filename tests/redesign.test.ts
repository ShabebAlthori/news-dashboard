// TechPulse redesign: Data Radar ingestion, the Weekly Tech Report, the new dashboard
// sections and the additive database migration.
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/server/db";
import type { ParsedItem } from "@/lib/server/feed-parser";
import { listRadarItems, normalizeFeedItem, normalizeGithubRepos, radarSourceById } from "@/lib/server/radar";
import { buildWeeklyReport } from "@/lib/server/report";
import { buildDashboard, packDashboard, unpackDashboard, type RankContext } from "@/lib/shared/rank";
import { isRadarLive, lastReportSlot, nextReportAt } from "@/lib/shared/schedule";
import { DASHBOARD_CHIPS, TRENDING_COMPANY_IDS } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type RadarItem, type SnapshotStory } from "@/lib/shared/types";

const now = Date.UTC(2026, 10, 25, 12); // Wednesday
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const item = (p: Partial<ParsedItem>): ParsedItem => ({
  guid: p.url ?? "g",
  url: "https://example.org/x",
  title: "",
  description: "",
  content: "",
  author: null,
  imageUrl: null,
  publishedAt: now - HOUR,
  categories: [],
  ...p,
});

describe("Data Radar ingestion", () => {
  const pypi = radarSourceById("spark")!;
  const postgres = radarSourceById("postgresql")!;
  const arxiv = radarSourceById("arxiv-db")!;
  const kafka = radarSourceById("kafka")!;

  it("turns PyPI versions into releases and skips pre-releases", () => {
    const r = normalizeFeedItem(pypi, item({ title: "4.3.0", url: "https://pypi.org/project/pyspark/4.3.0/" }), now);
    expect(r).toMatchObject({ type: "release", title: "Apache Spark 4.3.0", version: "4.3.0", url: "https://pypi.org/project/pyspark/4.3.0/" });
    for (const v of ["4.3.0rc1", "2.0.2.dev2611230823", "1.0b2", "3.0.0a1", "1.2.3.post1"]) expect(normalizeFeedItem(pypi, item({ title: v }), now)).toBeNull();
  });

  it("recognises releases, keeps updates and drops community events", () => {
    expect(normalizeFeedItem(postgres, item({ title: "PostgreSQL 19 Released!" }), now)).toMatchObject({ type: "release", version: "19" });
    expect(normalizeFeedItem(postgres, item({ title: "WAL-G 3.0.10 released" }), now)?.type).toBe("release");
    expect(normalizeFeedItem(postgres, item({ title: "pgjumbo: a new free desktop client for PostgreSQL" }), now)?.type).toBe("update");
    expect(normalizeFeedItem(postgres, item({ title: "PGConf.dev 2027 Call for Proposals is Open" }), now)).toBeNull();
    expect(normalizeFeedItem(postgres, item({ title: "Nordic PGDay 2027 - Call for Papers & Sponsors!" }), now)).toBeNull();
  });

  it("keeps the source's own date and ignores old items", () => {
    const t = now - 3 * DAY;
    expect(normalizeFeedItem(postgres, item({ title: "WAL-G 3.0.10 released", publishedAt: t }), now)?.publishedAt).toBe(t);
    expect(normalizeFeedItem(postgres, item({ title: "WAL-G 2.0 released", publishedAt: now - 90 * DAY }), now)).toBeNull();
  });

  it("only takes new arXiv papers, with the abstract as summary", () => {
    const fresh = normalizeFeedItem(arxiv, item({ title: "Rethinking Document Indexing", description: "arXiv:2611.31679v1 Announce Type: new Abstract: Documents such as clinical records are long." }), now);
    expect(fresh).toMatchObject({ type: "research", summary: "Documents such as clinical records are long." });
    expect(normalizeFeedItem(arxiv, item({ title: "Old paper", description: "arXiv:2501.1v3 Announce Type: replace Abstract: x" }), now)).toBeNull();
  });

  it("uses only the blog part of a site-wide feed", () => {
    expect(normalizeFeedItem(kafka, item({ title: "API Design", url: "https://kafka.apache.org/documentation/" }), now)).toBeNull();
    expect(normalizeFeedItem(kafka, item({ title: "Apache Kafka 4.4.0 Release Announcement", url: "https://kafka.apache.org/blog/2026/10/22/apache-kafka-4.4.0-release-announcement/" }), now)?.type).toBe("release");
  });

  it("filters GitHub repositories and keeps reported star counts", () => {
    const repos = normalizeGithubRepos([
      { id: 1, full_name: "a/duckpad", html_url: "https://github.com/a/duckpad", description: "Data transformation tool", created_at: "2026-10-25T00:00:00Z", stargazers_count: 299, language: "Python", fork: false, archived: false },
      { id: 2, full_name: "b/app-starter", html_url: "https://github.com/b/app-starter", description: "Next.js starter template with Postgres", created_at: "2026-11-01T00:00:00Z", stargazers_count: 500, language: "TS", fork: false, archived: false },
      { id: 3, full_name: "c/fork", html_url: "https://github.com/c/fork", description: null, created_at: "2026-11-01T00:00:00Z", stargazers_count: 900, language: null, fork: true, archived: false },
    ]);
    expect(repos.map((r) => r.title)).toEqual(["a/duckpad"]);
    expect(repos[0]).toMatchObject({ type: "repository", extra: { stars: 299 } });
  });

  it("caps items per source when listing", () => {
    const db = openDatabase(":memory:");
    const ins = db.prepare("INSERT INTO radar_items (source_id, guid, platform, title, url, type, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < 10; i++) ins.run("arxiv-db", `p${i}`, "arXiv", `Paper ${i}`, `https://arxiv.org/abs/${i}`, "research", Date.now() - i * HOUR, Date.now());
    ins.run("postgresql", "r1", "PostgreSQL", "PostgreSQL 19 Released!", "https://www.postgresql.org/x", "release", Date.now() - 50 * HOUR, Date.now());
    const list = listRadarItems(45, 4, db);
    expect(list.filter((i) => i.sourceId === "arxiv-db")).toHaveLength(4);
    expect(list.some((i) => i.type === "release")).toBe(true);
  });
});

describe("honest Live indicator", () => {
  it("is live only after a recent successful refresh", () => {
    expect(isRadarLive(new Date(now - 10 * 60_000).toISOString(), now)).toBe(true);
    expect(isRadarLive(new Date(now - 45 * 60_000).toISOString(), now)).toBe(false);
    expect(isRadarLive(null, now)).toBe(false);
    expect(isRadarLive("not a date", now)).toBe(false);
  });
});

describe("weekly report schedule", () => {
  it("is due every Sunday at 02:00 UTC", () => {
    const slot = lastReportSlot(now);
    expect(new Date(slot).toISOString()).toBe("2026-11-22T02:00:00.000Z");
    expect(new Date(nextReportAt(now)).toISOString()).toBe("2026-11-29T02:00:00.000Z");
    const sundayEarly = Date.UTC(2026, 10, 29, 1);
    expect(new Date(lastReportSlot(sundayEarly)).toISOString()).toBe("2026-11-22T02:00:00.000Z");
    const sundayLate = Date.UTC(2026, 10, 29, 3);
    expect(new Date(lastReportSlot(sundayLate)).toISOString()).toBe("2026-11-29T02:00:00.000Z");
  });
});

let nextId = 1;
function story({ title, hoursAgo, ...p }: Omit<Partial<SnapshotStory>, "title"> & { title: string; hoursAgo: number }): SnapshotStory {
  const id = nextId++;
  const t = now - hoursAgo * HOUR;
  return {
    id,
    leadArticleId: id,
    title: { original: title, en: title, ar: null },
    summary: { en: `${title}.`, ar: null, origin: "feed", aiModel: null },
    url: `https://example.com/${id}`,
    lang: "en",
    source: { id: "verge", name: "The Verge", official: false },
    publishedAt: new Date(t).toISOString(),
    fetchedAt: new Date(t + 60_000).toISOString(),
    sections: ["tech"],
    categories: [],
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
    ...p,
  } as SnapshotStory;
}

const pool = [
  story({ title: "Databricks ships a new lakehouse engine", hoursAgo: 3, categories: ["data"], companies: ["databricks"], baseScore: 55, imageUrl: "https://img/1.jpg" }),
  story({ title: "Nvidia reinstates its CEO", hoursAgo: 2, categories: ["leadership", "ai"], companies: ["nvidia"], baseScore: 80, imageUrl: "https://img/2.jpg" }),
  story({ title: "Ransomware hits a hospital chain", hoursAgo: 5, categories: ["security"], baseScore: 60 }),
  story({ title: "GTA 6 performance analysis", hoursAgo: 6, sections: ["gaming"], categories: ["consoles", "products"], baseScore: 65, imageUrl: "https://img/3.jpg" }),
  story({ title: "GTA 6 PC build leaks", hoursAgo: 7, sections: ["gaming"], categories: ["pc-gaming"], baseScore: 64 }),
  story({ title: "GTA 6 launch record", hoursAgo: 8, sections: ["gaming"], categories: ["consoles"], baseScore: 63 }),
  story({ title: "Witcher 4 marketing deal", hoursAgo: 11, sections: ["gaming"], categories: ["game-industry"], baseScore: 50 }),
  story({ title: "Saudi startup raises $5M", hoursAgo: 4, categories: ["saudi", "strategy"], baseScore: 45 }),
  story({ title: "Robot startup unveils humanoid", hoursAgo: 9, categories: ["robotics"], baseScore: 44 }),
  story({ title: "New Rust release", hoursAgo: 1, categories: ["dev"], baseScore: 40 }),
  story({ title: "Microsoft earnings beat", hoursAgo: 10, categories: ["earnings"], companies: ["microsoft"], eventType: "earnings", baseScore: 70 }),
];
const ctx: RankContext = { prefs: { ...DEFAULT_PREFS }, saved: new Map(), read: new Set(), now, generatedAt: new Date(now).toISOString() };

describe("dashboard sections", () => {
  const d = buildDashboard(pool, ctx);

  it("features the most important stories, images first, without repeating them in Latest", () => {
    expect(d.top.length).toBeGreaterThan(0);
    expect(d.top[0].imageUrl).not.toBeNull();
    const hero = new Set(d.top.map((s) => s.id));
    expect(d.latest.some((s) => hero.has(s.id))).toBe(false);
  });

  it("builds the Daily Briefing from different categories, with counted facts", () => {
    expect(d.briefing.length).toBeGreaterThanOrEqual(3);
    expect(d.briefing.length).toBeLessThanOrEqual(5);
    expect(new Set(d.briefing.map((s) => s.id)).size).toBe(d.briefing.length);
    expect(d.briefingFacts.stories).toBe(pool.length);
    // Four gaming stories; "product announcements" alone does not make a story Business.
    expect(d.briefingFacts.topCategory).toEqual({ id: "hardware-gaming", count: 4 });
  });

  it("reports company news activity for the tracked companies — counts, not prices", () => {
    expect(d.trending.map((c) => c.companyId).sort()).toEqual([...TRENDING_COMPANY_IDS].sort());
    const databricks = d.trending.find((c) => c.companyId === "databricks")!;
    expect(databricks.count).toBe(1);
    expect(Object.keys(databricks).sort()).toEqual(["companyId", "count", "top"]);
  });

  it("filters every section by a category chip", () => {
    const sec = buildDashboard(pool, ctx, { category: "security" });
    expect(sec.category).toBe("security");
    for (const s of [...sec.top, ...sec.latest, ...sec.briefing]) expect(s.categories).toContain("security");
    expect(buildDashboard(pool, ctx, { category: "all" }).category).toBeNull();
    expect(buildDashboard(pool, ctx, { category: "nonsense" }).category).toBeNull();
  });

  it("offers the chips in the requested order", () => {
    expect(DASHBOARD_CHIPS.map((c) => c.en)).toEqual(["All", "Data & Analytics", "AI", "Business", "Programming", "Cybersecurity", "Gaming", "Saudi Tech", "Robotics"]);
  });
});

describe("weekly report", () => {
  const radar: RadarItem[] = [
    { id: 1, sourceId: "postgresql", platform: "PostgreSQL", title: "PostgreSQL 19 Released!", summary: null, url: "https://www.postgresql.org/a", type: "release", version: "19", publishedAt: new Date(now - DAY).toISOString(), fetchedAt: new Date(now).toISOString() },
    { id: 2, sourceId: "postgresql", platform: "PostgreSQL", title: "Too old", summary: null, url: "https://www.postgresql.org/b", type: "release", version: "1", publishedAt: new Date(now - 9 * DAY).toISOString(), fetchedAt: new Date(now).toISOString() },
  ];
  const stories = pool.map((s) => ({ ...s, importance: s.baseScore }));
  const r = buildWeeklyReport(stories, radar, now - 7 * DAY, now, { showReviews: false, includeTechPolicy: true });

  it("covers exactly the period and counts the real stories", () => {
    expect(r.totals.stories).toBe(pool.length);
    expect(r.periodStart).toBe(new Date(now - 7 * DAY).toISOString());
    expect(r.radar.map((i) => i.id)).toEqual([1]);
  });

  it("only contains stories from the input, each with its source link", () => {
    const urls = new Set(pool.map((s) => s.url));
    const all = [...r.highlights, ...r.sections.flatMap((s) => s.stories)];
    for (const s of all) expect(urls.has(s.url)).toBe(true);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length); // no story twice
  });

  it("keeps the highlights varied (at most two per category)", () => {
    const gta = r.highlights.filter((s) => s.title.en.startsWith("GTA 6"));
    expect(gta.length).toBeLessThanOrEqual(2);
    expect(r.highlights[0].title.en).toBe("Nvidia reinstates its CEO");
  });

  it("lists company activity without market data", () => {
    expect(r.companies.find((c) => c.id === "microsoft")?.count).toBe(1);
  });
});

describe("database migration", () => {
  it("adds the radar and report tables without touching existing data", () => {
    const file = `/tmp/claude-migrate-${process.pid}-${Date.now()}.db`;
    // Simulate a database created by the previous version (schema v1 only).
    const v1 = openDatabase(":memory:");
    const schema = (v1.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'radar%' AND name NOT LIKE 'weekly%' AND name NOT LIKE 'articles_fts_%' AND name NOT LIKE 'idx_radar%' AND name NOT LIKE 'sqlite_%' AND name != 'ai_cache'").all() as { sql: string }[])
      // Columns added by later migrations were not in v1.
      .map((r) => r.sql.replace(/,\s*(title_ai_attempts INTEGER NOT NULL DEFAULT 0|primary_category TEXT|secondary_category TEXT|triaged_at INTEGER|embedding BLOB)/g, ""))
      .join(";\n");
    const old = new Database(file);
    old.exec(schema);
    old.pragma("user_version = 1");
    old.prepare("INSERT INTO settings (key, value) VALUES ('prefs', '{\"interests\":[\"ai\"]}')").run();
    old.close();

    const db = openDatabase(file);
    expect(db.pragma("user_version", { simple: true })).toBe(4);
    expect((db.prepare("SELECT value FROM settings WHERE key = 'prefs'").get() as { value: string }).value).toContain("ai");
    expect(db.prepare("SELECT count(*) AS n FROM radar_items").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM weekly_reports").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM ai_cache").get()).toEqual({ n: 0 });
    expect((db.prepare("PRAGMA table_info(articles)").all() as { name: string }[]).some((c) => c.name === "title_ai_attempts")).toBe(true);
    db.close();
  });
});

describe("wide-screen Latest row", () => {
  // Many publishers, so the two-per-source cap leaves more than six Latest candidates.
  const many = Array.from({ length: 40 }, (_, i) =>
    story({ title: `Story ${i}`, hoursAgo: 1 + i * 0.5, categories: [i % 2 ? "ai" : "dev"], baseScore: 30 + (i % 7), source: { id: `src-${i % 20}`, name: `Source ${i % 20}`, official: false } }),
  );
  const d = buildDashboard(many, ctx);

  it("adds up to three extra cards that no other section shows", () => {
    const more = d.latestMore ?? [];
    expect(more).toHaveLength(3);
    const elsewhere = new Set([...d.top, ...d.latest, ...d.announcements, ...d.missed, ...d.tech, ...d.gaming].map((s) => s.id));
    expect(more.some((s) => elsewhere.has(s.id))).toBe(false);
    expect(d.latest).toHaveLength(6);
    // Still at most two cards per publisher across all nine.
    const perSource = new Map<string, number>();
    for (const s of [...d.latest, ...more]) perSource.set(s.source.id, (perSource.get(s.source.id) ?? 0) + 1);
    expect(Math.max(...perSource.values())).toBeLessThanOrEqual(2);
  });

  it("survives packing for home.json", () => {
    expect(unpackDashboard(packDashboard(d)).latestMore?.map((s) => s.id)).toEqual(d.latestMore?.map((s) => s.id));
  });
});
