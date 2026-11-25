import { Suspense } from "react";
import { CompaniesView } from "@/components/companies-view";
import { ListSkeleton } from "@/components/states";

export default function CompaniesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CompaniesView />
    </Suspense>
  );
}
