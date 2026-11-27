"use client";

import { ArrowRight, ExternalLink, Layers3, Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { isRadarLive } from "@/lib/shared/schedule";
import type { RadarItem, RadarResponse, RadarType } from "@/lib/shared/types";
import { PlatformLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { EmptyState, ErrorState, PageHeader } from "./states";
import { useUpdateParams } from "./story-feed";

const TYPE_COLORS: Record<RadarType, string> = {
  release: "#6a35f0",
  research: "#2563d9",
  update: "#0b7f52",
  repository: "#4b5372",
};
const TYPES: RadarType[] = ["release", "research", "update", "repository"];

export function useRadar() {
  return useSWR<RadarResponse>("/api/radar", { refreshInterval: 5 * 60_000 });
}

export function RadarTypeBadge({ type }: { type: RadarType }) {
  const { t } = useUi();
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: TYPE_COLORS[type] }}>
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
        className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok"
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

export function RadarItemCard({ item, showSummary = false }: { item: RadarItem; showSummary?: boolean }) {
  const { t, lang } = useUi();
  const now = useNow();
  const when = item.publishedAt ?? item.fetchedAt;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex h-full gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-4 transition-colors hover:border-line-strong hover:bg-surface-2">
      <PlatformLogo sourceId={item.sourceId} platform={item.platform} size={42} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-xs font-medium text-muted" lang="en" dir="ltr">
          {item.platform}
        </p>
        <p lang="en" dir="ltr" className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-fg group-hover:text-accent">
          {item.title}
        </p>
        {showSummary && item.summary && (
          <p lang="en" dir="ltr" className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {item.summary}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="text-xs text-subtle">
            {item.type === "repository" && item.publishedAt ? (
              t("radar.created", { time: formatRelative(item.publishedAt, lang, now) })
            ) : item.publishedAt ? (
              <time dateTime={item.publishedAt} title={formatDateTime(item.publishedAt, lang, now)}>
                {formatRelative(when, lang, now)}
              </time>
            ) : (
              t("card.noPubDate")
            )}
            {item.type === "repository" && item.stars != null && (
              <span className="ms-2 inline-flex items-center gap-1">
                <Star className="size-3" aria-hidden />
                {t("radar.stars", { n: item.stars })}
              </span>
            )}
          </span>
          <RadarTypeBadge type={item.type} />
        </div>
      </div>
    </a>
  );
}

/** One release, one research paper and one update — the freshest of each. */
function panelPicks(items: RadarItem[], n: number): RadarItem[] {
  const out: RadarItem[] = [];
  for (const type of ["release", "research", "update", "repository"] as RadarType[]) {
    const first = items.find((i) => i.type === type);
    if (first) out.push(first);
  }
  for (const i of items) if (out.length < n && !out.includes(i)) out.push(i);
  return out.slice(0, n);
}

export function RadarPanel() {
  const { t } = useUi();
  const { data, error } = useRadar();
  const picks = data ? panelPicks(data.items, 3) : [];
  return (
    <section className="card p-5" aria-labelledby="radar-title">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers3 className="size-6 text-accent" aria-hidden />
        <h2 id="radar-title" className="text-lg font-bold text-fg">
          {t("radar.title")}
        </h2>
        {data && <RadarLiveBadge lastSuccessAt={data.lastSuccessAt} />}
        <Link href="/radar" className="ms-auto inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent hover:underline">
          {t("dash.seeAll")}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-muted">{t("list.error")}</p>
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[118px] rounded-2xl" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <p className="text-sm text-muted">{t("radar.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {picks.map((item) => (
            <li key={item.id}>
              <RadarItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RadarView() {
  const { t, lang } = useUi();
  const now = useNow(60_000);
  const sp = useSearchParams();
  const update = useUpdateParams();
  const { data, error, mutate } = useRadar();
  const [limit, setLimit] = useState(36);
  const type = (TYPES as string[]).includes(sp.get("type") ?? "") ? (sp.get("type") as RadarType) : null;
  const platform = sp.get("platform");

  const items = data?.items ?? [];
  const platforms = [...new Map(items.map((i) => [i.platform, i.sourceId])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const filtered = items.filter((i) => (!type || i.type === type) && (!platform || i.platform === platform));
  const counts = Object.fromEntries(TYPES.map((ty) => [ty, items.filter((i) => i.type === ty && (!platform || i.platform === platform)).length]));

  return (
    <>
      <PageHeader title={t("radar.title")} subtitle={t("radar.subtitle")} actions={data ? <RadarLiveBadge lastSuccessAt={data.lastSuccessAt} /> : undefined} />
      {error ? (
        <ErrorState onRetry={() => mutate()} />
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="toolbar" aria-label={t("filters.category")}>
            {[null, ...TYPES].map((ty) => {
              const on = type === ty;
              return (
                <button
                  key={ty ?? "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update({ type: ty })}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${on ? "brand-gradient border-transparent text-white" : "border-line bg-surface text-fg hover:bg-surface-2"}`}
                >
                  {ty ? t(`radar.type.${ty}`) : t("radar.all")}
                  <span className={`text-xs ${on ? "text-white/80" : "text-subtle"}`}>{ty ? counts[ty] : items.filter((i) => !platform || i.platform === platform).length}</span>
                </button>
              );
            })}
          </div>
          <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
              <button
                type="button"
                aria-pressed={!platform}
                onClick={() => update({ platform: null })}
                className={`rounded-full border px-3 py-1 text-xs ${!platform ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line text-muted hover:text-fg"}`}
              >
                {t("radar.all")}
              </button>
              {platforms.map(([name]) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={platform === name}
                  onClick={() => update({ platform: platform === name ? null : name })}
                  lang="en"
                  className={`rounded-full border px-3 py-1 text-xs ${platform === name ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line text-muted hover:text-fg"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          {lang === "ar" && <p className="mb-4 text-sm text-subtle">{t("radar.englishNote")}</p>}

          {filtered.length === 0 ? (
            <EmptyState title={items.length ? t("radar.emptyType") : t("radar.empty")} />
          ) : !type ? (
            // "All": one section per type, so a daily batch of papers does not bury releases.
            <div className="space-y-8">
              {(["release", "update", "research", "repository"] as RadarType[]).map((ty) => {
                const list = filtered.filter((i) => i.type === ty);
                if (!list.length) return null;
                return (
                  <section key={ty} aria-labelledby={`radar-${ty}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <RadarTypeBadge type={ty} />
                      <h2 id={`radar-${ty}`} className="sr-only">
                        {t(`radar.type.${ty}`)}
                      </h2>
                      <span className="text-sm text-subtle">{list.length}</span>
                      {list.length > 6 && (
                        <button type="button" onClick={() => update({ type: ty })} className="ms-auto inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent hover:underline">
                          {t("radar.seeType", { type: t(`radar.type.${ty}`) })}
                          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
                        </button>
                      )}
                    </div>
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {list.slice(0, 6).map((item) => (
                        <li key={item.id}>
                          <RadarItemCard item={item} showSummary />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, limit).map((item) => (
                  <li key={item.id}>
                    <RadarItemCard item={item} showSummary />
                  </li>
                ))}
              </ul>
              {filtered.length > limit && (
                <div className="pt-5 text-center">
                  <button type="button" onClick={() => setLimit(limit + 36)} className="rounded-full border border-line bg-surface px-5 py-2 text-sm font-medium text-fg hover:bg-surface-2">
                    {t("list.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-bold text-fg">{t("radar.sources")}</h2>
            <p className="mb-3 text-sm text-muted">{t("radar.sourcesHint")}</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.sources.map((s) => {
                const ok = s.lastStatus === "ok" || s.lastStatus === "not-modified";
                const state = ok ? t("sources.ok") : s.lastStatus === "error" ? t("sources.error") : s.lastStatus === "blocked" ? t("sources.blocked") : t("sources.pending");
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                    <PlatformLogo sourceId={s.id} platform={s.platform} size={32} />
                    <div className="min-w-0 flex-1">
                      <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-fg hover:text-accent" lang="en">
                        {s.platform}
                        <ExternalLink className="size-3 text-subtle rtl:-scale-x-100" aria-hidden />
                      </a>
                      <p className="truncate text-xs text-subtle" title={s.lastError ?? undefined}>
                        <span className={ok ? "text-ok" : s.lastStatus === "error" ? "text-caution" : ""}>{state}</span>
                        {s.lastSuccessAt && <> · {t("sources.lastSuccess", { time: formatRelative(s.lastSuccessAt, lang, now) })}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
