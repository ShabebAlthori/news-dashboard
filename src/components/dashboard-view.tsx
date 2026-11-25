"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { formatLongDate } from "@/lib/shared/format";
import { companyById } from "@/lib/shared/taxonomy";
import type { DashboardResponse, Prefs, Story } from "@/lib/shared/types";
import { useNow, useUi } from "./providers";
import { StoryCard } from "./story-card";
import { EmptyState, ErrorState, ListSkeleton, NewStoriesBanner, SectionTitle } from "./states";
import { useHasNewer, useStatus } from "./use-data";

function SeeAll({ href }: { href: string }) {
  const { t } = useUi();
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
      {t("dash.seeAll")}
      <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

function StoryColumn({ stories, showImages }: { stories: Story[]; showImages: boolean }) {
  const { t } = useUi();
  if (!stories.length) return <EmptyState title={t("list.empty")} />;
  return (
    <div className="space-y-3">
      {stories.map((s) => (
        <StoryCard key={s.id} story={s} showImage={showImages} />
      ))}
    </div>
  );
}

export function DashboardView() {
  const { t, lang } = useUi();
  const now = useNow();
  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>("/api/dashboard", { refreshInterval: 0 });
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const { data: status } = useStatus();
  const newer = useHasNewer(data?.generatedAt);
  const showImages = prefs?.showImages ?? true;

  const header = (
    <header className="mb-6">
      <p className="text-sm text-muted">{formatLongDate(new Date(now), lang)}</p>
      <h1 className="mt-0.5 text-2xl font-bold text-fg sm:text-[28px]">{t("dash.title")}</h1>
    </header>
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => mutate()} />
      </>
    );
  }
  if (isLoading || !data) {
    return (
      <>
        {header}
        <ListSkeleton rows={3} />
      </>
    );
  }

  const empty = !data.top.length && !data.tech.length && !data.gaming.length;
  if (empty) {
    return (
      <>
        {header}
        <EmptyState title={status && !status.lastSuccessAt ? t("list.firstRun") : t("list.empty")} />
      </>
    );
  }

  const [lead, ...restTop] = data.top;
  const pulse = data.companies.filter((c) => c.count > 0).slice(0, 12);
  const quiet = data.companies.filter((c) => c.count === 0);

  return (
    <div>
      {header}
      {newer && <NewStoriesBanner onShow={() => mutate()} />}

      {/* 1. What are the most important stories right now? */}
      <section className="mb-10">
        <SectionTitle title={t("dash.top")} hint={t("dash.topHint")} action={<SeeAll href="/latest?sort=importance&range=24h" />} />
        <div className="space-y-3">
          {lead && <StoryCard story={lead} variant="lead" showImage={showImages} />}
          <div className="grid gap-3 md:grid-cols-2">
            {restTop.map((s) => (
              <StoryCard key={s.id} story={s} showImage={showImages} />
            ))}
          </div>
        </div>
      </section>

      {/* 2 & 3. What happened in technology today? What's biggest in gaming? */}
      <div className="mb-10 grid gap-8 xl:grid-cols-2">
        <section>
          <SectionTitle title={t("dash.tech")} action={<SeeAll href="/technology?range=24h" />} />
          <StoryColumn stories={data.tech} showImages={showImages} />
        </section>
        <section>
          <SectionTitle title={t("dash.gaming")} action={<SeeAll href="/gaming?range=24h" />} />
          <StoryColumn stories={data.gaming} showImages={showImages} />
        </section>
      </div>

      {/* 4. What are the major companies doing? */}
      <section className="mb-10">
        <SectionTitle title={t("dash.companies")} hint={t("dash.companiesHint")} action={<SeeAll href="/companies" />} />
        {pulse.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pulse.map((c) => {
              const company = companyById(c.companyId);
              if (!company) return null;
              const headline = c.top ? (lang === "ar" ? (c.top.title.ar ?? c.top.title.original) : c.top.title.en) : null;
              const headlineLang = lang === "ar" && c.top?.title.ar ? "ar" : "en";
              return (
                <li key={c.companyId} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/companies?co=${c.companyId}`} className="font-semibold text-fg hover:text-accent">
                      {company[lang]}
                    </Link>
                    <span className="text-xs text-subtle">{t("companies.count", { n: c.count })}</span>
                  </div>
                  {c.top && headline && (
                    <a
                      href={c.top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      lang={headlineLang}
                      dir={headlineLang === "ar" ? "rtl" : "ltr"}
                      className="mt-2 line-clamp-3 block text-sm leading-relaxed text-muted hover:text-fg"
                    >
                      {headline}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t("dash.noCompanyNews")} />
        )}
        {quiet.length > 0 && (
          <p className="mt-3 text-sm text-subtle">
            {t("dash.noCompanyNews")}:{" "}
            {quiet
              .map((c) => companyById(c.companyId)?.[lang])
              .filter(Boolean)
              .join(lang === "ar" ? "، " : ", ")}
          </p>
        )}
      </section>

      {/* 5. What important announcements should I know about? */}
      {data.announcements.length > 0 && (
        <section className="mb-10">
          <SectionTitle title={t("dash.announcements")} hint={t("dash.announcementsHint")} />
          <div className="grid gap-3 md:grid-cols-2">
            {data.announcements.map((s) => (
              <StoryCard key={s.id} story={s} showImage={showImages} />
            ))}
          </div>
        </section>
      )}

      {/* 6. What might I have missed? */}
      {data.missed.length > 0 && (
        <section className="mb-4">
          <SectionTitle title={t("dash.missed")} hint={t("dash.missedHint")} />
          <div className="grid gap-3 md:grid-cols-2">
            {data.missed.map((s) => (
              <StoryCard key={s.id} story={s} showImage={showImages} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
