"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { COMPANIES, companyById } from "@/lib/shared/taxonomy";
import type { Prefs } from "@/lib/shared/types";
import { CompanyLogo } from "./logos";
import { useNow, useUi } from "./providers";
import { PageHeader } from "./states";
import { StoryFeed } from "./story-feed";

export function CompaniesView() {
  const { t, lang } = useUi();
  const sp = useSearchParams();
  const selected = sp.get("co") ?? "";
  const company = selected ? companyById(selected) : undefined;
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const now = useNow(600_000);
  const anchor = Math.floor(now / 600_000) * 600_000;
  const { data: counts } = useSWR<Record<string, number>>(`/api/companies?from=${anchor - 48 * 3_600_000}`);

  if (company) {
    return (
      <>
        <Link href="/companies" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("companies.back")}
        </Link>
        <PageHeader icon={<CompanyLogo id={company.id} size={56} />} title={company[lang]} subtitle={lang === "ar" && company.ar !== company.en ? company.en : undefined} />
        <StoryFeed section="all" company={company.id} defaultSort="importance" defaultRange="7d" categorySections={["business"]} />
      </>
    );
  }

  const followed = new Set(prefs?.followedCompanies ?? COMPANIES.filter((c) => c.core).map((c) => c.id));
  const groups = [
    { title: t("companies.following"), list: COMPANIES.filter((c) => followed.has(c.id)) },
    { title: t("companies.others"), list: COMPANIES.filter((c) => !followed.has(c.id)) },
  ].filter((g) => g.list.length);

  return (
    <>
      <PageHeader title={t("page.companies.title")} subtitle={t("page.companies.subtitle")} />
      {groups.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{g.title}</h2>
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {[...g.list]
              .sort((a, b) => (counts?.[b.id] ?? 0) - (counts?.[a.id] ?? 0))
              .map((c) => {
                const n = counts?.[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <Link href={`/companies?co=${c.id}`} className="card card-hover flex h-full items-center gap-3 p-3.5">
                      <CompanyLogo id={c.id} size={40} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-fg">{c[lang]}</span>
                        <span className={`mt-0.5 block text-xs ${n ? "text-accent" : "text-subtle"}`}>{t("companies.count", { n })}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </>
  );
}
