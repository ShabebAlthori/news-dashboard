import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard-view";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="skeleton h-[392px] rounded-2xl" aria-busy="true" />}>
      <DashboardView />
    </Suspense>
  );
}
