import { config } from "./config";

export type FetchOutcome =
  | { kind: "ok"; body: string; etag: string | null; lastModified: string | null; finalUrl: string }
  | { kind: "not-modified" }
  | { kind: "error"; status: number | null; message: string; retryAfterMs: number | null };

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, 6 * 60 * 60 * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 6 * 60 * 60 * 1000));
  return null;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`Feed exceeds ${Math.round(limit / 1024 / 1024)} MB limit`);
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  // Honour an explicit XML encoding declaration when it is not UTF-8.
  const head = buffer.subarray(0, 200).toString("latin1");
  const declared = head.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  const headerCharset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  const charset = declared || headerCharset || "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/** Polite conditional GET of a feed. Never throws. */
export async function fetchFeed(
  url: string,
  cache: { etag: string | null; lastModified: string | null },
): Promise<FetchOutcome> {
  const headers: Record<string, string> = {
    "user-agent": config.userAgent,
    accept: "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
    "accept-encoding": "gzip, deflate, br",
  };
  if (cache.etag) headers["if-none-match"] = cache.etag;
  if (cache.lastModified) headers["if-modified-since"] = cache.lastModified;

  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(config.fetchTimeoutMs) });
    if (res.status === 304) return { kind: "not-modified" };
    if (!res.ok) {
      return {
        kind: "error",
        status: res.status,
        message: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      };
    }
    const body = await readLimited(res, config.maxFeedBytes);
    return {
      kind: "ok",
      body,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      finalUrl: res.url || url,
    };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const message =
      e.name === "TimeoutError" ? "Request timed out" : e.cause?.code ? `Network error (${e.cause.code})` : e.message || "Network error";
    return { kind: "error", status: null, message, retryAfterMs: null };
  }
}
