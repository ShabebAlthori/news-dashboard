import { Suspense } from "react";
import { SavedView } from "@/components/saved-view";
import { ListSkeleton } from "@/components/states";

export default function SavedPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SavedView />
    </Suspense>
  );
}
