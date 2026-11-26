// Item 2: the translation queue — batching, order, caching and the number guard.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "techpulse-translate-"));
process.env.DATABASE_PATH = path.join(dir, "t.db");
process.env.AI_PROVIDER = "anthropic";
process.env.AI_TITLE_BATCH = "3";
process.env.AI_SUMMARY_BATCH = "2";
process.env.AI_MAX_REQUESTS_PER_RUN = "50";

const calls: { kind: "titles" | "summaries"; ids: string[] }[] = [];
const letter = (id: string) => "abcdefghijklmnopqrstuvwxyz"[Number(id) % 26];
let inventNumberFor: string | null = null;

vi.mock("../src/lib/server/ai/anthropic", () => ({
  generateWithClaude: vi.fn(async (req: { user: string }) => {
    if (req.user.startsWith("<headlines>")) {
      const items = JSON.parse(req.user.slice("<headlines>\n".length, -"\n</headlines>".length)) as { id: string; target: string; headline: string }[];
      calls.push({ kind: "titles", ids: items.map((i) => i.id) });
      return {
        model: "mock",
        data: { items: items.map((i) => ({ id: i.id, translation: i.headline === inventNumberFor ? `${i.headline} 999` : `«${i.target}» ${i.headline}` })) },
      };
    }
    const ids = [...req.user.matchAll(/<article id="(\d+)">/g)].map((m) => m[1]);
    calls.push({ kind: "summaries", ids });
    return {
      model: "mock",
      data: {
        items: ids.map((id) => ({
          id,
          // No digits: the number guard would (rightly) reject numbers that are not in the source.
          headline_en: `Headline ${letter(id)}`,
          headline_ar: `عنوان ${letter(id)}`,
          summary_en: `Summary ${letter(id)}.`,
          summary_ar: `ملخص ${letter(id)}.`,
          significance: 3,
          excluded_topic: "none",
          speculative: false,
          insufficient_text: false,
          categories: [],
          companies: [],
        })),
      },
    };
  }),
}));

type Ai = typeof import("@/lib/server/ai");
type DbMod = typeof import("@/lib/server/db");
let ai: Ai;
let dbmod: DbMod;

beforeAll(async () => {
  ai = await import("@/lib/server/ai");
  dbmod = await import("@/lib/server/db");
});

let nextId = 1;
function addStory(db: ReturnType<DbMod["getDb"]>, opts: { source?: string; title: string; score: number; hoursAgo: number; url?: string }) {
  const id = nextId++;
  const t = Date.now() - opts.hoursAgo * 3_600_000;
  const source = opts.source ?? "verge";
  db.prepare("INSERT OR IGNORE INTO sources (id, name, publisher, url, homepage, section, kind, credibility) VALUES (?, ?, ?, ?, ?, 'tech', 'publisher', 0.9)").run(
    source,
    source,
    source,
    `https://${source}.example/feed`,
    `https://${source}.example`,
  );
  const arabic = source === "aitnews";
  db.prepare(
    `INSERT INTO articles (id, source_id, guid, url, canonical_url, title, excerpt, content_text, published_at, fetched_at, updated_at, cluster_id, title_ar, summary_origin, ai_status)
     VALUES (?, ?, ?, ?, ?, ?, 'Text.', 'Text.', ?, ?, ?, ?, ?, 'feed', 'pending')`,
  ).run(id, source, `g${id}`, opts.url ?? `https://${source}.example/${id}`, opts.url ?? `https://${source}.example/${id}`, opts.title, t, t, t, id, arabic ? opts.title : null);
  db.prepare("INSERT INTO clusters (id, lead_article_id, sort_time, first_seen_at, updated_at, base_score) VALUES (?, ?, ?, ?, ?, ?)").run(id, id, t, t, t, opts.score);
  return id;
}

beforeEach(() => {
  const db = dbmod.getDb();
  db.exec("DELETE FROM articles; DELETE FROM clusters; DELETE FROM ai_cache; DELETE FROM settings;");
  calls.length = 0;
  inventNumberFor = null;
});

describe("translation queue", () => {
  it("translates headlines first, in batches, most important and newest first", async () => {
    const db = dbmod.getDb();
    const low = addStory(db, { title: "Minor patch notes", score: 20, hoursAgo: 1 });
    const top = addStory(db, { title: "Nvidia reinstates CEO", score: 80, hoursAgo: 3 });
    const mid = addStory(db, { title: "Robot startup raises", score: 50, hoursAgo: 2 });
    const ar = addStory(db, { source: "aitnews", title: "سامسونج تطلق هاتفًا", score: 60, hoursAgo: 2 });
    const r = await ai.enrichStories(db);
    expect(calls[0].kind).toBe("titles");
    expect(calls[0].ids).toEqual([String(top), String(ar), String(mid)]); // batch of 3, by priority
    expect(calls[1]).toEqual({ kind: "titles", ids: [String(low)] });
    expect(calls.slice(2).every((c) => c.kind === "summaries")).toBe(true);
    expect(calls[2].ids).toHaveLength(2); // summaries batched by 2
    expect(r.titles).toBe(4);
    expect(r.summaries).toBe(4);
    // The Arabic source keeps its own headline and gains an English one.
    const row = db.prepare("SELECT title_en, title_ar FROM articles WHERE id = ?").get(ar) as { title_en: string; title_ar: string };
    expect(row.title_ar).toBe("سامسونج تطلق هاتفًا");
    expect(row.title_en).toBe(`Headline ${"abcdefghijklmnopqrstuvwxyz"[ar % 26]}`); // the summary step refines it
    expect(r.pendingTitles).toBe(0);
    expect(r.pendingSummaries).toBe(0);
  });

  it("rejects a translated headline that adds a number", async () => {
    const db = dbmod.getDb();
    const id = addStory(db, { title: "Apple ships update", score: 50, hoursAgo: 1 });
    inventNumberFor = "Apple ships update";
    await ai.enrichStories(db);
    const row = db.prepare("SELECT title_ar, title_ai_attempts FROM articles WHERE id = ?").get(id) as { title_ar: string | null; title_ai_attempts: number };
    expect(row.title_ai_attempts).toBe(1); // the translation with "999" was discarded
    expect(row.title_ar ?? "").not.toContain("999");
  });

  it("never translates the same URL twice", async () => {
    const db = dbmod.getDb();
    addStory(db, { title: "Microsoft earnings beat", score: 60, hoursAgo: 1, url: "https://verge.example/msft" });
    await ai.enrichStories(db);
    const before = calls.length;
    // The database is lost and the same article comes back with a new id.
    db.exec("DELETE FROM articles; DELETE FROM clusters;");
    addStory(db, { title: "Microsoft earnings beat", score: 60, hoursAgo: 1, url: "https://verge.example/msft?utm_source=rss" });
    const r = await ai.enrichStories(db);
    expect(calls.length).toBe(before); // no new requests
    expect(r.cached).toBe(1);
    const row = db.prepare("SELECT summary_ar, summary_origin FROM articles").get() as { summary_ar: string; summary_origin: string };
    expect(row.summary_origin).toBe("ai");
    expect(row.summary_ar).toMatch(/^ملخص/);
  });

  it("seeds the cache from a published snapshot", () => {
    const db = dbmod.getDb();
    const n = ai.seedCacheFromSnapshot(db, [
      {
        url: "https://verge.example/x",
        lang: "en",
        title: { original: "X", en: "X", ar: "إكس" },
        summary: { en: "S.", ar: "م.", origin: "ai", aiModel: "m" },
      },
      { url: "https://verge.example/y", lang: "en", title: { original: "Y", en: "Y", ar: null }, summary: { en: "Y.", ar: null, origin: "feed", aiModel: null } },
    ] as never);
    expect(n).toBe(1);
  });

  it("respects the per-run request budget", async () => {
    const db = dbmod.getDb();
    for (let i = 0; i < 10; i++) addStory(db, { title: `Story ${i}`, score: 50, hoursAgo: 1 });
    process.env.AI_MAX_REQUESTS_PER_RUN = "2";
    vi.resetModules();
    const fresh = await import("@/lib/server/ai");
    const r = await fresh.enrichStories((await import("@/lib/server/db")).getDb());
    expect(r.requests).toBe(2);
    process.env.AI_MAX_REQUESTS_PER_RUN = "50";
  });
});
