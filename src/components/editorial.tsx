"use client";

// Editorial building blocks shared by the home page and the category pages. Stories sit on the
// page, separated by hairlines and whitespace; the format of each item follows its importance and
// whether it has a photo worth showing.
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { markRead } from "@/lib/client/actions";
import type { Story } from "@/lib/shared/types";
import { SourceLogo } from "./logos";
import { StoryTime } from "./news-card";
import { useUi } from "./providers";
import { storyHeadline, storySummary } from "./story-text";
import { BookmarkButton, CategoryBadge, OriginalLangTag, StoryImage, useShowImage, useStoryCategory } from "./story-visuals";

/** Section heading with an optional hint and action, over a hairline rule. */
export function SectionHeader({ id, title, hint, action, eyebrow, size = "md" }: { id?: string; title: string; hint?: string; action?: ReactNode; eyebrow?: string; size?: "md" | "lg" }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-t border-line pt-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 id={id} className={`font-semibold text-fg ${size === "lg" ? "text-2xl sm:text-[28px]" : "text-xl"}`}>
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Quiet text link with an arrow ("See all"). 44px tall hit area. */
export function MoreLink({ href, children, label }: { href: string; children: ReactNode; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="group inline-flex min-h-11 items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
      {children}
      <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-px rtl:-scale-x-100 ltr:group-hover:translate-x-px rtl:group-hover:-translate-x-px" aria-hidden />
    </Link>
  );
}

/** Category, breaking and unconfirmed labels above a headline. */
export function Kicker({ story, className = "" }: { story: Story; className?: string }) {
  const { t, lang } = useUi();
  const category = useStoryCategory(story);
  const h = storyHeadline(story, lang);
  const sum = storySummary(story, lang);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {story.breaking && <span className="text-xs font-semibold text-breaking">{t("card.breaking")}</span>}
      <CategoryBadge id={category} />
      {story.rumor && (
        <span className="text-xs font-medium text-caution" title={t("card.unconfirmedHint")}>
          {t("card.unconfirmed")}
        </span>
      )}
      <OriginalLangTag langs={[h.lang, sum?.lang]} />
    </div>
  );
}

/** Source · time · coverage, with the bookmark at the end. */
export function StoryMeta({ story, bookmark = true, className = "" }: { story: Story; bookmark?: boolean; className?: string }) {
  const { t } = useUi();
  return (
    <div className={`flex min-w-0 items-center gap-2 text-[13px] text-muted ${className}`}>
      <SourceLogo source={story.source} size={16} />
      <span className="min-w-0 truncate font-medium text-fg/90" dir="auto">
        {story.source.name}
      </span>
      {story.source.official && <BadgeCheck className="size-3.5 shrink-0 text-ok" aria-label={t("card.officialHint")} />}
      <span className="text-subtle" aria-hidden>
        ·
      </span>
      <StoryTime story={story} className="shrink-0 whitespace-nowrap" />
      {story.sourceCount > 1 && <span className="hidden shrink-0 whitespace-nowrap text-subtle sm:inline">· {t("card.sources", { n: story.sourceCount })}</span>}
      {bookmark && <BookmarkButton story={story} className="-my-2 -me-2.5 ms-auto" />}
    </div>
  );
}

function Headline({ story, className }: { story: Story; className: string }) {
  const { lang } = useUi();
  const h = storyHeadline(story, lang);
  return (
    <h3 lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className={className}>
      <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => markRead(story.leadArticleId, story.url)} className="headline-link">
        {h.text}
      </a>
    </h3>
  );
}

function Summary({ story, className }: { story: Story; className: string }) {
  const { lang } = useUi();
  const sum = storySummary(story, lang);
  if (!sum) return null;
  return (
    <p lang={sum.lang} dir={sum.lang === "ar" ? "rtl" : "ltr"} className={`${className} ${sum.lang === "ar" ? "leading-[1.85]" : "leading-relaxed"}`}>
      {sum.text}
    </p>
  );
}

/** Publisher photo linked to the story (decorative: the headline carries the link text). */
function Photo({ story, className, eager = false }: { story: Story; className: string; eager?: boolean }) {
  const category = useStoryCategory(story);
  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      aria-hidden
      onClick={() => markRead(story.leadArticleId, story.url)}
      className={`block overflow-hidden rounded-lg bg-surface-2 ${className}`}
    >
      <StoryImage story={story} category={category} eager={eager} className="zoom-img size-full" />
    </a>
  );
}

/** The lead story: large photo, display headline, summary and a clear "Read article" action. */
export function LeadStory({ story }: { story: Story }) {
  const { t } = useUi();
  const photo = useShowImage(story);
  return (
    <article className="group">
      {photo && <Photo story={story} eager className="mb-5 aspect-[16/9] w-full sm:aspect-[2/1] lg:aspect-[16/9]" />}
      <Kicker story={story} className="mb-3" />
      <Headline
        story={story}
        className={`font-semibold leading-[1.12] tracking-[-0.025em] text-fg ${photo ? "text-[clamp(1.6rem,3.4vw,2.6rem)]" : "text-[clamp(1.9rem,4.4vw,3.25rem)]"}`}
      />
      <Summary story={story} className="mt-3 line-clamp-4 max-w-[62ch] text-[16.5px] text-muted sm:line-clamp-5 sm:text-[17px]" />
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markRead(story.leadArticleId, story.url)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-fg px-4 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          {t("hero.readArticle")}
          <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </a>
        <StoryMeta story={story} className="min-w-[16rem] flex-1" />
      </div>
    </article>
  );
}

/** Secondary lead: headline first, small photo at the end. */
export function SecondaryStory({ story }: { story: Story }) {
  const photo = useShowImage(story);
  return (
    <article className="group flex gap-4 py-4 first:pt-0">
      <div className="min-w-0 flex-1">
        <Kicker story={story} className="mb-1.5" />
        <Headline story={story} className="text-[17px] font-semibold leading-snug text-fg" />
        <StoryMeta story={story} className="mt-2" />
      </div>
      {photo && <Photo story={story} className="mt-1 aspect-square w-20 shrink-0 self-start sm:w-24" />}
    </article>
  );
}

/** Vertical story: photo on top (when there is one), headline, summary. */
export function StackStory({ story }: { story: Story }) {
  const photo = useShowImage(story);
  return (
    <article className="group">
      {photo && <Photo story={story} className="mb-4 aspect-[16/9] w-full" />}
      <Kicker story={story} className="mb-2" />
      <Headline story={story} className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-fg sm:text-2xl" />
      <Summary story={story} className="mt-2.5 line-clamp-3 text-[15px] text-muted" />
      <StoryMeta story={story} className="mt-4" />
    </article>
  );
}

export type FeedFormat = "feature" | "row" | "compact";

/**
 * Format for each item of an editorial feed: the most important stories with a photo get the
 * large format (at most `maxFeatures`), other stories with a photo a row with a thumbnail, and
 * stories without one stay text-only.
 */
export function feedFormats(stories: Story[], showImages: boolean, maxFeatures = 2): FeedFormat[] {
  let features = 0;
  const formats = stories.map((s): FeedFormat => {
    const image = showImages && !!s.imageUrl;
    if (image && (s.tier === "major" || s.breaking) && features < maxFeatures) {
      features++;
      return "feature";
    }
    return image && s.tier !== "minor" ? "row" : "compact";
  });
  // No major story: the first story with a photo leads the feed, so the rhythm is never flat.
  if (features === 0) {
    const first = formats.indexOf("row");
    if (first !== -1 && first < 3) formats[first] = "feature";
  }
  return formats;
}

/** One item of an editorial feed, in the given format. */
export function FeedItem({ story, format }: { story: Story; format: FeedFormat }) {
  if (format === "feature") {
    return (
      <article className="group grid grid-cols-1 gap-5 py-6 first:pt-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-7">
        <Photo story={story} className="aspect-[16/9] w-full md:aspect-[4/3]" />
        <div className="min-w-0 self-center">
          <Kicker story={story} className="mb-2" />
          <Headline story={story} className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-fg sm:text-[26px]" />
          <Summary story={story} className="mt-2.5 line-clamp-4 text-[15px] text-muted" />
          <StoryMeta story={story} className="mt-4" />
        </div>
      </article>
    );
  }
  if (format === "row") {
    return (
      <article className="group flex gap-5 py-5 first:pt-0">
        <div className="min-w-0 flex-1">
          <Kicker story={story} className="mb-1.5" />
          <Headline story={story} className="text-[18px] font-semibold leading-snug text-fg sm:text-[19px]" />
          <Summary story={story} className="mt-1.5 line-clamp-2 text-[15px] text-muted max-sm:hidden" />
          <StoryMeta story={story} className="mt-3" />
        </div>
        <Photo story={story} className="mt-1 aspect-[4/3] w-24 shrink-0 self-start sm:w-40 lg:w-44" />
      </article>
    );
  }
  return (
    <article className="py-5 first:pt-0">
      <Kicker story={story} className="mb-1.5" />
      <Headline story={story} className="text-[17px] font-semibold leading-snug text-fg" />
      <Summary story={story} className="mt-1.5 line-clamp-2 text-[15px] text-muted" />
      <StoryMeta story={story} className="mt-3" />
    </article>
  );
}

/** A feed of stories in mixed editorial formats. */
export function EditorialFeed({ stories, showImages }: { stories: Story[]; showImages: boolean }) {
  const formats = feedFormats(stories, showImages);
  return (
    <div className="rule-list">
      {stories.map((s, i) => (
        <FeedItem key={s.id} story={s} format={formats[i]} />
      ))}
    </div>
  );
}

/** Numbered headline list (briefing, category columns). */
export function HeadlineList({ stories, numbered = false }: { stories: Story[]; numbered?: boolean }) {
  const { lang } = useUi();
  return (
    <ol className="rule-list">
      {stories.map((s, i) => {
        const h = storyHeadline(s, lang);
        return (
          <li key={s.id} className="flex gap-3 py-3 first:pt-0">
            {numbered && (
              <span className="w-5 shrink-0 pt-0.5 font-mono text-[13px] tabular-nums text-subtle" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
            )}
            <div className="min-w-0">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => markRead(s.leadArticleId, s.url)}
                lang={h.lang}
                dir={h.lang === "ar" ? "rtl" : "ltr"}
                className="headline-link line-clamp-3 text-[15px] font-medium leading-snug text-fg"
              >
                {h.text}
              </a>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle">
                <OriginalLangTag langs={[h.lang]} />
                <span dir="auto">{s.source.name}</span>
                <span aria-hidden>·</span>
                <StoryTime story={s} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
