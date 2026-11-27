"use client";

import { ArrowUpRight, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { formatDateTime, formatLongDate, formatRelative, formatTime } from "@/lib/shared/format";
import { isRadarLive } from "@/lib/shared/schedule";
import type { Lang, RadarItem, RadarResponse, RadarType } from "@/lib/shared/types";
import { MoreLink, SectionHeader } from "./editorial";
import { PlatformLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { EmptyState, ErrorState, PageHeader } from "./states";
import { useUpdateParams } from "./story-feed";

/** One colour per item type, used only for the timeline dot and the small type label. */
const TYPE_COLORS: Record<RadarType, string> = {
  release: "#8b72ff",
  update: "#56d6a0",
  research: "#65a6ff",
  repository: "#9298a8",
};
const TYPES: RadarType[] = ["release", "update", "research", "repository"];

/** `panel`: only what the dashboard panel shows (in the web edition, from the small home file). */
export function useRadar(panel = false) {
  return useSWR<RadarResponse>(panel ? "/api/radar?panel=1" : "/api/radar", { refreshInterval: 5 * 60_000 });
}

export function RadarTypeBadge({ type }: { type: RadarType }) {
  const { t } = useUi();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-subtle">
      <span className="size-1.5 rounded-full" style={{ background: TYPE_COLORS[type] }} aria-hidden />
      {t(`radar.type.${type}`)}
    </span>
  );
}

/** "Live" only after a recent successful refresh; otherwise the honest last-refresh time. */
export function RadarLiveBadge({ lastSuccessAt }: { lastSuccessAt: string | null | undefined }) {
  const { t, lang } = useUi();
  const now = useNow(30_000);
  if (isRadarLive(lastSuccessAt, now)) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-md border border-line px-2 py-1 font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-ok"
        title={t("radar.liveHint", { time: formatRelative(lastSuccessAt!, lang, now) })}
      >
        <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden />
        {t("radar.live")}
      </span>
    );
  }
  return (
    <span className="text-xs text-subtle" title={lastSuccessAt ? formatDateTime(lastSuccessAt, lang, now) : undefined}>
      {lastSuccessAt ? t("radar.lastRefresh", { time: formatRelative(lastSuccessAt, lang, now) }) : t("radar.never")}
    </span>
  );
}

/** One timeline entry: time, a dot on the line, platform and type, title, details. */
function RadarEntry({ item, showSummary, timeMode }: { item: RadarItem; showSummary: boolean; timeMode: "clock" | "relative" }) {
  const { t, lang } = useUi();
  const now = useNow();
  const when = item.publishedAt;
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
      <div className="pt-0.5 text-end font-mono text-xs tabular-nums text-subtle">
        {when ? (
          <time dateTime={when} title={formatDateTime(when, lang, now)}>
            {timeMode === "clock" ? formatTime(when, lang) : shortAge(when, now, lang)}
          </time>
        ) : (
          <span title={t("card.noPubDate")}>—</span>
        )}
      </div>
      <div className="relative border-s border-line pb-7 ps-5">
        <span className="absolute -start-[5px] top-1.5 size-[9px] rounded-full ring-4 ring-bg" style={{ background: TYPE_COLORS[item.type] }} aria-hidden />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2">
            <PlatformLogo sourceId={item.sourceId} platform={item.platform} size={20} />
            <span className="font-mono text-xs text-muted" lang="en" dir="ltr">
              {item.platform}
            </span>
          </span>
          <RadarTypeBadge type={item.type} />
          {item.version && (
            <span className="rounded border border-line px-1.5 font-mono text-[11.5px] leading-5 text-fg" lang="en" dir="ltr">
              {item.version}
            </span>
          )}
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer" lang="en" dir="ltr" className="group mt-1.5 flex items-start gap-1.5 text-[15px] font-medium leading-snug text-fg">
          <span className="headline-link">{item.title}</span>
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </a>
        {showSummary && item.summary && (
          <p lang="en" dir="ltr" className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
            {item.summary}
          </p>
        )}
        {item.type === "repository" && (item.stars != null || item.language) && (
          <p className="mt-1.5 flex items-center gap-3 font-mono text-xs text-subtle">
            {item.stars != null && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3" aria-hidden />
                {t("radar.stars", { n: item.stars })}
              </span>
            )}
            {item.language && <span lang="en">{item.language}</span>}
          </p>
        )}
      </div>
    </li>
  );
}

/** Radar items as a compact timeline (weekly report). */
export function RadarTimeline({ items }: { items: RadarItem[] }) {
  return (
    <ol className="[&>li:last-child>div:last-child]:pb-0">
      {items.map((item) => (
        <RadarEntry key={item.id} item={item} showSummary={false} timeMode="relative" />
      ))}
    </ol>
  );
}

/** Compact age for the time column ("3h", "2d"; "3 س" in Arabic). */
function shortAge(iso: string, now: number, lang: Lang): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const [n, unit] = mins < 60 ? [Math.max(1, mins), lang === "ar" ? "د" : "m"] : mins < 2880 ? [Math.round(mins / 60), lang === "ar" ? "س" : "h"] : [Math.round(mins / 1440), lang === "ar" ? "ي" : "d"];
  return lang === "ar" ? `${n} ${unit}` : `${n}${unit}`;
}

/** The freshest item of each type first, then the newest of the rest. */
function panelPicks(items: RadarItem[], n: number): RadarItem[] {
  const out: RadarItem[] = [];
  for (const type of TYPES) {
    const first = items.find((i) => i.type === type);
    if (first) out.push(first);
  }
  for (const i of items) if (out.length < n && !out.includes(i)) out.push(i);
  const time = (i: RadarItem) => Date.parse(i.publishedAt ?? i.fetchedAt);
  return out.slice(0, n).sort((a, b) => time(b) - time(a));
}

function TypeLegend({ counts }: { counts?: Record<string, number> }) {
  const { t } = useUi();
  return (
    <ul className="space-y-2.5">
      {TYPES.map((ty) => (
        <li key={ty} className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-2 text-muted">
            <span className="size-2 rounded-full" style={{ background: TYPE_COLORS[ty] }} aria-hidden />
            {t(`radar.type.${ty}`)}
          </span>
          {counts && <span className="font-mono text-xs tabular-nums text-subtle">{counts[ty] ?? 0}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Home page: the latest activity across the tracked data platforms, as a timeline. */
export function RadarPanel() {
  const { t } = useUi();
  const { data, error } = useRadar(true);
  const picks = data ? panelPicks(data.items, 6) : [];
  return (
    <section aria-labelledby="radar-title">
      <SectionHeader
        id="radar-title"
        size="lg"
        eyebrow={t("radar.eyebrow")}
        title={t("radar.title")}
        hint={t("radar.subtitle")}
        action={
          <span className="flex items-center gap-3">
            {data && <RadarLiveBadge lastSuccessAt={data.lastSuccessAt} />}
            <MoreLink href="/radar">{t("radar.openAll")}</MoreLink>
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        {error ? (
          <p className="text-sm text-muted">{t("list.error")}</p>
        ) : !data ? (
          <div className="space-y-6" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <p className="text-sm text-muted">{t("radar.empty")}</p>
        ) : (
          <ol className="[&>li:last-child>div:last-child]:pb-0">
            {picks.map((item) => (
              <RadarEntry key={item.id} item={item} showSummary={false} timeMode="relative" />
            ))}
          </ol>
        )}
        <div className="border-t border-line pt-4 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
          <p className="mb-3 text-sm text-muted">{t("radar.tracking")}</p>
          <TypeLegend />
        </div>
      </div>
    </section>
  );
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function RadarView() {
  const { t, lang } = useUi();
  const now = useNow(60_000);
  const sp = useSearchParams();
  const update = useUpdateParams();
  const { data, error, mutate } = useRadar();
  const [limit, setLimit] = useState(40);
  const type = (TYPES as string[]).includes(sp.get("type") ?? "") ? (sp.get("type") as RadarType) : null;
  const platform = sp.get("platform");

  const items = data?.items ?? [];
  const platforms = [...new Set(items.map((i) => i.platform))].sort((a, b) => a.localeCompare(b));
  const inPlatform = items.filter((i) => !platform || i.platform === platform);
  const filtered = inPlatform.filter((i) => !type || i.type === type);
  const counts = Object.fromEntries(TYPES.map((ty) => [ty, inPlatform.filter((i) => i.type === ty).length]));

  // Group the visible items by day of publication (items without a date go last).
  const shown = filtered.slice(0, limit);
  const groups: { key: string; label: string; items: RadarItem[] }[] = [];
  const today = dayKey(new Date(now).toISOString());
  const yesterday = dayKey(new Date(now - 86_400_000).toISOString());
  for (const item of shown) {
    const key = item.publishedAt ? dayKey(item.publishedAt) : "undated";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const label = key === "undated" ? t("radar.undated") : key === today ? t("radar.today") : key === yesterday ? t("radar.yesterday") : formatLongDate(new Date(item.publishedAt!), lang);
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  const pill = (on: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors ${on ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`;

  return (
    <>
      <PageHeader eyebrow={t("radar.eyebrow")} title={t("radar.title")} subtitle={t("radar.subtitle")} actions={data ? <RadarLiveBadge lastSuccessAt={data.lastSuccessAt} /> : undefined} />
      {error ? (
        <ErrorState onRetry={() => mutate()} />
      ) : !data ? (
        <div className="space-y-6" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-8 flex flex-wrap items-center gap-3">
              <div role="toolbar" aria-label={t("radar.filterType")} className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
                {[null, ...TYPES].map((ty) => (
                  <button key={ty ?? "all"} type="button" aria-pressed={type === ty} onClick={() => update({ type: ty })} className={pill(type === ty)}>
                    {ty && <span className="size-1.5 rounded-full" style={{ background: TYPE_COLORS[ty] }} aria-hidden />}
                    {ty ? t(`radar.type.${ty}`) : t("radar.all")}
                    <span className="font-mono text-xs tabular-nums text-subtle">{ty ? counts[ty] : inPlatform.length}</span>
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                <span className="sr-only sm:not-sr-only">{t("radar.platform")}</span>
                <select
                  value={platform ?? ""}
                  onChange={(e) => update({ platform: e.target.value || null })}
                  className="h-11 rounded-lg border border-line bg-surface px-3 text-sm text-fg hover:border-line-strong"
                >
                  <option value="">{t("radar.allPlatforms")}</option>
                  {platforms.map((p) => (
                    <option key={p} value={p} lang="en">
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {lang === "ar" && <p className="-mt-4 mb-6 text-sm text-subtle">{t("radar.englishNote")}</p>}

            {filtered.length === 0 ? (
              <EmptyState title={items.length ? t("radar.emptyType") : t("radar.empty")} />
            ) : (
              <div className="space-y-8">
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <h2 className="eyebrow mb-4 ps-[4.75rem] sm:ps-[5.5rem]">{g.label}</h2>
                    <ol className="[&>li:last-child>div:last-child]:pb-2">
                      {g.items.map((item) => (
                        <RadarEntry key={item.id} item={item} showSummary timeMode={g.key === "undated" ? "relative" : "clock"} />
                      ))}
                    </ol>
                  </section>
                ))}
                {filtered.length > limit && (
                  <div className="ps-[4.75rem] sm:ps-[5.5rem]">
                    <button type="button" onClick={() => setLimit(limit + 40)} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
                      {t("list.loadMore")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start" aria-labelledby="radar-sources-title">
            <div>
              <p className="eyebrow mb-3">{t("radar.legend")}</p>
              <TypeLegend counts={counts} />
            </div>
            <div className="border-t border-line pt-5">
              <h2 id="radar-sources-title" className="text-[15px] font-semibold text-fg">
                {t("radar.sources")}
              </h2>
              <p className="mb-4 mt-1 text-[13px] leading-relaxed text-subtle">{t("radar.sourcesHint")}</p>
              <ul className="space-y-0.5">
                {data.sources.map((s) => {
                  const ok = s.lastStatus === "ok" || s.lastStatus === "not-modified";
                  const state = ok ? t("sources.ok") : s.lastStatus === "error" ? t("sources.error") : s.lastStatus === "blocked" ? t("sources.blocked") : t("sources.pending");
                  const dot = ok ? "bg-ok" : s.lastStatus === "error" ? "bg-caution" : s.lastStatus === "blocked" ? "bg-breaking" : "bg-subtle";
                  return (
                    <li key={s.id}>
                      <a
                        href={s.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface"
                        title={s.lastError ?? (s.lastSuccessAt ? t("sources.lastSuccess", { time: formatRelative(s.lastSuccessAt, lang, now) }) : state)}
                      >
                        <PlatformLogo sourceId={s.id} platform={s.platform} size={24} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg" lang="en">
                            {s.platform}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {state}
                            {s.lastSuccessAt && <> · {formatRelative(s.lastSuccessAt, lang, now)}</>}
                          </span>
                        </span>
                        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
