"use client";

import { ChartCandlestick, Clock } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { formatRelative, formatSessionDate } from "@/lib/shared/format";
import { formatAge } from "@/lib/shared/freshness";
import { COMPANY_TICKERS, HOME_STOCK_SYMBOLS, oldestFetch, STOCKS_STALE_MS, type StockQuote, type StocksFile } from "@/lib/shared/stocks";
import { COMPANIES, companyById } from "@/lib/shared/taxonomy";
import type { Lang, Prefs } from "@/lib/shared/types";
import { CompanyLogo } from "./logos";
import { IconBubble, PanelTitle, ViewAll } from "./panel";
import { useNow, useUi } from "./providers";
import { EmptyState, ListSkeleton, PageHeader } from "./states";

/** data/stocks.json (or /api/stocks on a self-hosted server). Errors mean "no quotes": the box hides. */
export function useStocks() {
  return useSWR<StocksFile>("/api/stocks", { refreshInterval: 5 * 60_000, revalidateOnFocus: false, errorRetryCount: 2 });
}

// Numbers are always Western digits, left to right, with tabular figures (in both languages).
const PCT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SPOKEN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const priceFormats = new Map<string, Intl.NumberFormat>();
function formatPrice(value: number, currency: string): string {
  let f = priceFormats.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    priceFormats.set(currency, f);
  }
  return f.format(value);
}

type Direction = "up" | "down" | "flat";
function direction(q: StockQuote): { dir: Direction; pct: number } {
  const pct = Math.round(q.changePercent * 100) / 100; // as displayed
  return { dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat", pct: Math.abs(pct) };
}

function companyName(q: StockQuote, lang: Lang): string {
  return (q.companyId && companyById(q.companyId)?.[lang]) || q.name;
}

/** "NVIDIA, up 6.8 percent" — the change in words, so it never depends on color or the arrow glyph. */
function useSpokenChange() {
  const { t, lang } = useUi();
  return (q: StockQuote) => {
    const { dir, pct } = direction(q);
    const name = companyName(q, lang);
    return dir === "flat" ? t("stocks.flat", { name }) : t(dir === "up" ? "stocks.up" : "stocks.down", { name, pct: SPOKEN.format(pct) });
  };
}

/** ▲ 6.80% in green, ▼ 1.20% in red; muted (arrow kept) when the quotes are old. */
function Change({ q, muted = false, className = "" }: { q: StockQuote; muted?: boolean; className?: string }) {
  const { dir, pct } = direction(q);
  const color = muted || dir === "flat" ? "text-muted" : dir === "up" ? "text-ok" : "text-breaking";
  return (
    <span dir="ltr" className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[13.5px] font-medium tabular-nums ${color} ${className}`}>
      <span className="text-[0.75em]" aria-hidden>
        {dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}
      </span>
      {PCT.format(pct)}%
    </span>
  );
}

/** Market state, age and attribution lines shared by the box and the page. Each line is one row high. */
function StocksMeta({ file, quotes }: { file: StocksFile | undefined; quotes: StockQuote[] | null }) {
  const { t, lang } = useUi();
  const now = useNow();
  const line = "block h-[18px] truncate";
  if (!file || !quotes?.length) {
    return (
      <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs" aria-hidden>
        <span className={`${line} skeleton w-40`} />
        <span className={`${line} skeleton w-32`} />
        <span className={`${line} text-subtle`}>{t("stocks.disclaimer")}</span>
      </div>
    );
  }
  const fetched = oldestFetch(quotes) ?? file.generatedAt;
  const age = now - Date.parse(fetched);
  const stale = age > STOCKS_STALE_MS;
  const state = quotes[0].marketState;
  const closeAt = quotes.map((q) => q.quoteTime).find(Boolean);
  const stateText =
    state === "open"
      ? t("stocks.delayed")
      : state === "closed"
        ? `${t("stocks.closed")}${closeAt ? ` · ${t("stocks.lastClose", { date: formatSessionDate(closeAt, lang) })}` : ""}`
        : `${t("stocks.delayed")} · ${t("stocks.extended")}`;
  const ageText = stale ? t("stocks.old", { age: formatAge(age, lang) }) : t("stocks.updated", { time: formatRelative(fetched, lang, now) });
  return (
    <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
      <p className={`${line} text-muted`} title={stateText}>
        {stateText}
      </p>
      <p className={`${line} ${stale ? "text-caution" : "text-muted"}`}>
        {stale && <Clock className="me-1 inline size-3.5 align-[-2px]" aria-hidden />}
        <time dateTime={fetched}>{ageText}</time>
        {" · "}
        <a href={file.source.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {t("stocks.source", { name: file.source.name })}
        </a>
      </p>
      <p className={`${line} text-subtle`}>{t("stocks.disclaimer")}</p>
    </div>
  );
}

const ROW = "flex h-[60px] items-center gap-3";

/** The home page's Stocks box (right column, under Trending Companies). Hidden when quotes cannot be loaded. */
export function StocksCard() {
  const { t, lang } = useUi();
  const now = useNow();
  const spoken = useSpokenChange();
  const { data, error } = useStocks();
  if (error && !data) return null;
  const quotes = data ? HOME_STOCK_SYMBOLS.map((s) => data.quotes.find((q) => q.symbol === s)).filter((q): q is StockQuote => !!q) : null;
  if (quotes && quotes.length === 0) return null;
  const stale = !!quotes && now - Date.parse(oldestFetch(quotes) ?? data!.generatedAt) > STOCKS_STALE_MS;

  return (
    <section className="border-t border-line pt-4" aria-labelledby="stocks-title" aria-busy={!quotes}>
      <PanelTitle
        id="stocks-title"
        icon={
          <IconBubble>
            <ChartCandlestick className="size-4" aria-hidden />
          </IconBubble>
        }
        title={t("stocks.title")}
        action={<ViewAll href="/stocks" label={t("stocks.viewAll")} ariaLabel={t("stocks.viewAllLabel")} />}
      />
      <ul className="divide-y divide-line">
        {quotes
          ? quotes.map((q) => {
              const name = companyName(q, lang);
              const body = (
                <>
                  <CompanyLogo id={q.companyId ?? q.symbol} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium leading-5 text-fg">{name}</span>
                    <span className="block font-mono text-xs text-subtle">
                      <span dir="ltr">{q.symbol}</span>
                    </span>
                  </span>
                  <Change q={q} muted={stale} />
                </>
              );
              return (
                <li key={q.symbol}>
                  {q.companyId ? (
                    <Link href={`/companies?co=${q.companyId}`} aria-label={spoken(q)} className={`${ROW} -mx-2 rounded-lg px-2 transition-colors hover:bg-surface`}>
                      {body}
                    </Link>
                  ) : (
                    <div role="group" aria-label={spoken(q)} className={ROW}>
                      {body}
                    </div>
                  )}
                </li>
              );
            })
          : HOME_STOCK_SYMBOLS.map((s) => (
              <li key={s} className={ROW} aria-hidden>
                <span className="skeleton size-9 shrink-0 rounded-[28%]" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-3.5 w-24" />
                  <span className="skeleton block h-3 w-12" />
                </span>
                <span className="skeleton h-4 w-14" />
              </li>
            ))}
      </ul>
      <StocksMeta file={data} quotes={quotes} />
    </section>
  );
}

/** /stocks: share prices of the followed companies that have a covered ticker. */
export function StocksView() {
  const { t, lang } = useUi();
  const now = useNow();
  const spoken = useSpokenChange();
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const { data, error, isLoading } = useStocks();
  const followed = prefs?.followedCompanies ?? COMPANIES.filter((c) => c.core).map((c) => c.id);
  const tracked = COMPANIES.filter((c) => followed.includes(c.id));
  const listed = tracked.filter((c) => COMPANY_TICKERS[c.id]);
  const unlisted = tracked.filter((c) => !COMPANY_TICKERS[c.id]);
  const rows = listed.map((c) => ({ company: c, symbol: COMPANY_TICKERS[c.id], quote: data?.quotes.find((q) => q.symbol === COMPANY_TICKERS[c.id]) ?? null }));
  const quotes = rows.flatMap((r) => (r.quote ? [r.quote] : []));
  const stale = quotes.length > 0 && now - Date.parse(oldestFetch(quotes) ?? data!.generatedAt) > STOCKS_STALE_MS;
  const names = new Intl.ListFormat(lang === "ar" ? "ar" : "en", { type: "conjunction" });

  const header = <PageHeader eyebrow={t("nav.companies")} title={t("page.stocks.title")} subtitle={t("page.stocks.subtitle")} />;
  if (!prefs || (isLoading && !data)) {
    return (
      <>
        {header}
        <ListSkeleton rows={3} />
      </>
    );
  }
  if (!listed.length) {
    return (
      <>
        {header}
        <EmptyState title={t("stocks.noFollowed")} />
        <p className="mt-4 text-center">
          <Link href="/settings#companies" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
            {t("stocks.manage")}
          </Link>
        </p>
      </>
    );
  }
  if (error && !data) {
    return (
      <>
        {header}
        <EmptyState title={t("stocks.unavailable")} />
      </>
    );
  }

  return (
    <>
      {header}
      <section aria-label={t("page.stocks.title")}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="pb-2 text-start font-medium">
                {t("stocks.company")}
              </th>
              <th scope="col" className="pb-2 text-end font-medium">
                {t("stocks.price")}
              </th>
              <th scope="col" className="pb-2 text-end font-medium">
                {t("stocks.change")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ company, symbol, quote }) => (
              <tr key={company.id}>
                <td className="py-1.5 pe-3">
                  <Link href={`/companies?co=${company.id}`} className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                    <CompanyLogo id={company.id} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-fg">{company[lang]}</span>
                      <span className="block text-xs text-subtle">
                        <span dir="ltr">{symbol}</span>
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="py-1.5 text-end">
                  {quote ? (
                    <span dir="ltr" className="whitespace-nowrap font-mono text-[13.5px] tabular-nums text-fg">
                      {formatPrice(quote.price, quote.currency)}
                    </span>
                  ) : (
                    <span className="text-xs text-subtle">{t("stocks.noQuote")}</span>
                  )}
                </td>
                <td className="py-1.5 ps-3 text-end">
                  {quote && (
                    <>
                      <span aria-hidden>
                        <Change q={quote} muted={stale} className="text-sm" />
                      </span>
                      <span className="sr-only">{spoken(quote)}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <StocksMeta file={data} quotes={quotes.length ? quotes : null} />
      </section>
      {unlisted.length > 0 && <p className="mt-4 text-sm text-muted">{t("stocks.notCovered", { names: names.format(unlisted.map((c) => c[lang])) })}</p>}
      <p className="mt-2">
        <Link href="/settings#companies" className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
          {t("stocks.manage")}
        </Link>
      </p>
    </>
  );
}
