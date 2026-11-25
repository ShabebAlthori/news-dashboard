"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { useNow, useUi } from "./providers";
import { useStatus } from "./use-data";

export function StatusIndicator({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useUi();
  const now = useNow(30_000);
  const { data } = useStatus();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = data?.running || busy;
  const failing = data?.sources.failing ?? 0;
  const dot = !data ? "bg-subtle" : running ? "bg-accent" : failing > 0 ? "bg-caution" : data.lastSuccessAt ? "bg-ok" : "bg-subtle";
  const updated = data?.lastSuccessAt ? t("status.updated", { time: formatRelative(data.lastSuccessAt, lang, now) }) : t("status.never");

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (res.status === 429) setNote(t("status.tooSoon"));
      else setNote(t("status.started"));
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

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <div className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <span className={`inline-block size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span title={data?.lastSuccessAt ? t("status.lastUpdateAt", { time: formatDateTime(data.lastSuccessAt, lang, now) }) : undefined}>
          {running ? t("status.updating") : updated}
        </span>
      </div>
      {!compact && failing > 0 && !running && <p className="text-xs leading-5 text-caution">{t("status.failing", { n: failing })}</p>}
      {!compact && (
        <button
          type="button"
          onClick={refresh}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} aria-hidden />
          {t("status.refreshNow")}
        </button>
      )}
      {!compact && note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
