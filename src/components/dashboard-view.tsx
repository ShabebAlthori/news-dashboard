"use client";

import { ArrowRight, BadgeCheck, Building2, ChevronLeft, ChevronRight, Clock, Lightbulb, Newspaper, Pause, Play, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import { markRead } from "@/lib/client/actions";
import { formatLongDate, formatRelative } from "@/lib/shared/format";
import { categoryLabel, companyById, shortCategoryLabel } from "@/lib/shared/taxonomy";
import type { BriefingFacts, CompanyPulse, DashboardResponse, Story } from "@/lib/shared/types";
import { CategoryChips } from "./category-chips";
import { IconBubble, PanelTitle, ViewAll } from "./panel";
import { CompanyLogo, SourceLogo } from "./logos";
import { NewsCard, StoryLine, StoryTime } from "./news-card";
import { useNow, useUi } from "./providers";
import { RadarPanel } from "./radar-view";
import { ReportPanel } from "./report-view";
import { EmptyState, ErrorState, NewStoriesBanner } from "./states";
import { StocksCard, useStocks } from "./stocks";
import { useUpdateParams } from "./story-feed";
import { storyHeadline, storySummary } from "./story-text";
import { BookmarkButton, CategoryBadge, OriginalLangTag, StoryImage, useStoryCategory } from "./story-visuals";
import { useHasNewer, useStatus } from "./use-data";

// ---------------------------------------------------------------------------
// A. Featured carousel

function HeroSlide({ story, active, eager }: { story: Story; active: boolean; eager: boolean }) {
  const { t, lang } = useUi();
  const category = useStoryCategory(story);
  const h = storyHeadline(story, lang);
  const sum = storySummary(story, lang);
  return (
    // All slides share one grid cell, so the carousel is as tall as its longest headline and never jumps.
    <div
      className={`relative flex min-h-[420px] transition-[opacity,visibility] duration-500 [grid-area:1/1] sm:min-h-[400px] lg:min-h-[392px] ${active ? "visible opacity-100" : "invisible opacity-0"}`}
      aria-hidden={!active}
      inert={!active}
      role="group"
      aria-roledescription="slide"
    >
      <StoryImage story={story} category={category} eager={eager} className="absolute inset-0 size-full" />
      {/* Legibility: dark gradient from the text side, and from the bottom on small screens. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#070914] via-[#070914]/75 to-[#070914]/10 md:bg-gradient-to-r md:from-[#070914] md:via-[#070914]/80 md:to-transparent md:rtl:bg-gradient-to-l" />
      <div className="relative flex w-full flex-col justify-end p-5 pb-20 sm:p-7 sm:pb-20 md:max-w-[72%] md:justify-center md:pb-16 lg:p-8 lg:pb-16 2xl:max-w-[62%]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#20d98a] px-3 py-1 text-xs font-bold text-[#052016]">
            <Star className="size-3.5 fill-current" aria-hidden />
            {t("hero.topStory")}
          </span>
          <CategoryBadge id={category} />
          {story.breaking && <span className="rounded-full bg-breaking px-2.5 py-0.5 text-xs font-semibold text-white">{t("card.breaking")}</span>}
          <OriginalLangTag langs={[h.lang, sum?.lang]} tone="onImage" />
          {story.rumor && (
            <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-semibold text-[#f3b75c]" title={t("card.unconfirmedHint")}>
              {t("card.unconfirmed")}
            </span>
          )}
        </div>
        {/* The full headline on phones (type scales with the screen); long ones are clamped only on wide layouts. */}
        <h3
          lang={h.lang}
          dir={h.lang === "ar" ? "rtl" : "ltr"}
          className={`font-bold leading-tight text-white ${h.text.length > 90 ? "text-[clamp(1.15rem,5vw,1.5rem)] md:text-2xl lg:text-[28px]" : "text-[clamp(1.3rem,5.6vw,1.75rem)] md:text-[28px] lg:text-[32px]"}`}
        >
          <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => markRead(story.leadArticleId, story.url)} className="hover:underline hover:decoration-white/50 hover:underline-offset-4 md:line-clamp-4">
            {h.text}
          </a>
        </h3>
        {sum && (
          <p lang={sum.lang} dir={sum.lang === "ar" ? "rtl" : "ltr"} className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-white/80 sm:text-base">
            {sum.text}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/75">
          <span className="inline-flex items-center gap-2 font-medium text-white">
            <SourceLogo source={story.source} size={18} />
            <span dir="auto">{story.source.name}</span>
            {story.source.official && <BadgeCheck className="size-4 text-[#20d98a]" aria-label={t("card.officialHint")} />}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden />
            <StoryTime story={story} />
          </span>
          {story.sourceCount > 1 && <span>{t("card.sources", { n: story.sourceCount })}</span>}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <a
            href={story.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => markRead(story.leadArticleId, story.url)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            {t("hero.readMore")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </a>
          <BookmarkButton story={story} tone="onImage" />
        </div>
      </div>
    </div>
  );
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function HeroCarousel({ stories }: { stories: Story[] }) {
  const { t } = useUi();
  const [index, setIndex] = useState(0);
  // Hover/focus pause the rotation for a moment; the button pauses it until pressed again.
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const touch = useRef<number | null>(null);
  const n = stories.length;
  const current = n ? Math.min(index, n - 1) : 0;
  const go = (i: number) => setIndex(((i % n) + n) % n);
  const rotating = n > 1 && !reducedMotion && !userPaused && !hovered;

  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % n), 9000);
    return () => clearInterval(id);
  }, [n, rotating]);

  if (!n) return null;
  const control = "relative inline-flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75";
  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("hero.label")}
      className="card relative grid overflow-hidden border-line"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) < 40) return;
        const forward = document.documentElement.dir === "rtl" ? dx > 0 : dx < 0;
        go(current + (forward ? 1 : -1));
      }}
    >
      <h2 className="sr-only">{t("hero.label")}</h2>
      {/* Screen readers hear slide changes only when the reader caused them. */}
      <div className="grid" aria-live={rotating ? "off" : "polite"}>
        {stories.map((s, i) => (
          <HeroSlide key={s.id} story={s} active={i === current} eager={i === 0} />
        ))}
      </div>
      {n > 1 && (
        <div className="absolute bottom-4 end-4 z-10 flex items-center gap-1.5">
          {!reducedMotion && (
            <button type="button" onClick={() => setUserPaused(!userPaused)} aria-label={userPaused ? t("hero.play") : t("hero.pause")} title={userPaused ? t("hero.play") : t("hero.pause")} className={control}>
              {userPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            </button>
          )}
          <span dir="ltr" className="rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-semibold tabular-nums text-white backdrop-blur">
            <span className="sr-only">{t("hero.position", { i: current + 1, n })}</span>
            <span aria-hidden>
              {current + 1} / {n}
            </span>
          </span>
          <button type="button" onClick={() => go(current - 1)} aria-label={t("hero.prev")} className={control}>
            <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          <button type="button" onClick={() => go(current + 1)} aria-label={t("hero.next")} className={control}>
            <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      )}
      {n > 1 && (
        <div className="absolute bottom-[34px] start-5 z-10 hidden gap-1.5 md:flex lg:start-8">
          {stories.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={t("hero.goto", { i: i + 1 })}
              aria-current={i === current}
              // A small dot with a 44px touch area around it.
              className={`relative h-1.5 rounded-full transition-all after:absolute after:-inset-x-1.5 after:-inset-y-5 after:content-[''] ${i === current ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// B. Daily Briefing

function Takeaway({ facts }: { facts: BriefingFacts }) {
  const { t, lang } = useUi();
  const parts = [t("briefing.factStories", { n: facts.stories, h: facts.windowHours })];
  if (facts.topCategory) parts.push(t("briefing.factCategory", { name: shortCategoryLabel(facts.topCategory.id)?.[lang] ?? facts.topCategory.id, n: facts.topCategory.count }));
  if (facts.topCompany) parts.push(t("briefing.factCompany", { name: companyById(facts.topCompany.id)?.[lang] ?? facts.topCompany.id, n: facts.topCompany.count }));
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-accent/25 bg-accent-soft/70 p-3.5">
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
      <p className="text-sm leading-relaxed text-fg">
        <span className="font-semibold">{t("briefing.takeaway")}: </span>
        {parts.join(lang === "ar" ? "، " : "; ")}
        {lang === "ar" ? "." : "."}
      </p>
    </div>
  );
}

function DailyBriefing({ stories, facts }: { stories: Story[]; facts: BriefingFacts }) {
  const { t, lang } = useUi();
  const now = useNow();
  return (
    <section className="card flex h-full flex-col p-5" aria-labelledby="briefing-title">
      <PanelTitle
        id="briefing-title"
        icon={
          <IconBubble>
            <Sparkles className="size-[18px]" aria-hidden />
          </IconBubble>
        }
        title={t("briefing.title")}
        hint={t("briefing.subtitle")}
        action={<ViewAll href="/latest?sort=importance&range=24h" />}
      />
      {stories.length === 0 ? (
        <p className="text-sm text-muted">{t("briefing.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {stories.map((s) => {
            const h = storyHeadline(s, lang);
            return (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markRead(s.leadArticleId, s.url)}
                  className="group flex items-start gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-brand ring-4 ring-accent-soft" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="line-clamp-2 text-[15px] font-medium leading-snug text-fg group-hover:text-accent">
                      {h.text}
                    </span>
                    <OriginalLangTag langs={[h.lang]} className="mt-1" />
                  </span>
                  <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-subtle">
                    {s.publishedAt ? formatRelative(s.publishedAt, lang, now) : t("card.retrievedAgo", { time: formatRelative(s.fetchedAt, lang, now) })}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto">
        <Takeaway facts={facts} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// D. Trending Companies — news activity only, never market data.

function TrendingCompanies({ companies }: { companies: CompanyPulse[] }) {
  const { t, lang } = useUi();
  const active = companies.filter((c) => c.count > 0).slice(0, 6);
  const rest = companies.filter((c) => !active.includes(c));
  return (
    <section className="card flex flex-1 flex-col p-5" aria-labelledby="trending-title">
      <PanelTitle
        id="trending-title"
        icon={
          <IconBubble>
            <Building2 className="size-[18px]" aria-hidden />
          </IconBubble>
        }
        title={t("trending.title")}
        hint={t("trending.hint")}
        action={<ViewAll href="/companies" />}
      />
      {active.length === 0 ? (
        <p className="text-sm text-muted">{t("trending.quiet")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {active.map((c) => {
            const company = companyById(c.companyId);
            const h = c.top ? storyHeadline(c.top, lang) : null;
            return (
              <li key={c.companyId}>
                <Link href={`/companies?co=${c.companyId}`} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2">
                  <CompanyLogo id={c.companyId} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{company?.[lang] ?? c.companyId}</span>
                    {h && (
                      <span lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="block truncate text-xs text-muted">
                        {h.text}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">{t("trending.count", { n: c.count })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rest.length > 0 && (
        <div className="mt-auto pt-4">
          <ul className="flex flex-wrap gap-2">
            {rest.map((c) => {
              const name = companyById(c.companyId)?.[lang] ?? c.companyId;
              const label = `${name}: ${t("trending.count", { n: c.count })}`;
              return (
                <li key={c.companyId}>
                  <Link href={`/companies?co=${c.companyId}`} title={label} aria-label={label} className="block rounded-[28%] p-1.5 opacity-75 transition-opacity hover:opacity-100">
                    <CompanyLogo id={c.companyId} size={32} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="skeleton h-[392px] rounded-2xl" />
        <div className="skeleton h-[392px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton aspect-[16/9] rounded-none" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-4/5" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function ListPanel({ title, hint, stories, action }: { title: string; hint?: string; stories: Story[]; action?: ReactNode }) {
  if (!stories.length) return null;
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-bold text-fg">{title}</h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <ul className="divide-y divide-line">
        {stories.map((s) => (
          <StoryLine key={s.id} story={s} />
        ))}
      </ul>
    </section>
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
  const newer = useHasNewer(data?.generatedAt);
  // Started together with the dashboard data, so the Stocks box is usually ready when the page renders.
  useStocks();

  const chips = <CategoryChips value={category} onChange={(id) => update({ cat: id })} />;
  const header = (
    <div className="mb-5 space-y-4">
      <h1 className="sr-only">
        {t("app.name")} — {t("dash.title")}
      </h1>
      <p className="text-sm text-muted">{formatLongDate(new Date(now), lang)}</p>
      {chips}
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

  return (
    <div>
      {header}
      {newer && <NewStoriesBanner onShow={() => mutate()} />}
      {label && (
        <p className="-mt-1 mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("dash.filtered", { name: label })}
          <button type="button" onClick={() => update({ cat: null })} className="font-medium text-accent hover:underline">
            {t("dash.showAll")}
          </button>
        </p>
      )}

      {empty ? (
        <EmptyState title={status && !status.lastSuccessAt ? t("list.firstRun") : t("list.empty")} hint={category ? t("list.emptyHint") : undefined} />
      ) : (
        <div className="space-y-5">
          {/* Row 1: featured story + daily briefing (≈70/30) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <HeroCarousel stories={data.top} />
            <DailyBriefing stories={data.briefing} facts={data.briefingFacts} />
          </div>

          {/* Row 2: latest news + trending companies */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <section aria-labelledby="latest-title">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                  <IconBubble>
                    <Newspaper className="size-[18px]" aria-hidden />
                  </IconBubble>
                  <div>
                    <h2 id="latest-title" className="text-lg font-bold text-fg">
                      {t("latest.title")}
                    </h2>
                    <p className="text-sm text-muted">{t("latest.hint")}</p>
                  </div>
                </div>
                <ViewAll href={category ? `/latest?cat=${category}` : "/latest"} />
              </div>
              {data.latest.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {data.latest.map((s) => (
                    <NewsCard key={s.id} story={s} />
                  ))}
                  {data.latest.length === 6 &&
                    data.latestMore?.length === 3 &&
                    data.latestMore.map((s) => <NewsCard key={s.id} story={s} className="hidden xl:flex" />)}
                </div>
              ) : (
                <EmptyState title={t("list.empty")} />
              )}
            </section>
            {/* Right column: Trending Companies, then Stocks (after it on mobile) */}
            <div className="flex flex-col gap-5">
              <TrendingCompanies companies={data.trending} />
              <StocksCard />
            </div>
          </div>

          {/* Row 3: Data Radar + Weekly Tech Report */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <RadarPanel />
            <ReportPanel />
          </div>

          {/* Your priority categories, in your order */}
          {!category && data.byCategory.length > 0 && (
            <section className="pt-3" aria-labelledby="cats-title">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="cats-title" className="text-lg font-bold text-fg">
                    {t("dash.categories")}
                  </h2>
                  <p className="text-sm text-muted">{t("dash.categoriesHint")}</p>
                </div>
                <ViewAll href="/settings#categories" label={t("nav.settings")} />
              </div>
              <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.byCategory.map((c, i) => {
                  const full = categoryLabel(c.categoryId);
                  return (
                    <li key={c.categoryId} className="card flex flex-col p-4">
                      <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <button type="button" onClick={() => update({ cat: c.categoryId })} className="-my-2 min-h-11 text-start font-semibold text-fg hover:text-accent">
                          <span className="me-1.5 text-xs font-semibold tabular-nums text-accent">{i + 1}</span>
                          {full?.[lang] ?? c.categoryId}
                        </button>
                        <span className="shrink-0 text-xs text-subtle">{c.count ? t("list.results", { n: c.count }) : ""}</span>
                      </div>
                      {c.stories.length ? (
                        <ul className="divide-y divide-line">
                          {c.stories.map((s) => (
                            <StoryLine key={s.id} story={s} />
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-subtle">{t("dash.categoryEmpty")}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ListPanel title={t("dash.announcements")} hint={t("dash.announcementsHint")} stories={data.announcements} />
            <ListPanel title={t("dash.missed")} hint={t("dash.missedHint")} stories={data.missed} />
            <ListPanel title={t("dash.tech")} stories={data.tech} action={<ViewAll href="/technology?range=24h" />} />
            <ListPanel title={t("dash.gaming")} stories={data.gaming} action={<ViewAll href="/gaming?range=24h" />} />
          </div>
        </div>
      )}
    </div>
  );
}
