import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryView } from "@/components/category-view";
import { ListSkeleton } from "@/components/states";
import { PRIORITY_IDS } from "@/lib/shared/taxonomy";

// One editorial page per priority category, prerendered for the static web edition.
export const dynamicParams = false;

export function generateStaticParams() {
  return PRIORITY_IDS.map((id) => ({ id }));
}

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PRIORITY_IDS.includes(id)) notFound();
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CategoryView id={id} />
    </Suspense>
  );
}
