// How fresh the published data is, relative to how often it is supposed to update.

export type FreshnessLevel = "fresh" | "aging" | "stale" | "unknown";

export interface Freshness {
  level: FreshnessLevel;
  /** Age of the last successful update in ms (null when there was none). */
  ageMs: number | null;
}

/**
 * fresh: younger than 2× the update interval · aging: 2×–6× · stale: older than 6×.
 * The interval comes from the data itself (status.intervalMinutes), never a constant.
 */
export function dataFreshness(lastSuccessAt: string | null | undefined, intervalMinutes: number | null | undefined, now: number): Freshness {
  if (!lastSuccessAt) return { level: "unknown", ageMs: null };
  const t = Date.parse(lastSuccessAt);
  if (!Number.isFinite(t)) return { level: "unknown", ageMs: null };
  const ageMs = Math.max(0, now - t);
  const interval = Math.max(1, intervalMinutes || 15) * 60_000;
  const level: FreshnessLevel = ageMs < 2 * interval ? "fresh" : ageMs < 6 * interval ? "aging" : "stale";
  return { level, ageMs };
}

/** "4 hours" / "4 ساعات", "35 minutes" / "35 دقيقة" — localized with plural rules. */
export function formatAge(ageMs: number, lang: "en" | "ar"): string {
  const locale = lang === "ar" ? "ar-u-nu-latn" : "en-GB";
  const minutes = Math.round(ageMs / 60_000);
  const [value, unit] = minutes < 60 ? [Math.max(1, minutes), "minute"] : minutes < 48 * 60 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);
}
