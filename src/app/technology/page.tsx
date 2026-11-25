import { Suspense } from "react";
import { FeedPage } from "@/components/feed-page";
import { ListSkeleton } from "@/components/states";

export default function TechnologyPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FeedPage
        titleKey="page.tech.title"
        subtitleKey="page.tech.subtitle"
        feed={{ section: "tech", defaultSort: "importance", defaultRange: "3d", priorityChips: true, showCompanyFilter: true }}
      />
    </Suspense>
  );
}
