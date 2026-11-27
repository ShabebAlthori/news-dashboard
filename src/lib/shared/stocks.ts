// Stock quotes: which tickers are shown, and the shape of data/stocks.json.
// Quotes are fetched by the pipeline (server side, see src/lib/server/stocks.ts) and published
// as a small separate file. The page never calls a market-data API itself.

/** The home page's Stocks box: these tickers, in this order. */
export const HOME_STOCK_SYMBOLS = ["NVDA", "MSFT", "GOOGL", "AAPL", "AMZN"] as const;

/**
 * Exchange tickers of the tracked companies that have shares on a US exchange (NYSE / Nasdaq,
 * including ADRs). Companies not listed here are private or listed only on exchanges the free
 * data source does not cover. The /stocks page shows the followed companies found here.
 */
export const COMPANY_TICKERS: Record<string, string> = {
  nvidia: "NVDA",
  microsoft: "MSFT",
  google: "GOOGL",
  apple: "AAPL",
  amazon: "AMZN",
  meta: "META",
  amd: "AMD",
  intel: "INTC",
  qualcomm: "QCOM",
  sony: "SONY",
  ea: "EA",
  "take-two": "TTWO",
  tsmc: "TSM",
  arm: "ARM",
  snowflake: "SNOW",
  palantir: "PLTR",
};

/** Every ticker the pipeline fetches: the home box first, then the followed-company tickers. */
export const STOCK_SYMBOLS: string[] = [...new Set<string>([...HOME_STOCK_SYMBOLS, ...Object.values(COMPANY_TICKERS)])];

export function companyIdForSymbol(symbol: string): string | null {
  return Object.entries(COMPANY_TICKERS).find(([, s]) => s === symbol)?.[0] ?? null;
}

/** Regular session open, the extended sessions before/after it, or closed. */
export type MarketState = "open" | "pre" | "post" | "closed";

export interface StockQuote {
  symbol: string;
  /** Tracked company of this ticker (links to /companies/?co=…), if any. */
  companyId: string | null;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  marketState: MarketState;
  /** Time of the price according to the data source. */
  quoteTime: string | null;
  /** When the pipeline received this quote (older than generatedAt if the last fetch of this ticker failed). */
  fetchedAt: string;
}

export interface StocksFile {
  version: 1;
  /** When this file was written. */
  generatedAt: string;
  source: { name: string; url: string };
  quotes: StockQuote[];
}

/** Quotes older than this are shown muted, with their age. */
export const STOCKS_STALE_MS = 3 * 3_600_000;

/** Oldest fetch time among the given quotes (what "Updated X ago" must describe). */
export function oldestFetch(quotes: StockQuote[]): string | null {
  let oldest: string | null = null;
  for (const q of quotes) if (!oldest || Date.parse(q.fetchedAt) < Date.parse(oldest)) oldest = q.fetchedAt;
  return oldest;
}

/** Light check of a parsed stocks file (it comes from disk or the network). */
export function isStocksFile(v: unknown): v is StocksFile {
  if (!v || typeof v !== "object") return false;
  const f = v as Partial<StocksFile>;
  return (
    f.version === 1 &&
    typeof f.generatedAt === "string" &&
    Array.isArray(f.quotes) &&
    f.quotes.every((q) => q && typeof q.symbol === "string" && Number.isFinite(q.price) && Number.isFinite(q.changePercent) && typeof q.fetchedAt === "string")
  );
}
