"use client";

// Data layer of the static web edition. The site ships two JSON files, refreshed by
// GitHub Actions: data/status.json (small, polled) and data/snapshot.json (all stories).
// Reader state — saved stories, read history and settings — stays in this browser.
import { buildDashboard, countCompanies, isDefaultPrefs, queryStories, unpackDashboard, withReaderState, type RankContext } from "@/lib/shared/rank";
import type { Section } from "@/lib/shared/taxonomy";
import { nextReportAt } from "@/lib/shared/schedule";
import type { HomeFile, Prefs, RadarResponse, ReportResponse, Snapshot, SnapshotStory, SourceHealth, StatusResponse, StoriesResponse, Story, WeeklyReport } from "@/lib/shared/types";
import { normalizePrefs } from "@/lib/shared/prefs";
import { buildReaderData, MAX_READ, MAX_SAVED, mergeReaderData, parseReaderData, type ReaderData } from "@/lib/shared/reader-data";
import type { StocksFile } from "@/lib/shared/stocks";
import { mutate } from "swr";
import { BASE_PATH } from "./mode";

interface StatusFile {
  generatedAt: string;
  status: StatusResponse;
  sources: SourceHealth[];
  /** Version of data/stocks.json; null or absent when no quotes are published. */
  stocksAt?: string | null;
}

const KEYS = { prefs: "briefing.prefs", saved: "briefing.saved", read: "briefing.read" } as const;

let snapshot: Snapshot | null = null;
let snapshotPromise: Promise<Snapshot> | null = null;
let latestGeneratedAt: string | null = null;
/** Generation time of the data files currently used for display (home.json / snapshot.json). */
let displayedGeneratedAt: number | null = null;
function noteDisplayed(generatedAt: string) {
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t) || t === displayedGeneratedAt) return;
  displayedGeneratedAt = t;
  // Older than what status.json reports (e.g. a cached offline copy): re-read the status now, so
  // the "Data is X old" notice appears with the data rather than at the next poll.
  if (latestGeneratedAt && t < Date.parse(latestGeneratedAt) - 60_000) void mutate("/api/status");
}

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

let statusRequest: { version: string; promise: Promise<StatusFile> } | null = null;

/**
 * status.json, shared by every caller: concurrent requests (status poll, radar, report…) use one
 * fetch, and the result is reused for 30 seconds (GitHub Pages caches files for up to 10 minutes).
 */
export function loadStatusFile(): Promise<StatusFile> {
  const version = String(Math.floor(Date.now() / 30_000));
  if (statusRequest?.version !== version) {
    const promise = getJson<StatusFile>("status.json", version).then((file) => {
      latestGeneratedAt = file.generatedAt;
      return file;
    });
    promise.catch(() => {
      if (statusRequest?.promise === promise) statusRequest = null;
    });
    statusRequest = { version, promise };
  }
  return statusRequest.promise;
}

async function getSnapshot(): Promise<Snapshot> {
  const stale = snapshot && latestGeneratedAt && latestGeneratedAt > snapshot.generatedAt;
  if (snapshot && !stale) return snapshot;
  if (!snapshotPromise) {
    snapshotPromise = getJson<Snapshot>("snapshot.json", latestGeneratedAt ?? String(Math.floor(Date.now() / 60_000)))
      .then((s) => {
        snapshot = s;
        noteDisplayed(s.generatedAt);
        return s;
      })
      .finally(() => {
        snapshotPromise = null;
      });
  }
  return snapshotPromise;
}

/** Report file of the web edition: the latest reports in full, newest first. */
export interface ReportFile {
  generatedAt: string;
  reports: WeeklyReport[];
}

const dataFiles = new Map<string, { version: string; promise: Promise<unknown> }>();

/** Radar and report files follow the snapshot's version so they refresh together; stocks.json has its own. */
async function getDataFile<T>(name: string, fixedVersion?: string): Promise<T> {
  const version = fixedVersion ?? latestGeneratedAt ?? (await loadStatusFile()).generatedAt;
  const cached = dataFiles.get(name);
  if (cached && cached.version === version) return cached.promise as Promise<T>;
  const promise = getJson<T>(name, version).catch((err) => {
    dataFiles.delete(name);
    throw err;
  });
  dataFiles.set(name, { version, promise });
  return promise;
}

/** The home page's slim data file; the full snapshot is loaded only by pages that need it. */
/** Without home.json (e.g. a site published before it existed): defaults from the snapshot, no precomputed parts. */
function homeFromSnapshot(s: Snapshot): HomeFile {
  return { version: 1, generatedAt: s.generatedAt, defaultPrefs: s.defaultPrefs, dashboard: null, alerts: [], radar: { lastSuccessAt: null, items: [] }, report: { latest: null } };
}

function getHome(): Promise<HomeFile> {
  return getDataFile<HomeFile>("home.json")
    .then((home) => {
      noteDisplayed(home.generatedAt);
      return home;
    })
    .catch(async () => homeFromSnapshot(await getSnapshot()));
}

export function getPrefs(defaults: Prefs): Prefs {
  // Settings saved before the priority categories existed are migrated, not reset.
  return normalizePrefs({ ...defaults, categoryOrder: [], ...readStorage<Partial<Prefs>>(KEYS.prefs, {}) } as Prefs);
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
    ctx: { prefs: getPrefs(snap.defaultPrefs), saved: savedMap(), read: readSet(), now: Date.now(), generatedAt: snap.generatedAt, asOf: Date.parse(snap.generatedAt) },
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
      const interval = file.status.intervalMinutes || 15;
      // An older copy on screen (offline, cached by the service worker) is reported, so the
      // "Data is X old" notice reflects what the reader actually sees.
      const older = displayedGeneratedAt != null && displayedGeneratedAt < Date.parse(file.generatedAt) - 60_000;
      return {
        ...file.status,
        running: false,
        nextRunAt: last ? new Date(last + interval * 60_000).toISOString() : null,
        displayedAt: older ? new Date(displayedGeneratedAt!).toISOString() : null,
      } as T;
    }
    case "/api/sources":
      return (await loadStatusFile()).sources as T;
    case "/api/settings": {
      const home = await getHome();
      return getPrefs(home.defaultPrefs) as T;
    }
    case "/api/dashboard": {
      // Default preferences and no category filter: the precomputed dashboard in home.json,
      // with this browser's saved/read state. Anything else is computed from the full snapshot.
      const category = p.get("category");
      if (!category && !snapshot) {
        const home = await getHome();
        if (home.dashboard && isDefaultPrefs(getPrefs(home.defaultPrefs), home.defaultPrefs)) {
          return withReaderState(unpackDashboard(home.dashboard), new Set(savedMap().keys()), readSet()) as T;
        }
      }
      const { snap, ctx } = await context();
      return buildDashboard(snap.stories, ctx, { category }) as T;
    }
    case "/api/radar": {
      if (p.get("panel") === "1" && !dataFiles.has("radar.json")) {
        const home = await getHome();
        if (home.dashboard) return { items: home.radar.items, lastSuccessAt: home.radar.lastSuccessAt, sources: [], generatedAt: home.generatedAt } satisfies RadarResponse as T;
      }
      return (await getDataFile<RadarResponse>("radar.json")) as T;
    }
    case "/api/report": {
      if (p.get("meta") === "1" && !dataFiles.has("report.json")) {
        const home = await getHome();
        if (home.dashboard) {
          return {
            latest: null,
            archive: home.report.latest ? [home.report.latest] : [],
            nextAt: new Date(nextReportAt(Date.now())).toISOString(),
            generatedAt: home.generatedAt,
          } satisfies ReportResponse as T;
        }
      }
      const file = await getDataFile<ReportFile>("report.json");
      const id = num(p.get("id"));
      const latest = (id ? file.reports.find((r) => r.id === id) : file.reports[0]) ?? null;
      return {
        latest,
        archive: file.reports.map((r) => ({ id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd })),
        nextAt: new Date(nextReportAt(Date.now())).toISOString(),
        generatedAt: file.generatedAt,
      } satisfies ReportResponse as T;
    }
    case "/api/stocks": {
      // A separate small file with its own version, so quotes never enlarge home.json.
      const { stocksAt } = await loadStatusFile();
      if (!stocksAt) throw new Error("No stock quotes are published");
      return (await getDataFile<StocksFile>("stocks.json", stocksAt)) as T;
    }
    case "/api/companies": {
      const { snap, ctx } = await context();
      return countCompanies(snap.stories, num(p.get("from")) ?? Date.now() - 48 * 3_600_000, ctx) as T;
    }
    case "/api/stories": {
      // pool=home: the notifications menu uses the precomputed alerts, never the full snapshot.
      if (p.get("pool") === "home" && !snapshot) {
        const home = await getHome();
        if (home.dashboard) {
          const read = readSet();
          const saved = new Set(savedMap().keys());
          const stories = home.alerts.map((s) => ({ ...s, saved: saved.has(s.url), read: read.has(s.url) }));
          return { stories, total: stories.length, nextCursor: null, generatedAt: home.generatedAt } satisfies StoriesResponse as T;
        }
      }
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
  const home = await getHome();
  const next = normalizePrefs({ ...getPrefs(home.defaultPrefs), ...patch });
  writeStorage(KEYS.prefs, next);
  return next;
}

// ---------------------------------------------------------------------------
// Export / import of this browser's reader data (Settings → Data)

/** Everything this browser keeps for the reader, as one JSON-ready object. */
export async function exportReaderData(display: ReaderData["display"]): Promise<ReaderData> {
  const home = await getHome();
  return buildReaderData({ settings: getPrefs(home.defaultPrefs), display, saved: [...savedMap().values()], read: readStorage<string[]>(KEYS.read, []) });
}

/** Validates an export file's JSON (null if it is not one) and counts what importing it would add. */
export async function prepareImport(raw: unknown): Promise<{ data: ReaderData; addedSaved: number; addedRead: number } | null> {
  const home = await getHome();
  const data = parseReaderData(raw, home.defaultPrefs);
  if (!data) return null;
  const { addedSaved, addedRead } = mergeReaderData({ saved: [...savedMap().values()], read: readStorage<string[]>(KEYS.read, []) }, data);
  return { data, addedSaved, addedRead };
}

/** Merges saved articles and read history, and replaces the settings with the imported ones. */
export function applyImport(data: ReaderData): { addedSaved: number; addedRead: number } {
  const merged = mergeReaderData({ saved: [...savedMap().values()], read: readStorage<string[]>(KEYS.read, []) }, data);
  writeStorage(KEYS.saved, merged.saved);
  writeStorage(KEYS.read, merged.read);
  writeStorage(KEYS.prefs, data.settings);
  return { addedSaved: merged.addedSaved, addedRead: merged.addedRead };
}
