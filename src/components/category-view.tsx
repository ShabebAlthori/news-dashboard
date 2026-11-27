"use client";

import useSWR from "swr";
import { CATEGORY_ABOUT, categoryLabel, PRIORITY_IDS } from "@/lib/shared/taxonomy";
import type { DashboardResponse, Prefs } from "@/lib/shared/types";
import { LeadStory, MoreLink, SecondaryStory } from "./editorial";
import { useUi } from "./providers";
import { RadarPanel } from "./radar-view";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "./states";
import { StoryFeed } from "./story-feed";
import { categoryTint } from "./story-visuals";

/** A category's own front page: its lead stories, then every story in the category. */
export function CategoryView({ id }: { id: string }) {
  const { t, lang } = useUi();
  const { data, error, mutate } = useSWR<DashboardResponse>(`/api/dashboard?category=${encodeURIComponent(id)}`, { refreshInterval: 0 });
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const label = categoryLabel(id)?.[lang] ?? id;
  const order = prefs?.categoryOrder?.length ? prefs.categoryOrder : PRIORITY_IDS;
  const rank = order.indexOf(id) + 1;
  const count = data?.byCategory.find((c) => c.categoryId === id)?.count;
  const lead = data?.top.slice(0, 4) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={rank > 0 ? t("category.rank", { n: rank }) : t("nav.categories")}
        title={label}
        subtitle={CATEGORY_ABOUT[id]?.[lang]}
        icon={<span className="hidden h-14 w-1 shrink-0 rounded-full sm:block" style={{ background: categoryTint(id).mark }} aria-hidden />}
        actions={
          <span className="flex items-center gap-4">
            {count != null && <span className="font-mono text-xs tabular-nums text-subtle">{t("category.count", { n: count })}</span>}
            <MoreLink href="/settings#categories">{t("home.reorder")}</MoreLink>
          </span>
        }
      />

      {error ? (
        <ErrorState onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : lead.length === 0 ? (
        <EmptyState title={t("dash.categoryEmpty")} hint={t("category.emptyHint")} />
      ) : (
        <section aria-labelledby="category-lead" className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <h2 id="category-lead" className="sr-only">
            {t("category.top", { name: label })}
          </h2>
          <LeadStory story={lead[0]} />
          {lead.length > 1 && (
            <div className="border-t border-line pt-5 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
              <p className="eyebrow mb-4">{t("lead.more")}</p>
              <div className="rule-list">
                {lead.slice(1).map((s) => (
                  <SecondaryStory key={s.id} story={s} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {id === "data" && (
        <div className="mt-16">
          <RadarPanel />
        </div>
      )}

      <section aria-labelledby="category-all" className="mt-16">
        <div className="mb-6 border-t border-line pt-4">
          <h2 id="category-all" className="text-xl font-semibold text-fg">
            {t("category.all", { name: label })}
          </h2>
        </div>
        <StoryFeed category={id} section="all" defaultSort="newest" defaultRange="7d" excludeIds={lead.map((s) => s.id)} />
      </section>
    </>
  );
}
