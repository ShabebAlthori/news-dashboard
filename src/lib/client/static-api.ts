"use client";

// Data layer of the static web edition. The site ships two JSON files, refreshed by
// GitHub Actions: data/status.json (small, polled) and data/snapshot.json (all stories).
// Reader state — saved stories, read history and settings — stays in this browser.
import { buildDashboard, countCompanies, queryStories, type RankContext } from "@/lib/shared/rank";
import type { Section } from "@/lib/shared/taxonomy";
import type { Prefs, Snapshot, SnapshotStory, SourceHealth, StatusResponse, Story } from "@/lib/shared/types";
import { BASE_PATH } from "./mode";

interface StatusFile {
  generatedAt: string;
  status: StatusResponse;
  sources: SourceHealth[];
}

const KEYS = { prefs: "briefing.prefs", saved: "briefing.saved", read: "briefing.read" } as const;
const MAX_SAVED = 500;
const MAX_READ = 4000;

let snapshot: Snapshot | null = null;
let snapshotPromise: Promise<Snapshot> | null = null;
let latestGeneratedAt: string | null = null;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the page still works, the change just isn't kept.
  }
}

async function getJson<T>(path: string, version: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}/data/${path}?v=${encodeURIComponent(version)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadStatusFile(): Promise<StatusFile> {
  // Bust caches every 30 seconds (GitHub Pages caches files for up to 10 minutes).
  const file = await getJson<StatusFile>("status.json", String(Math.floor(Date.now() / 30_000)));
  latestGeneratedAt = file.generatedAt;
  return file;
}

async function getSnapshot(): Promise<Snapshot> {
  const stale = snapshot && latestGeneratedAt && latestGeneratedAt > snapshot.generatedAt;
  if (snapshot && !stale) return snapshot;
  if (!snapshotPromise) {
    snapshotPromise = getJson<Snapshot>("snapshot.json", latestGeneratedAt ?? String(Math.floor(Date.now() / 60_000)))
      .then((s) => {
        snapshot = s;
        return s;
      })
      .finally(() => {
        snapshotPromise = null;
      });
  }
  return snapshotPromise;
}

export function getPrefs(defaults: Prefs): Prefs {
  return { ...defaults, ...readStorage<Partial<Prefs>>(KEYS.prefs, {}) };
}

function savedMap(): Map<string, SnapshotStory> {
  return new Map(readStorage<SnapshotStory[]>(KEYS.saved, []).map((s) => [s.url, s]));
}

function readSet(): Set<string> {
  return new Set(readStorage<string[]>(KEYS.read, []));
}

async function context(): Promise<{ snap: Snapshot; ctx: RankContext }> {
  const snap = await getSnapshot();
  return {
    snap,
    ctx: { prefs: getPrefs(snap.defaultPrefs), saved: savedMap(), read: readSet(), now: Date.now(), generatedAt: snap.generatedAt },
  };
}

const num = (v: string | null) => (v == null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Answers the same requests as the server API, from the snapshot. Used as the SWR fetcher. */
export async function staticFetch<T>(key: string): Promise<T> {
  const url = new URL(key, "http://local");
  const p = url.searchParams;
  switch (url.pathname) {
    case "/api/status": {
      const file = await loadStatusFile();
      const last = file.status.lastSuccessAt ? new Date(file.status.lastSuccessAt).getTime() : null;
      return { ...file.status, running: false, nextRunAt: last ? new Date(last + 15 * 60_000).toISOString() : null } as T;
    }
    case "/api/sources":
      return (await loadStatusFile()).sources as T;
    case "/api/settings": {
      const snap = await getSnapshot();
      return getPrefs(snap.defaultPrefs) as T;
    }
    case "/api/dashboard": {
      const { snap, ctx } = await context();
      return buildDashboard(snap.stories, ctx) as T;
    }
    case "/api/companies": {
      const { snap, ctx } = await context();
      return countCompanies(snap.stories, num(p.get("from")) ?? Date.now() - 48 * 3_600_000, ctx) as T;
    }
    case "/api/stories": {
      const { snap, ctx } = await context();
      return queryStories(
        snap.stories,
        {
          section: (p.get("section") as Section | "all" | null) ?? "all",
          category: p.get("category") || undefined,
          company: p.get("company") || undefined,
          from: num(p.get("from")),
          to: num(p.get("to")),
          q: p.get("q") || undefined,
          sort: p.get("sort") === "newest" ? "newest" : "importance",
          group: p.get("group") !== "0",
          savedOnly: p.get("saved") === "1",
          limit: num(p.get("limit")),
          cursor: num(p.get("cursor")),
        },
        ctx,
      ) as T;
    }
    default:
      throw new Error(`Unknown request ${url.pathname}`);
  }
}

// ---------------------------------------------------------------------------
// Reader actions (browser storage)

export function setSaved(story: Story, saved: boolean) {
  const map = savedMap();
  const urls = [story.url, ...story.coverage.map((c) => c.url)];
  if (saved) {
    const full = snapshot?.stories.find((s) => s.id === story.id);
    const now = Date.now();
    const stored: SnapshotStory = full ?? {
      ...story,
      sortTime: story.publishedAt ? new Date(story.publishedAt).getTime() : now,
      lastActivity: now,
      firstPublishedAt: story.publishedAt ? new Date(story.publishedAt).getTime() : null,
      significance: story.breakdown.significance,
      baseScore: story.importance - 15 * story.breakdown.relevance,
      policy: false,
    };
    map.set(story.url, { ...stored, saved: true });
  } else {
    for (const u of urls) map.delete(u);
  }
  writeStorage(KEYS.saved, [...map.values()].slice(-MAX_SAVED));
}

export function addRead(url: string) {
  const list = readStorage<string[]>(KEYS.read, []);
  if (list.includes(url)) return;
  list.push(url);
  writeStorage(KEYS.read, list.slice(-MAX_READ));
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const snap = await getSnapshot();
  const next = { ...getPrefs(snap.defaultPrefs), ...patch };
  writeStorage(KEYS.prefs, next);
  return next;
}
