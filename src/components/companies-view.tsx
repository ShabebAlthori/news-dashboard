"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { COMPANY_TICKERS } from "@/lib/shared/stocks";
import { COMPANIES, companyById, TRENDING_COMPANY_IDS } from "@/lib/shared/taxonomy";
import type { DashboardResponse, Prefs } from "@/lib/shared/types";
import { CompanyLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { PageHeader } from "./states";
import { QuoteLine } from "./stocks";
import { StoryFeed } from "./story-feed";
import { storyHeadline } from "./story-text";

/** Company Watch: what each tracked company announced recently (news, not market data). */
export function CompaniesView() {
  const { t, lang } = useUi();
  const sp = useSearchParams();
  const selected = sp.get("co") ?? "";
  const company = selected ? companyById(selected) : undefined;
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const { data: dash } = useSWR<DashboardResponse>(company ? null : "/api/dashboard");
  const now = useNow(600_000);
  const anchor = Math.floor(now / 600_000) * 600_000;
  const { data: counts } = useSWR<Record<string, number>>(`/api/companies?from=${anchor - 48 * 3_600_000}`);

  if (company) {
    return (
      <>
        <Link href="/companies" className="-mt-2 mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("companies.back")}
        </Link>
        <PageHeader
          eyebrow={t("watch.title")}
          icon={<CompanyLogo id={company.id} size={56} />}
          title={company[lang]}
          subtitle={lang === "ar" && company.ar !== company.en ? company.en : undefined}
          actions={<QuoteLine companyId={company.id} />}
        />
        <StoryFeed section="all" company={company.id} defaultSort="importance" defaultRange="7d" categorySections={["business"]} />
      </>
    );
  }

  const latest = new Map((dash?.trending ?? []).map((c) => [c.companyId, c.top]));
  const followed = new Set(prefs?.followedCompanies ?? COMPANIES.filter((c) => c.core).map((c) => c.id));
  const watchOrder = (id: string) => {
    const i = TRENDING_COMPANY_IDS.indexOf(id);
    return i === -1 ? 99 : i;
  };
  const sort = (list: typeof COMPANIES) => [...list].sort((a, b) => (counts?.[b.id] ?? 0) - (counts?.[a.id] ?? 0) || watchOrder(a.id) - watchOrder(b.id));
  const groups = [
    { id: "following", title: t("companies.following"), list: sort(COMPANIES.filter((c) => followed.has(c.id))) },
    { id: "others", title: t("companies.others"), list: sort(COMPANIES.filter((c) => !followed.has(c.id))) },
  ].filter((g) => g.list.length);

  return (
    <>
      <PageHeader
        eyebrow={t("nav.companies")}
        title={t("watch.title")}
        subtitle={t("watch.pageHint")}
        actions={
          <Link href="/stocks" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-surface-2">
            {t("nav.stocks")}
          </Link>
        }
      />
      <div className="space-y-12">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`companies-${g.id}`}>
            <h2 id={`companies-${g.id}`} className="eyebrow mb-3">
              {g.title}
            </h2>
            <ul className="grid grid-cols-1 gap-x-10 border-t border-line md:grid-cols-2">
              {g.list.map((c) => {
                const n = counts?.[c.id] ?? 0;
                const top = latest.get(c.id);
                const h = top ? storyHeadline(top, lang) : null;
                return (
                  <li key={c.id} className="border-b border-line">
                    <Link href={`/companies?co=${c.id}`} className="group flex gap-4 py-4">
                      <CompanyLogo id={c.id} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate font-medium text-fg group-hover:text-accent">{c[lang]}</span>
                            {COMPANY_TICKERS[c.id] && (
                              <span className="font-mono text-xs text-subtle" dir="ltr">
                                {COMPANY_TICKERS[c.id]}
                              </span>
                            )}
                          </span>
                          <span className={`shrink-0 font-mono text-xs tabular-nums ${n ? "text-muted" : "text-subtle"}`}>{t("companies.count", { n })}</span>
                        </span>
                        {h ? (
                          <span lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="mt-1 line-clamp-2 block text-sm leading-snug text-muted">
                            {h.text}
                          </span>
                        ) : (
                          <span className="mt-1 block text-sm text-subtle">{t("companies.quiet")}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
