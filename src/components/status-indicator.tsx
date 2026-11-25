"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { requestRefresh } from "@/lib/client/actions";
import { IS_STATIC } from "@/lib/client/mode";
import { useNow, useUi } from "./providers";
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
        setNote(t("status.staticNote"));
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

/** Sidebar card: last successful update, source health and a manual refresh button. */
export function StatusCard({ rail = false }: { rail?: boolean }) {
  const { t, lang } = useUi();
  const now = useNow(30_000);
  const { refresh, running, note, status } = useRefresh();
  const failing = status?.sources.failing ?? 0;
  const dot = !status ? "bg-subtle" : running ? "bg-accent animate-pulse" : failing > 0 ? "bg-caution" : status.lastSuccessAt ? "bg-ok" : "bg-subtle";
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
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
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
    <div className="card px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0 flex-1 leading-tight" aria-live="polite" title={exact}>
          <p className="text-xs text-muted">{t("status.lastUpdated")}</p>
          <p className="truncate text-sm font-medium text-fg">{running ? t("status.updating") : (relative ?? t("status.never"))}</p>
        </div>
        {button}
      </div>
      {failing > 0 && !running && <p className="mt-2 text-xs leading-5 text-caution">{t("status.failing", { n: failing })}</p>}
      {note && <p className="mt-2 text-xs leading-5 text-muted">{note}</p>}
    </div>
  );
}
