import type { Metadata } from "next";
import { Suspense } from "react";
import { RadarView } from "@/components/radar-view";
import { ListSkeleton } from "@/components/states";

export const metadata: Metadata = { title: "Data Radar · TechPulse" };

export default function RadarPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <RadarView />
    </Suspense>
  );
}
