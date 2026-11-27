// Item 8: stock quotes are fetched server side, and a failed or partial fetch keeps the last good file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStocksFile, refreshStocks, toQuote, writeStocksFile } from "@/lib/server/stocks";
import { HOME_STOCK_SYMBOLS, isStocksFile, oldestFetch, STOCK_SYMBOLS, type StocksFile } from "@/lib/shared/stocks";

const NOW = Date.UTC(2026, 10, 27, 15, 0); // a Friday, 10:00 in New York
const T = Math.floor(NOW / 1000) - 120;
const KEY = "test-key-123";

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "stocks-"));
  file = path.join(dir, "stocks.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

type Handler = (url: URL) => { status: number; body?: unknown };
function mockFetch(handler: Handler) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: (init?.headers ?? {}) as Record<string, string> });
    const { status, body } = handler(url);
    return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const quoteFor = (symbol: string, c = 100) => ({ c, d: 1.5, dp: 1.5151, pc: c - 1.5, t: T, h: c, l: c, o: c, symbol });
function okHandler(overrides: Record<string, { status: number; body?: unknown }> = {}): Handler {
  return (url) => {
    if (url.pathname.endsWith("/stock/market-status")) return { status: 200, body: { exchange: "US", isOpen: true, session: "regular" } };
    const symbol = url.searchParams.get("symbol")!;
    return overrides[symbol] ?? { status: 200, body: quoteFor(symbol) };
  };
}

const run = (fetchImpl: typeof fetch, now = NOW, apiKey: string | undefined = KEY) =>
  refreshStocks({ apiKey, file, fetchImpl, now: () => now, gapMs: 0 });

describe("stock quotes", () => {
  it("covers the five home tickers first", () => {
    expect([...HOME_STOCK_SYMBOLS]).toEqual(["NVDA", "MSFT", "GOOGL", "AAPL", "AMZN"]);
    expect(STOCK_SYMBOLS.slice(0, 5)).toEqual([...HOME_STOCK_SYMBOLS]);
    expect(new Set(STOCK_SYMBOLS).size).toBe(STOCK_SYMBOLS.length);
  });

  it("maps a quote and rejects empty or outdated ones", () => {
    const q = toQuote("NVDA", { c: 180.5, d: 11.5, dp: 6.8047, pc: 169, t: T }, "open", NOW)!;
    expect(q).toMatchObject({ symbol: "NVDA", companyId: "nvidia", name: "NVIDIA", price: 180.5, changePercent: 6.8047, previousClose: 169, currency: "USD", marketState: "open" });
    expect(toQuote("NOPE", { c: 0, d: null, dp: null, pc: 0, t: 0 }, "open", NOW)).toBeNull();
    expect(toQuote("OLD", { c: 10, pc: 9, t: T - 30 * 86400 }, "open", NOW)).toBeNull();
    // Percent computed when the source leaves it out; state inferred without the exchange status.
    expect(toQuote("AAPL", { c: 110, pc: 100, t: T - 3 * 3600 }, null, NOW)).toMatchObject({ change: 10, changePercent: 10, marketState: "closed" });
  });

  it("does nothing without a key", async () => {
    const { impl, calls } = mockFetch(okHandler());
    expect((await run(impl, NOW, "")).status).toBe("skipped");
    expect(calls).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("writes every ticker, sending the key in a header and never in the URL", async () => {
    const { impl, calls } = mockFetch(okHandler());
    const result = await run(impl);
    expect(result).toMatchObject({ status: "updated", fetched: STOCK_SYMBOLS.length, missing: [], marketState: "open" });
    expect(calls.every((c) => c.headers["X-Finnhub-Token"] === KEY && !c.url.includes(KEY))).toBe(true);
    const saved = readStocksFile(file)!;
    expect(isStocksFile(saved)).toBe(true);
    expect(saved.quotes.map((q) => q.symbol)).toEqual(STOCK_SYMBOLS);
    expect(saved.source.name).toBe("Finnhub");
    expect(fs.readFileSync(file, "utf8")).not.toContain(KEY);
  });

  it("a partial fetch keeps the last good quote of the failed tickers", async () => {
    await run(mockFetch(okHandler()).impl);
    const later = NOW + 15 * 60_000;
    const result = await run(mockFetch(okHandler({ MSFT: { status: 500 }, AMZN: { status: 200, body: { c: 0, d: null, dp: null, pc: 0, t: 0 } } })).impl, later);
    expect(result.status).toBe("partial");
    expect(result.missing).toEqual(["MSFT", "AMZN"]);
    const saved = readStocksFile(file)!;
    expect(saved.quotes).toHaveLength(STOCK_SYMBOLS.length);
    expect(saved.quotes.find((q) => q.symbol === "MSFT")!.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(saved.quotes.find((q) => q.symbol === "NVDA")!.fetchedAt).toBe(new Date(later).toISOString());
    // The box reports the age of its oldest quote, not the file's write time.
    expect(oldestFetch(saved.quotes)).toBe(new Date(NOW).toISOString());
  });

  it("a failed fetch leaves the previous file untouched", async () => {
    await run(mockFetch(okHandler()).impl);
    const before = fs.readFileSync(file, "utf8");
    const rejected = await run(mockFetch(() => ({ status: 401, body: { error: "Invalid API key" } })).impl, NOW + 60_000);
    expect(rejected).toMatchObject({ status: "failed", fetched: 0 });
    expect(rejected.message).toMatch(/rejected/);
    const offline = await run((async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch, NOW + 120_000);
    expect(offline.status).toBe("failed");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("skips a ticker the plan does not cover (403) without stopping", async () => {
    const result = await run(mockFetch(okHandler({ SONY: { status: 403, body: { error: "You don't have access to this resource." } } })).impl);
    expect(result).toMatchObject({ status: "partial", fetched: STOCK_SYMBOLS.length - 1, missing: ["SONY"] });
    expect(result.message).toBeUndefined();
  });

  it("stops at the rate limit and keeps what it has", async () => {
    let n = 0;
    const { impl } = mockFetch((url) => {
      if (url.pathname.endsWith("/stock/market-status")) return { status: 200, body: { isOpen: false, session: null } };
      return ++n > 3 ? { status: 429 } : { status: 200, body: quoteFor(url.searchParams.get("symbol")!) };
    });
    const result = await run(impl);
    expect(result).toMatchObject({ status: "partial", fetched: 3, marketState: "closed" });
    expect(result.message).toMatch(/429/);
    expect(readStocksFile(file)!.quotes.map((q) => q.symbol)).toEqual(["NVDA", "MSFT", "GOOGL"]);
  });

  it("ignores a damaged file", () => {
    fs.writeFileSync(file, "{not json");
    expect(readStocksFile(file)).toBeNull();
    const good: StocksFile = { version: 1, generatedAt: new Date(NOW).toISOString(), source: { name: "Finnhub", url: "https://finnhub.io" }, quotes: [] };
    writeStocksFile(good, file);
    expect(readStocksFile(file)).toEqual(good);
    expect(fs.readdirSync(dir)).toEqual(["stocks.json"]); // no temporary file left behind
  });
});
