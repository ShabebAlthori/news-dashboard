"use client";

import { RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { RANGE_KEYS, rangeToBounds, type RangeKey } from "@/lib/shared/format";
import { categoriesFor, COMPANIES, type Section } from "@/lib/shared/taxonomy";
import type { Prefs, StoriesResponse } from "@/lib/shared/types";
import { useNow, useUi } from "./providers";
import { StoryCard } from "./story-card";
import { EmptyState, ErrorState, ListSkeleton, NewStoriesBanner } from "./states";
import { useStatus } from "./use-data";


export interface FeedConfig {
  section?: Section | "all";
  defaultSort?: "importance" | "newest";
  defaultRange?: RangeKey;
  categorySections?: Section[];
  showCompanyFilter?: boolean;
  savedOnly?: boolean;
  company?: string;
  requireQuery?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

const PAGE_SIZE = 20;

function useFeedParams(cfg: FeedConfig) {
  const sp = useSearchParams();
  const range = (RANGE_KEYS as string[]).includes(sp.get("range") ?? "") ? (sp.get("range") as RangeKey) : (cfg.defaultRange ?? "3d");
  return {
    category: sp.get("cat") ?? "",
    company: cfg.company ?? sp.get("co") ?? "",
    range,
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    sort: (sp.get("sort") === "newest" || sp.get("sort") === "importance" ? sp.get("sort") : (cfg.defaultSort ?? "importance")) as "importance" | "newest",
    group: sp.get("group") !== "0",
    q: sp.get("q") ?? "",
  };
}

export function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );
}

function selectClass() {
  return "h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-fg hover:border-line-strong";
}

export function StoryFeed(cfg: FeedConfig) {
  const { t, lang } = useUi();
  const p = useFeedParams(cfg);
  const update = useUpdateParams();
  const { data: status } = useStatus();
  const { data: prefs } = useSWR<Prefs>("/api/settings");

  // Round "now" so the request key is stable between renders (re-evaluated every 5 minutes).
  const now = useNow(300_000);
  const anchor = Math.floor(now / 300_000) * 300_000;
  const bounds = useMemo(() => rangeToBounds(p.range, p.from, p.to, anchor), [p.range, p.from, p.to, anchor]);

  const baseQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (cfg.section && cfg.section !== "all") q.set("section", cfg.section);
    if (p.category) q.set("category", p.category);
    if (p.company) q.set("company", p.company);
    if (bounds.from != null) q.set("from", String(bounds.from));
    if (bounds.to != null) q.set("to", String(bounds.to));
    if (p.q) q.set("q", p.q);
    if (cfg.savedOnly) q.set("saved", "1");
    q.set("sort", p.sort);
    if (!p.group) q.set("group", "0");
    q.set("limit", String(PAGE_SIZE));
    return q.toString();
  }, [cfg.section, cfg.savedOnly, p.category, p.company, p.q, p.sort, p.group, bounds]);

  const disabled = cfg.requireQuery && !p.q.trim();
  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<StoriesResponse>(
    (index, prev: StoriesResponse | null) => {
      if (disabled) return null;
      if (index === 0) return `/api/stories?${baseQuery}`;
      if (!prev || prev.nextCursor == null) return null;
      return `/api/stories?${baseQuery}&cursor=${prev.nextCursor}`;
    },
    { revalidateFirstPage: true, revalidateOnFocus: true },
  );

  const stories = data?.flatMap((d) => d.stories) ?? [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = data ? data[data.length - 1]?.nextCursor != null : false;
  const generatedAt = data?.[0]?.generatedAt;
  const newer = !!(generatedAt && status?.lastSuccessAt && new Date(status.lastSuccessAt).getTime() > new Date(generatedAt).getTime() + 1000);

  const categories = (cfg.categorySections ?? []).flatMap((s) => categoriesFor(s));
  const followed = new Set(prefs?.followedCompanies ?? []);
  const companyOptions = [...COMPANIES].sort((a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id)) || a.en.localeCompare(b.en));
  const filtered = p.category || p.company !== (cfg.company ?? "") || p.range !== (cfg.defaultRange ?? "3d") || p.sort !== (cfg.defaultSort ?? "importance") || !p.group;

  return (
    <section>
      {/* Filters */}
      <div className="mb-5 space-y-3">
        {categories.length > 0 && (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="toolbar" aria-label={t("filters.category")}>
            <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
              <button
                type="button"
                onClick={() => update({ cat: null })}
                aria-pressed={!p.category}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${!p.category ? "border-fg bg-fg text-bg" : "border-line text-muted hover:text-fg"}`}
              >
                {t("filters.allCategories")}
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ cat: p.category === c.id ? null : c.id })}
                  aria-pressed={p.category === c.id}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${p.category === c.id ? "border-fg bg-fg text-bg" : "border-line text-muted hover:text-fg"}`}
                >
                  {c[lang]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {cfg.showCompanyFilter && (
            <label className="contents">
              <span className="sr-only">{t("filters.company")}</span>
              <select className={selectClass()} value={p.company} onChange={(e) => update({ co: e.target.value || null })}>
                <option value="">{t("filters.allCompanies")}</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c[lang]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="contents">
            <span className="sr-only">{t("filters.date")}</span>
            <select className={selectClass()} value={p.range} onChange={(e) => update({ range: e.target.value, from: null, to: null })}>
              {RANGE_KEYS.map((r) => (
                <option key={r} value={r}>
                  {t(`range.${r}`)}
                </option>
              ))}
            </select>
          </label>
          {p.range === "custom" && (
            <>
              <label className="inline-flex items-center gap-1.5 text-sm text-muted">
                {t("filters.from")}
                <input type="date" value={p.from} onChange={(e) => update({ from: e.target.value })} className={selectClass()} />
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-muted">
                {t("filters.to")}
                <input type="date" value={p.to} onChange={(e) => update({ to: e.target.value })} className={selectClass()} />
              </label>
            </>
          )}
          <label className="contents">
            <span className="sr-only">{t("filters.sort")}</span>
            <select className={selectClass()} value={p.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="importance">{t("sort.importance")}</option>
              <option value="newest">{t("sort.newest")}</option>
            </select>
          </label>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line px-2.5 text-sm text-fg" title={t("filters.groupHint")}>
            <input type="checkbox" checked={p.group} onChange={(e) => update({ group: e.target.checked ? null : "0" })} className="size-4 accent-[var(--accent)]" />
            {t("filters.group")}
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => update({ cat: null, co: null, range: null, from: null, to: null, sort: null, group: null })}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:text-fg"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {t("filters.reset")}
            </button>
          )}
          {data && <span className="ms-auto text-sm text-subtle">{t("list.results", { n: total })}</span>}
        </div>
      </div>

      {newer && <NewStoriesBanner onShow={() => mutate()} />}

      {disabled ? null : error ? (
        <ErrorState onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <ListSkeleton />
      ) : stories.length === 0 ? (
        status && !status.lastSuccessAt ? (
          <EmptyState title={t("list.firstRun")} />
        ) : (
          <EmptyState title={cfg.emptyTitle ?? t("list.empty")} hint={cfg.emptyHint ?? t("list.emptyHint")} />
        )
      ) : (
        <div className="space-y-3">
          {stories.map((s) => (
            <StoryCard key={s.id} story={s} showImage={prefs?.showImages ?? true} />
          ))}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setSize(size + 1)}
                disabled={isValidating}
                className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-60"
              >
                {isValidating ? t("common.loading") : t("list.loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
