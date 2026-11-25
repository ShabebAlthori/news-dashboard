// In-process scheduler: refreshes feeds every 10–15 minutes (configurable in Settings).
// Started once from instrumentation.ts when the Next.js server boots. A database lock
// prevents overlapping runs, including with the optional standalone worker.
import { config } from "./config";
import { runRefresh } from "./pipeline";
import { getPrefs } from "./settings";
import { setNextRunAt } from "./status";

const g = globalThis as unknown as { __newsScheduler?: { timer: NodeJS.Timeout | null; started: boolean } };

function intervalMs(): number {
  return Math.min(15, Math.max(10, getPrefs().refreshMinutes)) * 60_000;
}

function schedule(delay: number) {
  const state = g.__newsScheduler!;
  if (state.timer) clearTimeout(state.timer);
  setNextRunAt(Date.now() + delay);
  state.timer = setTimeout(tick, delay);
  state.timer.unref?.();
}

async function tick() {
  setNextRunAt(null);
  try {
    const result = await runRefresh("schedule");
    if (result.status !== "skipped") {
      console.log(
        `[scheduler] refresh ${result.status}: ${result.newArticles} new, ${result.summarized} summarized, ` +
          `${result.sourcesOk} ok / ${result.sourcesFailed} failed in ${result.durationMs} ms`,
      );
    }
  } catch (err) {
    console.error("[scheduler] refresh error", err);
  } finally {
    schedule(intervalMs());
  }
}

export function startScheduler() {
  if (config.schedulerDisabled) {
    console.log("[scheduler] disabled via DISABLE_SCHEDULER");
    return;
  }
  g.__newsScheduler ??= { timer: null, started: false };
  if (g.__newsScheduler.started) return;
  g.__newsScheduler.started = true;
  // First refresh shortly after boot, then on the configured interval.
  schedule(5_000);
  console.log(`[scheduler] started; refreshing every ${intervalMs() / 60_000} minutes`);
}

/** Re-arm the timer after the interval setting changes. */
export function rescheduleAfterSettingsChange() {
  if (g.__newsScheduler?.started) schedule(intervalMs());
}
