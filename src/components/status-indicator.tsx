"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { requestRefresh } from "@/lib/client/actions";
import { IS_STATIC } from "@/lib/client/mode";
import { dataFreshness, formatAge, type Freshness } from "@/lib/shared/freshness";
import { useNow, useUi } from "./providers";
import { Popover } from "./top-bar";
import { useStatus } from "./use-data";

/** Manual refresh: starts a server refresh (or, in the web edition, reloads the latest published data). */
export function useRefresh() {
  const { t } = useUi();
  const { data } = useStatus();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const outcome = await requestRefresh();
      if (outcome === "checked") {
        // Web edition: feeds refresh on a schedule; reload whatever was published since.
        await mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });
        setNote(t("status.staticNote", { n: data?.intervalMinutes ?? 15 }));
        return;
      }
      setNote(outcome === "too-soon" ? t("status.tooSoon") : t("status.started"));
      await mutate("/api/status");
      // Poll until the run finishes, then refresh every list on screen.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await fetch("/api/status").then((r) => r.json());
        await mutate("/api/status", s, { revalidate: false });
        if (!s.running) break;
      }
      await mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  return { refresh, running: !!data?.running || busy, note, status: data };
}

/** green: under 2× the update interval · amber: 2×–6× (or failing sources) · red: older. */
export function freshnessDot(fresh: Freshness, failing = 0): string {
  if (fresh.level === "stale") return "bg-breaking";
  if (fresh.level === "aging") return "bg-caution";
  if (fresh.level === "unknown") return "bg-subtle";
  return failing > 0 ? "bg-caution" : "bg-ok";
}

/** Visible notice when the data is older than it should be (amber and red states). */
/** The older of the last update and the data actually on screen (see StatusResponse.displayedAt). */
function shownSince(data: { lastSuccessAt: string | null; displayedAt?: string | null } | undefined): string | null {
  if (!data) return null;
  if (data.displayedAt && (!data.lastSuccessAt || data.displayedAt < data.lastSuccessAt)) return data.displayedAt;
  return data.lastSuccessAt;
}

export function StaleNotice() {
  const { t, lang } = useUi();
  const now = useNow(60_000);
  const { data } = useStatus();
  const fresh = dataFreshness(shownSince(data), data?.intervalMinutes, now);
  if (!data || fresh.ageMs == null || (fresh.level !== "aging" && fresh.level !== "stale")) return null;
  const red = fresh.level === "stale";
  return (
    <div
      role="status"
      className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${red ? "border-breaking/35 bg-breaking-soft text-fg" : "border-caution/35 bg-caution-soft text-fg"}`}
    >
      <Clock className={`mt-0.5 size-4 shrink-0 ${red ? "text-breaking" : "text-caution"}`} aria-hidden />
      <p>
        <strong className={red ? "text-breaking" : "text-caution"}>{t("stale.title", { age: formatAge(fresh.ageMs, lang) })}</strong>{" "}
        <span className="text-muted">{IS_STATIC ? t("stale.hintStatic") : t("stale.hintServer")}</span>
      </p>
    </div>
  );
}

/** Sidebar card: last successful update, source health and a manual refresh button. */
export function StatusCard({ rail = false }: { rail?: boolean }) {
  const { t, lang } = useUi();
  const now = useNow(30_000);
  const { refresh, running, note, status } = useRefresh();
  const failing = status?.sources.failing ?? 0;
  const fresh = dataFreshness(shownSince(status), status?.intervalMinutes, now);
  const dot = !status ? "bg-subtle" : running ? "bg-accent animate-pulse" : freshnessDot(fresh, failing);
  const relative = status?.lastSuccessAt ? formatRelative(status.lastSuccessAt, lang, now) : null;
  const exact = status?.lastSuccessAt ? t("status.lastUpdateAt", { time: formatDateTime(status.lastSuccessAt, lang, now) }) : t("status.never");
  const label = IS_STATIC ? t("status.checkUpdates") : t("status.refreshNow");

  const button = (
    <button
      type="button"
      onClick={refresh}
      disabled={running}
      aria-label={label}
      title={label}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
    >
      <RefreshCw className={`size-[18px] ${running ? "animate-spin" : ""}`} aria-hidden />
    </button>
  );

  if (rail) {
    return (
      <div className="flex flex-col items-center gap-1" title={exact}>
        <span className={`size-2.5 rounded-full ${dot}`} aria-hidden />
        <span className="sr-only" aria-live="polite">
          {running ? t("status.updating") : exact}
        </span>
        {button}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0 flex-1 leading-tight" aria-live="polite" title={exact}>
          <p className="text-xs text-muted">{t("status.lastUpdated")}</p>
          <p className="truncate text-sm font-medium text-fg">{running ? t("status.updating") : (relative ?? t("status.never"))}</p>
        </div>
        {button}
      </div>
      {!running && fresh.ageMs != null && (fresh.level === "aging" || fresh.level === "stale") && (
        <p className={`mt-2 text-[13px] font-medium leading-5 ${fresh.level === "stale" ? "text-breaking" : "text-caution"}`}>
          {t("stale.short", { age: formatAge(fresh.ageMs, lang) })}
        </p>
      )}
      {failing > 0 && !running && <p className="mt-2 text-xs leading-5 text-caution">{t("status.failing", { n: failing })}</p>}
      {note && <p className="mt-2 text-xs leading-5 text-muted">{note}</p>}
    </div>
  );
}

/** Header status: a coloured dot and the last update time; opens the full status panel. */
export function StatusPill() {
  const { t, lang } = useUi();
  const now = useNow(30_000);
  const { data: status } = useStatus();
  const fresh = dataFreshness(shownSince(status), status?.intervalMinutes, now);
  const dot = !status ? "bg-subtle" : status.running ? "bg-accent animate-pulse" : freshnessDot(fresh, status.sources.failing);
  const short = status?.lastSuccessAt ? formatRelative(status.lastSuccessAt, lang, now) : t("status.never");
  return (
    <Popover
      label={`${t("status.lastUpdated")}: ${short}`}
      width="w-[300px]"
      triggerClassName="gap-2 px-2.5 text-[13px] text-muted hover:text-fg"
      trigger={
        <>
          <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span className="max-w-[9rem] truncate" aria-hidden>
            {short}
          </span>
        </>
      }
    >
      {() => <StatusCard />}
    </Popover>
  );
}
