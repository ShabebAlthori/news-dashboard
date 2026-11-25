"use client";

import { BadgeCheck } from "lucide-react";
import { markRead } from "@/lib/client/actions";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import type { Story } from "@/lib/shared/types";
import { SourceLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { storyHeadline, storySummary } from "./story-text";
import { BookmarkButton, CategoryBadge, StoryImage, useStoryCategory } from "./story-visuals";

export function StoryTime({ story, className = "", compact = false }: { story: Story; className?: string; compact?: boolean }) {
  const { t, lang } = useUi();
  const now = useNow();
  if (!story.publishedAt) {
    return (
      <span className={`text-subtle ${className}`} title={`${t("card.noPubDate")} · ${t("card.retrieved", { time: formatDateTime(story.fetchedAt, lang, now) })}`}>
        {compact ? t("card.noPubDateShort") : t("card.noPubDate")}
      </span>
    );
  }
  return (
    <time dateTime={story.publishedAt} title={`${t("card.published", { time: formatDateTime(story.publishedAt, lang, now) })} · ${t("card.retrieved", { time: formatDateTime(story.fetchedAt, lang, now) })}`} className={className}>
      {formatRelative(story.publishedAt, lang, now)}
    </time>
  );
}

/** Image card for the Latest News grid. */
export function NewsCard({ story }: { story: Story }) {
  const { t, lang } = useUi();
  const category = useStoryCategory(story);
  const h = storyHeadline(story, lang);
  const sum = storySummary(story, lang);
  const open = () => markRead(story.leadArticleId, story.url);

  return (
    <article className={`card card-hover group flex min-w-0 flex-col overflow-hidden ${story.read ? "opacity-90" : ""}`}>
      <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={open} tabIndex={-1} aria-hidden className="relative block aspect-[16/9] overflow-hidden bg-surface-2">
        <StoryImage story={story} category={category} className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute bottom-3 start-3 flex flex-wrap gap-1.5">
          <CategoryBadge id={category} />
          {story.breaking && <span className="rounded-full bg-breaking px-2.5 py-0.5 text-xs font-semibold text-white">{t("card.breaking")}</span>}
        </span>
      </a>
      <div className="flex flex-1 flex-col p-4">
        <h3 lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="text-[16px] font-bold leading-snug text-fg">
          <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={open} className="line-clamp-2 decoration-accent/60 decoration-2 underline-offset-4 hover:underline">
            {h.text}
          </a>
        </h3>
        {sum && (
          <p lang={sum.lang} dir={sum.lang === "ar" ? "rtl" : "ltr"} className={`mt-1.5 line-clamp-3 text-sm text-muted ${sum.lang === "ar" ? "leading-7" : "leading-relaxed"}`}>
            {sum.text}
          </p>
        )}
        {story.rumor && <p className="mt-2 text-xs font-medium text-caution">{t("card.unconfirmed")}</p>}
        <div className="mt-auto flex items-center gap-2 pt-3 text-[13px] text-muted">
          <SourceLogo source={story.source} />
          <span className="min-w-0 truncate font-medium text-fg" dir="auto">
            {story.source.name}
          </span>
          {story.source.official && <BadgeCheck className="size-3.5 shrink-0 text-ok" aria-label={t("card.officialHint")} />}
          <span aria-hidden>·</span>
          <StoryTime story={story} compact className="shrink-0 whitespace-nowrap" />
          {story.sourceCount > 1 && <span className="hidden shrink-0 whitespace-nowrap text-subtle sm:inline">· {t("card.sources", { n: story.sourceCount })}</span>}
          <BookmarkButton story={story} className="-me-2 ms-auto" />
        </div>
      </div>
    </article>
  );
}

/** Compact headline row used in side lists. */
export function StoryLine({ story, showSource = true }: { story: Story; showSource?: boolean }) {
  const { lang, t } = useUi();
  const h = storyHeadline(story, lang);
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => markRead(story.leadArticleId, story.url)}
        lang={h.lang}
        dir={h.lang === "ar" ? "rtl" : "ltr"}
        className="line-clamp-2 block text-[15px] font-medium leading-snug text-fg transition-colors hover:text-accent"
      >
        {h.text}
      </a>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        {showSource && <span dir="auto">{story.source.name}</span>}
        {showSource && <span aria-hidden>·</span>}
        <StoryTime story={story} compact />
        {story.sourceCount > 1 && <span>· {t("card.sources", { n: story.sourceCount })}</span>}
        {story.tier === "major" && <span className="font-semibold text-accent">· {t("importance.major")}</span>}
      </p>
    </li>
  );
}
