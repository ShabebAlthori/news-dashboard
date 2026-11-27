"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import type { Prefs } from "@/lib/shared/types";
import { useUi } from "./providers";
import { PageHeader } from "./states";
import { StoryFeed, useUpdateParams } from "./story-feed";

export function SearchView() {
  const { t } = useUi();
  const sp = useSearchParams();
  const update = useUpdateParams();
  const urlQuery = sp.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: prefs } = useSWR<Prefs>("/api/settings");

  // Follow external URL changes (back/forward navigation).
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    if (value === urlQuery) return;
    const id = setTimeout(() => update({ q: value.trim() || null }), 350);
    return () => clearTimeout(id);
  }, [value, urlQuery, update]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <PageHeader title={t("page.search.title")} />
      <form
        role="search"
        className="relative mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: value.trim() || null });
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          {t("search.label")}
        </label>
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          ref={inputRef}
          id="search-input"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-12 w-full rounded-lg border border-line bg-surface pe-4 ps-11 text-base text-fg placeholder:text-subtle focus:border-accent focus:outline-none"
          autoComplete="off"
          dir="auto"
        />
      </form>
      <p className="mb-5 text-sm text-muted">{t("search.hint", { n: prefs?.retentionDays ?? 30 })}</p>
      <StoryFeed section="all" defaultSort="importance" defaultRange="all" priorityChips showCompanyFilter requireQuery />
    </>
  );
}
