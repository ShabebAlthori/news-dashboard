"use client";

import type { I18nKey } from "@/lib/shared/i18n";
import { useUi } from "./providers";
import { PageHeader } from "./states";
import { StoryFeed, type FeedConfig } from "./story-feed";

export function FeedPage({ titleKey, subtitleKey, feed }: { titleKey: I18nKey; subtitleKey?: I18nKey; feed: FeedConfig }) {
  const { t } = useUi();
  return (
    <>
      <PageHeader title={t(titleKey)} subtitle={subtitleKey ? t(subtitleKey) : undefined} />
      <StoryFeed {...feed} />
    </>
  );
}
