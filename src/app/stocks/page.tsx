import { Suspense } from "react";
import { ListSkeleton } from "@/components/states";
import { StocksView } from "@/components/stocks";

export default function StocksPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <StocksView />
    </Suspense>
  );
}
