import { Suspense } from "react";
import { FeedPage } from "@/components/feed-page";
import { ListSkeleton } from "@/components/states";

export default function GamingPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FeedPage
        titleKey="page.gaming.title"
        subtitleKey="page.gaming.subtitle"
        feed={{ section: "gaming", defaultSort: "importance", defaultRange: "3d", categorySections: ["gaming"], showCompanyFilter: true }}
      />
    </Suspense>
  );
}
