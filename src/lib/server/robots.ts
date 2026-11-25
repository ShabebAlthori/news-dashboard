import robotsParser from "robots-parser";
import { config } from "./config";
import { getDb } from "./db";

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCT_TOKEN = "PersonalNewsDashboard";

export interface RobotsDecision {
  allowed: boolean;
  /** Publisher opted out of AI use of its content (Content-Signal: ai-input=no). */
  aiInputAllowed: boolean;
  reason?: string;
}

interface CachedRobots {
  status: number;
  body: string;
  fetched_at: number;
}

async function loadRobots(origin: string): Promise<CachedRobots | null> {
  const db = getDb();
  const cached = db.prepare("SELECT status, body, fetched_at FROM robots_cache WHERE origin = ?").get(origin) as
    | CachedRobots
    | undefined;
  if (cached && Date.now() - cached.fetched_at < ROBOTS_TTL_MS) return cached;

  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": config.userAgent, accept: "text/plain,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const body = res.ok ? (await res.text()).slice(0, 512 * 1024) : "";
    const record = { status: res.status, body, fetched_at: Date.now() };
    db.prepare(
      `INSERT INTO robots_cache (origin, status, body, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(origin) DO UPDATE SET status = excluded.status, body = excluded.body, fetched_at = excluded.fetched_at`,
    ).run(origin, record.status, record.body, record.fetched_at);
    return record;
  } catch {
    // Network error fetching robots.txt: fall back to a stale cache if we have one.
    return cached ?? null;
  }
}

/** Parse Cloudflare-style `Content-Signal:` lines that apply to all user agents. */
export function parseContentSignals(body: string): Record<string, string> {
  const signals: Record<string, string> = {};
  let inStarGroup = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStarGroup = value === "*";
      continue;
    }
    if (key === "content-signal" && inStarGroup) {
      for (const pair of value.split(",")) {
        const [k, v] = pair.split("=").map((p) => p?.trim().toLowerCase());
        if (k && v) signals[k] = v;
      }
    }
  }
  return signals;
}

export async function checkRobots(feedUrl: string): Promise<RobotsDecision> {
  const url = new URL(feedUrl);
  const robots = await loadRobots(url.origin);
  // No robots.txt (4xx) or unreachable: RFC 9309 treats 4xx as "allow all".
  if (!robots || robots.status >= 400 || !robots.body) return { allowed: true, aiInputAllowed: true };
  const parser = robotsParser(`${url.origin}/robots.txt`, robots.body);
  const allowed = parser.isAllowed(feedUrl, PRODUCT_TOKEN) !== false;
  const signals = parseContentSignals(robots.body);
  return {
    allowed,
    aiInputAllowed: signals["ai-input"] !== "no",
    reason: allowed ? undefined : "Disallowed by robots.txt",
  };
}
