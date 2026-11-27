// Stock quotes for the Stocks box and the /stocks page, fetched server side only.
//
// Source: Finnhub (https://finnhub.io) — a documented market-data API with a free key.
// The key (FINNHUB_API_KEY) is a server/CI secret: it is sent in a request header, never put in
// a URL, a log line or any file the browser receives. Free plan: 60 API calls per minute; one
// refresh makes one market-status call plus one quote call per ticker (≈17 calls).
//
// The file is written only with real quotes: a ticker whose fetch fails keeps its last good
// quote (with its own, older fetch time), and when nothing could be fetched the previous file
// is left exactly as it was. Errors are reported in the result and never thrown.
import fs from "node:fs";
import path from "node:path";
import { companyIdForSymbol, isStocksFile, STOCK_SYMBOLS, type MarketState, type StockQuote, type StocksFile } from "@/lib/shared/stocks";
import { companyById } from "@/lib/shared/taxonomy";
import { config } from "./config";

const FINNHUB = "https://finnhub.io/api/v1";
const SOURCE = { name: "Finnhub", url: "https://finnhub.io" };
/** A quote whose own time is older than this is treated as missing (e.g. a delisted ticker). */
const MAX_QUOTE_AGE_MS = 10 * 86_400_000;
/** A kept (last good) quote is dropped once its fetch is older than this. */
const MAX_KEEP_MS = 14 * 86_400_000;

export function stocksFilePath(): string {
  return process.env.STOCKS_FILE ? path.resolve(process.env.STOCKS_FILE) : path.join(path.dirname(config.databasePath), "stocks.json");
}

export function readStocksFile(file = stocksFilePath()): StocksFile | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return isStocksFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Writes via a temporary file, so a crash mid-write never leaves a broken stocks.json. */
export function writeStocksFile(data: StocksFile, file = stocksFilePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export interface StocksResult {
  status: "updated" | "partial" | "failed" | "skipped";
  /** Tickers with a fresh quote in this run. */
  fetched: number;
  /** Tickers that kept their last good quote or have none. */
  missing: string[];
  marketState: MarketState | null;
  message?: string;
}

interface FinnhubQuote {
  c?: number; // current price
  d?: number | null; // change
  dp?: number | null; // percent change
  pc?: number; // previous close
  t?: number; // unix seconds
}

interface FinnhubMarketStatus {
  isOpen?: boolean;
  session?: string | null;
}

class StopError extends Error {}

function marketStateOf(s: FinnhubMarketStatus): MarketState {
  if (s.isOpen && (s.session === "regular" || !s.session)) return "open";
  if (s.session === "pre-market") return "pre";
  if (s.session === "post-market") return "post";
  return s.isOpen ? "open" : "closed";
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** A quote from Finnhub's /quote response, or null when it holds no usable price. */
export function toQuote(symbol: string, q: FinnhubQuote, marketState: MarketState | null, now: number): StockQuote | null {
  const price = Number(q.c);
  const previousClose = Number(q.pc);
  // Finnhub answers unknown symbols with zeros.
  if (!(price > 0) || !(previousClose > 0)) return null;
  const quoteMs = q.t ? q.t * 1000 : null;
  if (quoteMs && now - quoteMs > MAX_QUOTE_AGE_MS) return null;
  const change = Number.isFinite(q.d) ? Number(q.d) : price - previousClose;
  const changePercent = Number.isFinite(q.dp) ? Number(q.dp) : (change / previousClose) * 100;
  const companyId = companyIdForSymbol(symbol);
  // Without the exchange status: a price older than 30 minutes means no session is trading.
  const state = marketState ?? (quoteMs && now - quoteMs < 30 * 60_000 ? "open" : "closed");
  return {
    symbol,
    companyId,
    name: (companyId && companyById(companyId)?.en) || symbol,
    price: round(price, 4),
    change: round(change, 4),
    changePercent: round(changePercent, 4),
    previousClose: round(previousClose, 4),
    currency: "USD",
    marketState: state,
    quoteTime: quoteMs ? new Date(quoteMs).toISOString() : null,
    fetchedAt: new Date(now).toISOString(),
  };
}

export interface RefreshStocksOptions {
  apiKey?: string;
  file?: string;
  symbols?: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Pause between calls (ms); keeps a refresh well under the per-minute limit. */
  gapMs?: number;
  /** Stop starting new calls after this long (ms). */
  budgetMs?: number;
}

export async function refreshStocks(opts: RefreshStocksOptions = {}): Promise<StocksResult> {
  const apiKey = opts.apiKey ?? config.stocks.finnhubApiKey;
  const file = opts.file ?? stocksFilePath();
  const symbols = opts.symbols ?? STOCK_SYMBOLS;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const gapMs = opts.gapMs ?? 250;
  const deadline = now() + (opts.budgetMs ?? 60_000);
  if (!apiKey) return { status: "skipped", fetched: 0, missing: symbols, marketState: null, message: "FINNHUB_API_KEY is not set" };

  let stopReason: string | undefined;
  async function call<T>(pathAndQuery: string): Promise<T | null> {
    try {
      const res = await doFetch(`${FINNHUB}${pathAndQuery}`, {
        headers: { "X-Finnhub-Token": apiKey!, accept: "application/json", "user-agent": config.userAgent },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401) throw new StopError("the API key was rejected (401)");
      if (res.status === 429) throw new StopError("rate limited (429)");
      // 403: this ticker is not covered by the plan; only this one is skipped.
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof StopError) throw err;
      return null; // network error or timeout: this ticker keeps its last good quote
    }
  }

  const fresh = new Map<string, StockQuote>();
  let marketState: MarketState | null = null;
  try {
    const status = await call<FinnhubMarketStatus>("/stock/market-status?exchange=US");
    if (status && typeof status === "object") marketState = marketStateOf(status);
    for (const symbol of symbols) {
      if (now() > deadline) {
        stopReason = "time budget used up";
        break;
      }
      await new Promise((r) => setTimeout(r, gapMs));
      const q = await call<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`);
      const quote = q && typeof q === "object" ? toQuote(symbol, q, marketState, now()) : null;
      if (quote) fresh.set(symbol, quote);
    }
  } catch (err) {
    stopReason = (err as Error).message;
  }

  const missing = symbols.filter((s) => !fresh.has(s));
  if (fresh.size === 0) {
    return { status: "failed", fetched: 0, missing, marketState, message: `no quotes received${stopReason ? `: ${stopReason}` : ""}; kept the previous file` };
  }

  // Merge with the last good file: tickers missing from this run keep their previous quote.
  const previous = readStocksFile(file);
  const quotes: StockQuote[] = [];
  for (const symbol of symbols) {
    const q = fresh.get(symbol) ?? previous?.quotes.find((p) => p.symbol === symbol && now() - Date.parse(p.fetchedAt) < MAX_KEEP_MS);
    if (q) quotes.push(q);
  }
  writeStocksFile({ version: 1, generatedAt: new Date(now()).toISOString(), source: SOURCE, quotes }, file);
  return {
    status: missing.length ? "partial" : "updated",
    fetched: fresh.size,
    missing,
    marketState,
    ...(stopReason ? { message: stopReason } : {}),
  };
}
