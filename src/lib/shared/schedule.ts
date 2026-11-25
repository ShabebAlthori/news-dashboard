// Timing rules shared by the server, the export script and the browser.

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The Data Radar is shown as "Live" only after a successful refresh within this window. */
export const RADAR_LIVE_WINDOW_MS = 40 * MINUTE;

export function isRadarLive(lastSuccessAt: string | null | undefined, now: number): boolean {
  if (!lastSuccessAt) return false;
  const t = Date.parse(lastSuccessAt);
  return Number.isFinite(t) && now - t >= -5 * MINUTE && now - t < RADAR_LIVE_WINDOW_MS;
}

/** The Weekly Tech Report is published every Sunday at 02:00 UTC (05:00 in Riyadh). */
export const REPORT_WEEKDAY = 0;
export const REPORT_HOUR_UTC = 2;

/** The most recent scheduled report time at or before `now`. */
export function lastReportSlot(now: number): number {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), REPORT_HOUR_UTC);
  let slot = today - ((d.getUTCDay() - REPORT_WEEKDAY + 7) % 7) * DAY;
  if (slot > now) slot -= 7 * DAY;
  return slot;
}

export function nextReportAt(now: number): number {
  return lastReportSlot(now) + 7 * DAY;
}
