"use client";

import { useUi } from "./providers";
import { PageHeader } from "./states";
import { StoryFeed } from "./story-feed";

export function SavedView() {
  const { t } = useUi();
  return (
    <>
      <PageHeader title={t("page.saved.title")} />
      <StoryFeed savedOnly section="all" defaultSort="newest" defaultRange="all" showCompanyFilter emptyTitle={t("saved.empty")} emptyHint={t("saved.emptyHint")} />
    </>
  );
}
