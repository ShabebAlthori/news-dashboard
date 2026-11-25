import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportView } from "@/components/report-view";
import { ListSkeleton } from "@/components/states";

export const metadata: Metadata = { title: "Weekly Tech Report · TechPulse" };

export default function ReportPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ReportView />
    </Suspense>
  );
}
