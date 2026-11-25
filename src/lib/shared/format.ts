import type { Lang } from "./types";

// Western digits in both languages, as most Arabic technology publications use.
const LOCALES: Record<Lang, string> = { en: "en-GB", ar: "ar-u-nu-latn" };

const dateTimeCache = new Map<string, Intl.DateTimeFormat>();
function dtf(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${lang}:${JSON.stringify(options)}`;
  let f = dateTimeCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], options);
    dateTimeCache.set(key, f);
  }
  return f;
}

export function formatDateTime(iso: string, lang: Lang, now = Date.now()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return dtf(lang, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatTime(iso: string, lang: Lang): string {
  return dtf(lang, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatLongDate(date: Date, lang: Lang): string {
  return dtf(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

const rtfCache = new Map<Lang, Intl.RelativeTimeFormat>();
export function formatRelative(iso: string, lang: Lang, now = Date.now()): string {
  let rtf = rtfCache.get(lang);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: "auto", style: "long" });
    rtfCache.set(lang, rtf);
  }
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDateTime(iso, lang, now);
}

export type RangeKey = "today" | "24h" | "3d" | "7d" | "30d" | "all" | "custom";
export const RANGE_KEYS: RangeKey[] = ["today", "24h", "3d", "7d", "30d", "all", "custom"];

/** Convert a range preset to [from, to] in epoch ms using the reader's local time zone. */
export function rangeToBounds(range: RangeKey, customFrom?: string, customTo?: string, now = Date.now()): { from?: number; to?: number } {
  const hour = 3_600_000;
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return { from: d.getTime() };
    }
    case "24h":
      return { from: now - 24 * hour };
    case "3d":
      return { from: now - 72 * hour };
    case "7d":
      return { from: now - 7 * 24 * hour };
    case "30d":
      return { from: now - 30 * 24 * hour };
    case "custom": {
      const out: { from?: number; to?: number } = {};
      if (customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom)) out.from = new Date(`${customFrom}T00:00:00`).getTime();
      if (customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) out.to = new Date(`${customTo}T23:59:59.999`).getTime();
      return out;
    }
    default:
      return {};
  }
}
