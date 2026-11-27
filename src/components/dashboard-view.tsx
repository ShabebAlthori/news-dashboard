"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatLongDate } from "@/lib/shared/format";
import { CATEGORY_ABOUT, categoryLabel, companyById, shortCategoryLabel } from "@/lib/shared/taxonomy";
import type { BriefingFacts, CompanyPulse, DashboardResponse, Prefs, Story } from "@/lib/shared/types";
import { categoryHref } from "./app-shell";
import { EditorialFeed, HeadlineList, LeadStory, MoreLink, SecondaryStory, SectionHeader, StackStory } from "./editorial";
import { CompanyLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { RadarPanel } from "./radar-view";
import { ReportPanel } from "./report-view";
import { EmptyState, ErrorState, NewStoriesBanner } from "./states";
import { StocksCard, useStocks } from "./stocks";
import { useUpdateParams } from "./story-feed";
import { storyHeadline } from "./story-text";
import { useHasNewer, useStatus } from "./use-data";

/** Heading of a rail section (briefing, Company Watch). */
function RailHeader({ id, title, hint, action }: { id: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-fg">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-subtle">{hint}</p>}
      </div>
      {action && <div className="-mt-2.5 shrink-0">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Briefing — the day in a few headlines, and counted facts (never written by AI).

function Takeaway({ facts }: { facts: BriefingFacts }) {
  const { t, lang } = useUi();
  const parts = [t("briefing.factStories", { n: facts.stories, h: facts.windowHours })];
  if (facts.topCategory) parts.push(t("briefing.factCategory", { name: shortCategoryLabel(facts.topCategory.id)?.[lang] ?? facts.topCategory.id, n: facts.topCategory.count }));
  if (facts.topCompany) parts.push(t("briefing.factCompany", { name: companyById(facts.topCompany.id)?.[lang] ?? facts.topCompany.id, n: facts.topCompany.count }));
  return (
    <p className="mt-5 border-s-2 border-accent ps-3 text-sm leading-relaxed text-muted">
      <span className="font-medium text-fg">{t("briefing.takeaway")}: </span>
      {parts.join(lang === "ar" ? "، " : "; ")}.
    </p>
  );
}

function DailyBriefing({ stories, facts }: { stories: Story[]; facts: BriefingFacts }) {
  const { t } = useUi();
  return (
    <section aria-labelledby="briefing-title" className="border-t border-line pt-4">
      <RailHeader id="briefing-title" title={t("briefing.title")} hint={t("briefing.subtitle")} action={<MoreLink href="/latest?sort=importance&range=24h">{t("dash.seeAll")}</MoreLink>} />
      {stories.length === 0 ? <p className="text-sm text-muted">{t("briefing.empty")}</p> : <HeadlineList stories={stories} numbered />}
      <Takeaway facts={facts} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Company Watch — what the tracked companies announced (news activity, never market data).

function CompanyWatch({ companies }: { companies: CompanyPulse[] }) {
  const { t, lang } = useUi();
  const active = companies.filter((c) => c.count > 0).slice(0, 7);
  const rest = companies.filter((c) => !active.includes(c));
  return (
    <section aria-labelledby="watch-title" className="border-t border-line pt-4">
      <RailHeader id="watch-title" title={t("watch.title")} hint={t("watch.hint")} action={<MoreLink href="/companies">{t("dash.seeAll")}</MoreLink>} />
      {active.length === 0 ? (
        <p className="text-sm text-muted">{t("trending.quiet")}</p>
      ) : (
        <ul className="rule-list">
          {active.map((c) => {
            const company = companyById(c.companyId);
            const h = c.top ? storyHeadline(c.top, lang) : null;
            return (
              <li key={c.companyId}>
                <Link href={`/companies?co=${c.companyId}`} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface">
                  <CompanyLogo id={c.companyId} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-fg">{company?.[lang] ?? c.companyId}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-subtle">{t("trending.count", { n: c.count })}</span>
                    </span>
                    {h && (
                      <span lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted group-hover:text-fg">
                        {h.text}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
          {rest.map((c) => {
            const name = companyById(c.companyId)?.[lang] ?? c.companyId;
            const label = `${name}: ${t("trending.count", { n: c.count })}`;
            return (
              <li key={c.companyId}>
                <Link href={`/companies?co=${c.companyId}`} title={label} aria-label={label} className="block rounded-lg p-1.5 opacity-70 transition-opacity hover:opacity-100">
                  <CompanyLogo id={c.companyId} size={32} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Category sections: the reader's first priority as a spotlight, the others as text columns.

function CategorySpotlight({ categoryId, count, stories }: { categoryId: string; count: number; stories: Story[] }) {
  const { t, lang } = useUi();
  const label = categoryLabel(categoryId);
  if (!stories.length) return null;
  return (
    <section aria-labelledby="spotlight-title">
      <SectionHeader
        id="spotlight-title"
        size="lg"
        eyebrow={t("home.topPriority")}
        title={label?.[lang] ?? categoryId}
        hint={CATEGORY_ABOUT[categoryId]?.[lang]}
        action={<MoreLink href={categoryHref(categoryId)}>{t("home.openCategory", { n: count })}</MoreLink>}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-10">
        <StackStory story={stories[0]} />
        {stories.length > 1 && <HeadlineList stories={stories.slice(1)} />}
      </div>
    </section>
  );
}

function CategoryColumns({ groups }: { groups: DashboardResponse["byCategory"] }) {
  const { t, lang } = useUi();
  return (
    <section aria-labelledby="cats-title">
      <SectionHeader id="cats-title" title={t("dash.categories")} hint={t("dash.categoriesHint")} action={<MoreLink href="/settings#categories">{t("home.reorder")}</MoreLink>} />
      <ol className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((c) => (
          <li key={c.categoryId}>
            <Link href={categoryHref(c.categoryId)} className="group mb-3 flex min-h-11 items-baseline justify-between gap-2">
              <h3 className="font-semibold text-fg group-hover:text-accent">{categoryLabel(c.categoryId)?.[lang] ?? c.categoryId}</h3>
              <span className="shrink-0 font-mono text-xs tabular-nums text-subtle">{c.count}</span>
            </Link>
            {c.stories.length ? <HeadlineList stories={c.stories} /> : <p className="text-sm text-subtle">{t("dash.categoryEmpty")}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ListColumn({ id, title, hint, stories }: { id: string; title: string; hint?: string; stories: Story[] }) {
  if (!stories.length) return null;
  return (
    <section aria-labelledby={id} className="border-t border-line pt-4">
      <RailHeader id={id} title={title} hint={hint} />
      <HeadlineList stories={stories} />
    </section>
  );
}

// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-12" aria-busy="true">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-10">
        <div>
          <div className="skeleton aspect-[16/9] w-full rounded-lg sm:aspect-[2/1] lg:aspect-[16/9]" />
          <div className="skeleton mt-5 h-3 w-24" />
          <div className="skeleton mt-3 h-9 w-11/12" />
          <div className="skeleton mt-2 h-9 w-3/4" />
          <div className="skeleton mt-4 h-4 w-full" />
        </div>
        <div className="space-y-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3" />
              </div>
              <div className="skeleton size-20 rounded-lg sm:size-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const { t, lang } = useUi();
  const now = useNow();
  const sp = useSearchParams();
  const update = useUpdateParams();
  const category = sp.get("cat");
  const key = category ? `/api/dashboard?category=${encodeURIComponent(category)}` : "/api/dashboard";
  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>(key, { refreshInterval: 0 });
  const { data: status } = useStatus();
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const newer = useHasNewer(data?.generatedAt);
  // Started together with the dashboard data, so the Stocks box is usually ready when the page renders.
  useStocks();

  const header = (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 className="sr-only">
        {t("app.name")} — {t("dash.title")}
      </h1>
      <p className="eyebrow">{formatLongDate(new Date(now), lang)}</p>
      <p className="text-[13px] text-subtle">{t("home.edition")}</p>
    </div>
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    );
  }

  const empty = !data.top.length && !data.latest.length;
  const label = category ? (shortCategoryLabel(category)?.[lang] ?? category) : null;
  const latest = [...data.latest, ...(data.latestMore ?? [])];
  const [first, ...otherCategories] = data.byCategory;

  return (
    <div>
      {header}
      {newer && <NewStoriesBanner onShow={() => mutate()} />}
      {label && (
        <p className="-mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {t("dash.filtered", { name: label })}
          <Link href={categoryHref(category!)} className="font-medium text-accent hover:underline">
            {t("home.openCategoryPage")}
          </Link>
          <button type="button" onClick={() => update({ cat: null })} className="font-medium text-accent hover:underline">
            {t("dash.showAll")}
          </button>
        </p>
      )}

      {empty ? (
        <EmptyState title={status && !status.lastSuccessAt ? t("list.firstRun") : t("list.empty")} hint={category ? t("list.emptyHint") : undefined} />
      ) : (
        <div className="space-y-16">
          {/* Lead package: one lead story, the next most important beside it. */}
          {data.top.length > 0 && (
            <section aria-labelledby="lead-title" className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-10">
              <h2 id="lead-title" className="sr-only">
                {t("hero.label")}
              </h2>
              <LeadStory story={data.top[0]} />
              {data.top.length > 1 && (
                <div className="border-t border-line pt-5 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
                  <p className="eyebrow mb-4">{t("lead.more")}</p>
                  <div className="rule-list">
                    {data.top.slice(1, 5).map((s) => (
                      <SecondaryStory key={s.id} story={s} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Latest (editorial feed) with the briefing, Company Watch and Stocks in a rail.
              Phones read: briefing, latest, then the rest of the rail. */}
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="lg:col-start-2 lg:row-start-1">
              <DailyBriefing stories={data.briefing} facts={data.briefingFacts} />
            </div>
            <section aria-labelledby="latest-title" className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <SectionHeader
                id="latest-title"
                title={t("latest.title")}
                hint={t("latest.hint")}
                action={<MoreLink href={category ? `/latest?cat=${category}` : "/latest"}>{t("dash.seeAll")}</MoreLink>}
              />
              {latest.length ? <EditorialFeed stories={latest} showImages={prefs?.showImages ?? true} /> : <EmptyState title={t("list.empty")} />}
            </section>
            <div className="space-y-10 lg:col-start-2 lg:row-start-2">
              <CompanyWatch companies={data.trending} />
              <StocksCard />
            </div>
          </div>

          <RadarPanel />

          {!category && first && <CategorySpotlight categoryId={first.categoryId} count={first.count} stories={first.stories} />}
          {!category && otherCategories.length > 0 && <CategoryColumns groups={otherCategories} />}

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-3">
            <ReportPanel />
            <ListColumn id="announce-title" title={t("dash.announcements")} hint={t("dash.announcementsHint")} stories={data.announcements} />
            <ListColumn id="missed-title" title={t("dash.missed")} hint={t("dash.missedHint")} stories={data.missed} />
          </div>
        </div>
      )}
    </div>
  );
}
