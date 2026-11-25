import { Suspense } from "react";
import { FeedPage } from "@/components/feed-page";
import { ListSkeleton } from "@/components/states";

export default function LatestPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FeedPage
        titleKey="page.latest.title"
        subtitleKey="page.latest.subtitle"
        feed={{ section: "all", defaultSort: "newest", defaultRange: "3d", priorityChips: true, showCompanyFilter: true }}
      />
    </Suspense>
  );
}
