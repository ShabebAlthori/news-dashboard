"use client";

import { formatDateTime, formatRelative } from "@/lib/shared/format";
import type { Story } from "@/lib/shared/types";
import { useNow, useUi } from "./providers";

export function StoryTime({ story, className = "" }: { story: Story; className?: string }) {
  const { t, lang } = useUi();
  const now = useNow();
  if (!story.publishedAt) {
    // The source gave no publication time: say when we retrieved it, and explain on hover.
    return (
      <time dateTime={story.fetchedAt} className={`text-subtle ${className}`} title={`${t("card.noPubDate")} · ${t("card.retrieved", { time: formatDateTime(story.fetchedAt, lang, now) })}`}>
        {t("card.retrievedAgo", { time: formatRelative(story.fetchedAt, lang, now) })}
      </time>
    );
  }
  return (
    <time dateTime={story.publishedAt} title={`${t("card.published", { time: formatDateTime(story.publishedAt, lang, now) })} · ${t("card.retrieved", { time: formatDateTime(story.fetchedAt, lang, now) })}`} className={className}>
      {formatRelative(story.publishedAt, lang, now)}
    </time>
  );
}
