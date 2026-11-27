"use client";

import { ArrowRight, CalendarDays, FileText } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { companyById, shortCategoryLabel } from "@/lib/shared/taxonomy";
import type { Lang, ReportResponse, ReportStory, WeeklyReport } from "@/lib/shared/types";
import { CompanyLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { RadarTimeline } from "./radar-view";
import { EmptyState, ErrorState, PageHeader } from "./states";
import { storyHeadline, storySummary } from "./story-text";
import { CATEGORY_ICONS, categoryTint, OriginalLangTag } from "./story-visuals";

const LOCALES: Record<Lang, string> = { en: "en-GB", ar: "ar-u-nu-latn" };

function formatDay(iso: string, lang: Lang, withYear = false) {
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: withYear ? undefined : "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(iso));
}

export function formatPeriod(start: string, end: string, lang: Lang) {
  return `${formatDay(start, lang, true)} – ${formatDay(end, lang, true)}`;
}

/** Original illustration: layered data plates with a rising chart, drawn in SVG. */

/** `meta`: only the latest period and the next date (for the dashboard panel). */
export function useReport(id?: number | null, meta = false) {
  return useSWR<ReportResponse>(id ? `/api/report?id=${id}` : meta ? "/api/report?meta=1" : "/api/report", { refreshInterval: 15 * 60_000 });
}

export function ReportPanel() {
  const { t, lang } = useUi();
  const { data } = useReport(null, true);
  const hasReport = !!(data?.latest || data?.archive.length);
  return (
    <section aria-labelledby="report-title" className="border-t border-line pt-4">
      <h2 id="report-title" className="text-[15px] font-semibold text-fg">
        {t("report.title")}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{t("report.desc")}</p>
      <Link href="/report" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2">
        <CalendarDays className="size-4 text-subtle" aria-hidden />
        {hasReport ? t("report.view") : t("report.every")}
      </Link>
      <p className="mt-3 text-xs text-subtle">
        {t("report.every")} · {data ? t("report.next", { date: formatDay(data.nextAt, lang) }) : "…"}
      </p>
      {data && !hasReport && <p className="mt-1 text-xs text-subtle">{t("report.none")}</p>}
    </section>
  );
}

function ReportStoryItem({ story, rank }: { story: ReportStory; rank?: number }) {
  const { t, lang } = useUi();
  const now = useNow();
  const h = storyHeadline(story, lang);
  const sum = storySummary(story, lang);
  return (
    <li className="flex gap-3.5 py-3.5 first:pt-0 last:pb-0">
      {rank != null && <span className="mt-0.5 w-6 shrink-0 text-center text-lg font-bold tabular-nums text-accent">{rank}</span>}
      <div className="min-w-0 flex-1">
        <a href={story.url} target="_blank" rel="noopener noreferrer" lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="block font-semibold leading-snug text-fg hover:text-accent">
          {h.text}
        </a>
        {sum && (
          <p lang={sum.lang} dir={sum.lang === "ar" ? "rtl" : "ltr"} className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">
            {sum.text}
          </p>
        )}
        <p className="mt-1.5 text-xs text-subtle">
          <OriginalLangTag langs={[h.lang, sum?.lang]} className="me-1.5" />
          <span dir="auto">{story.source}</span>
          {story.publishedAt && <> · {formatDateTime(story.publishedAt, lang, now)}</>}
          {story.sourceCount > 1 && <> · {t("card.sources", { n: story.sourceCount })}</>}
        </p>
      </div>
      {story.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- publisher-hosted images
        <img src={story.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="hidden h-20 w-32 shrink-0 rounded-xl object-cover sm:block" />
      )}
    </li>
  );
}

function ReportBody({ report }: { report: WeeklyReport }) {
  const { t, lang } = useUi();
  const now = useNow();
  return (
    <div className="space-y-6">
      <div className="card brand-gradient-soft p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("report.coverage")}</p>
        <p className="mt-1 text-xl font-bold text-fg">{formatPeriod(report.periodStart, report.periodEnd, lang)}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-fg">{t("report.stories", { n: report.totals.stories })}</span>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-fg">{t("report.sources", { n: report.totals.sources })}</span>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-muted">{t("report.generated", { time: formatRelative(report.generatedAt, lang, now) })}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{t("report.method")}</p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold text-fg">{t("report.highlights")}</h2>
        <ol className="divide-y divide-line">
          {report.highlights.map((s, i) => (
            <ReportStoryItem key={s.id} story={s} rank={i + 1} />
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {report.sections.map((sec) => {
          const label = shortCategoryLabel(sec.id);
          const Icon = CATEGORY_ICONS[sec.id];
          return (
            <section key={sec.id} className="card p-5">
              <div className="mb-3 flex items-center gap-2.5">
                {Icon && (
                  <span className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2" style={{ color: categoryTint(sec.id).mark }}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                )}
                <h2 className="font-bold text-fg">{label?.[lang] ?? sec.id}</h2>
                <span className="ms-auto text-xs text-subtle">{t("report.stories", { n: sec.count })}</span>
              </div>
              {sec.stories.length ? (
                <ul className="divide-y divide-line">
                  {sec.stories.map((s) => (
                    <ReportStoryItem key={s.id} story={s} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("dash.categoryEmpty")}</p>
              )}
            </section>
          );
        })}
      </div>

      {report.companies.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-bold text-fg">{t("report.companies")}</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {report.companies.map((c) => {
              const company = companyById(c.id);
              const h = c.top ? storyHeadline(c.top, lang) : null;
              return (
                <li key={c.id} className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
                  <CompanyLogo id={c.id} size={36} />
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="font-semibold text-fg">{company?.[lang] ?? c.id}</span>
                      <span className="text-xs text-subtle">{t("report.stories", { n: c.count })}</span>
                    </p>
                    {c.top && h && (
                      <a href={c.top.url} target="_blank" rel="noopener noreferrer" lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="mt-0.5 line-clamp-2 text-sm text-muted hover:text-fg">
                        {h.text}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {report.radar.length > 0 && (
        <section className="border-t border-line pt-5">
          <h2 className="mb-5 text-xl font-semibold text-fg">{t("report.radar")}</h2>
          <RadarTimeline items={report.radar} />
        </section>
      )}
    </div>
  );
}

export function ReportView() {
  const { t, lang } = useUi();
  const sp = useSearchParams();
  const id = Number(sp.get("id")) || null;
  const { data, error, mutate } = useReport(id);
  return (
    <>
      <PageHeader
        title={t("report.title")}
        subtitle={t("report.desc")}
        actions={
          data ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted">
              <CalendarDays className="size-4 text-accent" aria-hidden />
              {t("report.every")} · {t("report.next", { date: formatDay(data.nextAt, lang) })}
            </span>
          ) : undefined
        }
      />
      {error ? (
        <ErrorState onRetry={() => mutate()} />
      ) : !data ? (
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      ) : !data.latest ? (
        <EmptyState title={id ? t("report.notFound") : t("report.none")} hint={t("report.next", { date: formatDay(data.nextAt, lang) })} />
      ) : (
        <>
          <ReportBody report={data.latest} />
          {data.archive.length > 1 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-fg">{t("report.archive")}</h2>
              <ul className="flex flex-wrap gap-2">
                {data.archive.map((r, i) => {
                  const current = r.id === data.latest!.id;
                  return (
                    <li key={r.id}>
                      <Link
                        href={i === 0 ? "/report" : `/report?id=${r.id}`}
                        aria-current={current ? "page" : undefined}
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm ${current ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line bg-surface text-fg hover:bg-surface-2"}`}
                      >
                        <FileText className="size-4" aria-hidden />
                        {formatPeriod(r.periodStart, r.periodEnd, lang)}
                        {current && <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
