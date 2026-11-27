"use client";

import { Bookmark, BookmarkCheck, BadgeCheck, ChevronDown, ExternalLink, Languages, Sparkles, Quote } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { mutate } from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import useSWR from "swr";
import { companyById, EVENT_LABELS, PRIORITY_IDS, primaryCategory, SECTIONS } from "@/lib/shared/taxonomy";
import type { Lang, Prefs, Story } from "@/lib/shared/types";
import { storyHeadline, storySummary } from "./story-text";
import { useNow, useUi } from "./providers";
import { markRead, saveStory } from "@/lib/client/actions";
import { SourceLogo } from "./logos";
import { CategoryBadge, OriginalLangTag } from "./story-visuals";

const TIER_BARS = { minor: 1, standard: 2, notable: 3, major: 4 } as const;

export function ImportanceMeter({ story }: { story: Story }) {
  const { t } = useUi();
  const filled = TIER_BARS[story.tier];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted" title={`${t("importance.label")}: ${story.importance}/100`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-1 rounded-sm ${i <= filled ? "bg-accent" : "bg-line-strong"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      <span className={story.tier === "major" ? "font-semibold text-accent-strong" : ""}>
        <span className="sr-only">{t("importance.label")}: </span>
        {t(`importance.${story.tier}`)}
      </span>
    </span>
  );
}

function Chip({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: "neutral" | "breaking" | "caution" | "ok"; title?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    breaking: "bg-breaking-soft text-breaking font-semibold",
    caution: "bg-caution-soft text-caution",
    ok: "bg-ok-soft text-ok",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Breakdown({ story }: { story: Story }) {
  const { t } = useUi();
  const rows: [string, number][] = [
    [t("breakdown.significance"), story.breakdown.significance],
    [t("breakdown.coverage"), story.breakdown.coverage],
    [t("breakdown.credibility"), story.breakdown.credibility],
    [t("breakdown.impact"), story.breakdown.impact],
    [t("breakdown.relevance"), story.breakdown.relevance],
  ];
  return (
    <dl className="grid gap-1.5 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-center gap-2">
          <dt className="text-muted">{label}</dt>
          <dd className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
          </dd>
          <dd className="text-end tabular-nums text-muted">{Math.round(value * 100)}</dd>
        </div>
      ))}
      {story.breakdown.penalties > 0 && (
        <div className="flex justify-between gap-2 text-muted">
          <dt>{t("breakdown.penalties")}</dt>
          <dd className="tabular-nums">−{story.breakdown.penalties}</dd>
        </div>
      )}
      <div className="flex justify-between gap-2 border-t border-line pt-1.5 font-medium text-fg">
        <dt>{t("importance.label")}</dt>
        <dd className="tabular-nums">{story.importance}/100</dd>
      </div>
    </dl>
  );
}

export function StoryCard({
  story,
  variant = "default",
  showImage = true,
}: {
  story: Story;
  variant?: "lead" | "default" | "compact";
  showImage?: boolean;
}) {
  const { t, lang: uiLang } = useUi();
  const now = useNow();
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const [override, setOverride] = useState<{ ui: Lang; view: Lang } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [saved, setSaved] = useState(story.saved);
  const [savedFor, setSavedFor] = useState(story.saved);
  // Keep local "saved" in sync when fresh data arrives.
  if (savedFor !== story.saved) {
    setSavedFor(story.saved);
    setSaved(story.saved);
  }

  const view: Lang = override && override.ui === uiLang ? override.view : uiLang;
  const otherLang: Lang = view === "ar" ? "en" : "ar";

  const originalLang: Lang = story.lang ?? "en";
  const { text: headline, lang: headlineLang } = storyHeadline(story, view);
  const showOriginal = headline !== story.title.original;

  const summaryInfo = storySummary(story, view);
  const summary = summaryInfo?.text ?? null;
  const summaryLang: Lang = summaryInfo?.lang ?? view;
  const summaryNote = summaryInfo?.note ? t(`card.${summaryInfo.note}`) : null;
  const summaryOriginLabel =
    story.summary.origin === "ai" && (view === "en" || story.summary.ar)
      ? t("card.summaryAi")
      : summary
        ? t("card.summaryFeed")
        : t("card.noSummary");

  // The story's highest category in the reader's priority order.
  const primary = primaryCategory(story.categories, prefs?.categoryOrder ?? PRIORITY_IDS);
  const sectionLabel = SECTIONS.find((s) => story.sections.includes(s.id) && s.id !== "business") ?? SECTIONS.find((s) => story.sections.includes(s.id));
  const categoryText = primary ? undefined : sectionLabel?.[uiLang];
  const imageShown = variant !== "compact" && showImage && !!story.imageUrl && failedImage !== story.imageUrl;
  const businessEvent = ["acquisition", "earnings", "layoffs", "leadership", "partnership", "funding", "regulation", "security-incident", "outage", "delay", "pricing"].includes(story.eventType);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    const ok = await saveStory(story, next);
    if (!ok) setSaved(!next);
    await mutate((key) => typeof key === "string" && key.includes("saved=1"));
  }

  const headingClass =
    variant === "lead" ? "text-xl sm:text-2xl font-bold leading-snug" : variant === "compact" ? "text-[15px] font-semibold leading-snug" : "text-lg font-semibold leading-snug";

  return (
    <article className={`card card-hover group ${variant === "compact" ? "p-3.5" : "p-4 sm:p-5"} ${story.read ? "opacity-[0.92]" : ""}`}>
      <div
        className={
          imageShown
            ? variant === "lead"
              ? "grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]"
              : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]"
            : ""
        }
      >
        <div className="min-w-0">
          {/* Labels */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {story.breaking && (
              <Chip tone="breaking" title={t("card.breakingHint")}>
                {t("card.breaking")}
              </Chip>
            )}
            {primary && <CategoryBadge id={primary} />}
            {categoryText && <Chip>{categoryText}</Chip>}
            {businessEvent && <Chip>{EVENT_LABELS[story.eventType][uiLang]}</Chip>}
            {view === uiLang && <OriginalLangTag langs={[headlineLang, summaryInfo?.lang]} />}
            {story.rumor && (
              <Chip tone="caution" title={t("card.unconfirmedHint")}>
                {t("card.unconfirmed")}
              </Chip>
            )}
            <span className="ms-auto">
              <ImportanceMeter story={story} />
            </span>
          </div>

          {/* Headline */}
          <div lang={headlineLang} dir={headlineLang === "ar" ? "rtl" : "ltr"}>
            <h3 className={`${headingClass} text-fg`}>
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => markRead(story.leadArticleId, story.url)}
                className="decoration-accent/60 decoration-2 underline-offset-4 hover:underline"
              >
                {headline}
              </a>
            </h3>
          </div>
          {showOriginal && variant !== "compact" && (
            <p className="mt-1 text-sm text-subtle">
              <span>{t("card.originalHeadline")}: </span>
              <span lang={originalLang} dir={originalLang === "ar" ? "rtl" : "ltr"} className="bidi-isolate">
                {story.title.original}
              </span>
            </p>
          )}

          {/* Summary */}
          {variant !== "compact" && (
            <div className="mt-2.5">
              {summary ? (
                <p
                  lang={summaryLang}
                  dir={summaryLang === "ar" ? "rtl" : "ltr"}
                  className={`text-[15px] text-fg/90 ${summaryLang === "ar" ? "leading-8" : "leading-relaxed"} ${variant === "default" ? "line-clamp-5" : ""}`}
                >
                  {summary}
                </p>
              ) : (
                <p className="text-sm text-subtle">{t("card.noSummary")}</p>
              )}
              {summaryNote && <p className="mt-1.5 text-xs text-subtle">{summaryNote}</p>}
            </div>
          )}

          {/* Meta */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              <SourceLogo source={story.source} />
              <span dir="auto" className="bidi-isolate">
                {story.source.name}
              </span>
              {story.source.official && <BadgeCheck className="size-3.5 text-ok" aria-label={t("card.officialHint")} />}
            </span>
            {story.publishedAt ? (
              <time dateTime={story.publishedAt} title={formatDateTime(story.publishedAt, uiLang, now)}>
                {t("card.published", { time: formatRelative(story.publishedAt, uiLang, now) })}
                <span className="text-subtle"> · {formatDateTime(story.publishedAt, uiLang, now)}</span>
              </time>
            ) : (
              <time dateTime={story.fetchedAt} className="text-subtle" title={t("card.noPubDate")}>
                {t("card.retrievedAgo", { time: formatRelative(story.fetchedAt, uiLang, now) })}
              </time>
            )}
            {story.sourceCount > 1 && <span>{t("card.sources", { n: story.sourceCount })}</span>}
          </div>

          {story.companies.length > 0 && variant !== "compact" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {story.companies.slice(0, 4).map((id) => {
                const c = companyById(id);
                if (!c) return null;
                return (
                  <Link key={id} href={`/companies?co=${id}`} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent">
                    {c[uiLang]}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markRead(story.leadArticleId, story.url)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
            >
              <ExternalLink className="size-3.5 rtl:-scale-x-100" aria-hidden />
              {t("card.readAt", { source: story.source.name })}
            </a>
            <button
              type="button"
              onClick={toggleSave}
              aria-pressed={saved}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 ${saved ? "border-accent text-accent" : "border-line text-fg"}`}
            >
              {saved ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
              {saved ? t("card.saved") : t("card.save")}
            </button>
            {variant !== "compact" && (
              <button
                type="button"
                onClick={() => setOverride({ ui: uiLang, view: otherLang })}
                title={t("card.otherLangHint")}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
              >
                <Languages className="size-3.5" aria-hidden />
                <span lang={otherLang}>{otherLang === "ar" ? "العربية" : "English"}</span>
              </button>
            )}
          </div>

          {/* Details: other coverage + ranking explanation */}
          {variant !== "compact" && (
            <div className="mt-3 space-y-2 border-t border-line pt-2.5">
              {story.coverage.length > 0 && (
                <details className="group/cov">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-3.5 transition-transform group-open/cov:rotate-180" aria-hidden />
                    {t("card.otherCoverage", { n: story.coverage.length })}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {story.coverage.map((c) => (
                      <li key={c.articleId} className="text-sm">
                        <span className="font-medium text-fg">
                          <span dir="auto" className="bidi-isolate">
                            {c.sourceName}
                          </span>
                          {c.official && <BadgeCheck className="ms-1 inline size-3.5 text-ok" aria-label={t("card.officialHint")} />}
                        </span>
                        <span className="text-subtle"> · {c.publishedAt ? formatRelative(c.publishedAt, uiLang, now) : t("card.noPubDate")}</span>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markRead(c.articleId, c.url)}
                          lang={c.lang ?? "en"}
                          dir={c.lang === "ar" ? "rtl" : "ltr"}
                          className="mt-0.5 block text-muted hover:text-accent hover:underline"
                        >
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="group/why">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition-transform group-open/why:rotate-180" aria-hidden />
                  {t("card.why")}
                </summary>
                <div className="mt-2 max-w-md">
                  <Breakdown story={story} />
                </div>
              </details>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                <span className="inline-flex items-center gap-1">
                  {story.summary.origin === "ai" ? <Sparkles className="size-3" aria-hidden /> : <Quote className="size-3" aria-hidden />}
                  {summaryOriginLabel}
                </span>
                <span>
                  <time dateTime={story.fetchedAt}>{t("card.retrieved", { time: formatDateTime(story.fetchedAt, uiLang, now) })}</time>
                </span>
              </p>
            </div>
          )}
        </div>

        {imageShown && (
          <a
            href={story.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            aria-hidden
            onClick={() => markRead(story.leadArticleId, story.url)}
            className={`order-first block overflow-hidden rounded-xl bg-surface-2 ${variant === "lead" ? "md:order-none" : "sm:order-none sm:self-start"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- publisher-hosted thumbnails from many domains */}
            <img
              src={story.imageUrl!}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(story.imageUrl)}
              className={
                variant === "lead"
                  ? "aspect-[16/9] max-h-48 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:max-h-64 md:aspect-[16/10] md:size-full md:max-h-none"
                  : "aspect-[16/9] max-h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:aspect-[16/11] sm:max-h-none"
              }
            />
          </a>
        )}
      </div>
    </article>
  );
}
