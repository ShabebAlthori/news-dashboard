import { Suspense } from "react";
import { SearchView } from "@/components/search-view";
import { ListSkeleton } from "@/components/states";

export default function SearchPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchView />
    </Suspense>
  );
}
