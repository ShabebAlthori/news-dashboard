"use client";

import { BadgeCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { formatDateTime, formatRelative } from "@/lib/shared/format";
import { categoryLabel, COMPANIES, MORE_TOPIC_IDS } from "@/lib/shared/taxonomy";
import type { Prefs, SourceHealth } from "@/lib/shared/types";
import { Segmented, Switch } from "./controls";
import { useNow, useUi, type ThemePref } from "./providers";
import { PageHeader } from "./states";
import { StatusIndicator } from "./status-indicator";
import { savePrefs, setSourceEnabled } from "@/lib/client/actions";
import { IS_STATIC } from "@/lib/client/mode";
import { useStatus } from "./use-data";

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-bold text-fg">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

export function SettingsView() {
  const { t, lang, setLang, theme, setTheme } = useUi();
  const now = useNow();
  const { data: prefs, mutate: mutatePrefs } = useSWR<Prefs>("/api/settings");
  const { data: sources, mutate: mutateSources } = useSWR<SourceHealth[]>("/api/sources", { refreshInterval: 60_000 });
  const { data: status } = useStatus();
  const [message, setMessage] = useState<string | null>(null);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    const optimistic = { ...prefs, ...patch };
    await mutatePrefs(
      () => savePrefs(patch),
      { optimisticData: optimistic, rollbackOnError: true, revalidate: false },
    ).then(
      () => setMessage(t("settings.saved")),
      () => setMessage(t("settings.saveError")),
    );
    setTimeout(() => setMessage(null), 2000);
  }

  async function toggleSource(id: string, enabled: boolean) {
    const next = await setSourceEnabled(id, enabled);
    if (next) await mutateSources(next as SourceHealth[], { revalidate: false });
  }

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const move = (list: string[], index: number, delta: number) => {
    const next = [...list];
    const target = index + delta;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  return (
    <>
      <PageHeader title={t("page.settings.title")} actions={message ? <span className="text-sm text-ok" role="status">{message}</span> : null} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("settings.display")}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium text-fg">{t("settings.language")}</span>
              <Segmented
                label={t("settings.language")}
                value={lang}
                onChange={setLang}
                options={[
                  { value: "ar", label: "العربية", lang: "ar" },
                  { value: "en", label: "English", lang: "en" },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium text-fg">{t("settings.theme")}</span>
              <Segmented<ThemePref>
                label={t("settings.theme")}
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("theme.light") },
                  { value: "dark", label: t("theme.dark") },
                  { value: "system", label: t("theme.system") },
                ]}
              />
            </div>
            {prefs && <Switch id="show-images" checked={prefs.showImages} onChange={(v) => save({ showImages: v })} label={t("settings.showImages")} />}
          </div>
        </Card>

        <Card title={t("settings.updates")}>
          {prefs && (
            <div className="space-y-4">
              {IS_STATIC ? (
                <p className="text-sm text-muted">{t("settings.staticUpdates")}</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium text-fg">{t("settings.interval")}</span>
                  <Segmented
                    label={t("settings.interval")}
                    value={String(prefs.refreshMinutes)}
                    onChange={(v) => save({ refreshMinutes: Number(v) })}
                    options={[10, 12, 15].map((n) => ({ value: String(n), label: t("settings.minutes", { n }) }))}
                  />
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">{t("settings.lastUpdate")}</dt>
                <dd className="text-fg">{status?.lastSuccessAt ? formatDateTime(status.lastSuccessAt, lang, now) : "—"}</dd>
                <dt className="text-muted">{t("settings.nextUpdate")}</dt>
                <dd className="text-fg">{status?.nextRunAt ? formatDateTime(status.nextRunAt, lang, now) : "—"}</dd>
              </dl>
              <StatusIndicator />
            </div>
          )}
        </Card>

        <Card title={t("settings.categories")} hint={t("settings.categoriesHint")}>
          {prefs && (
            <>
              <ol className="divide-y divide-line rounded-lg border border-line">
                {prefs.categoryOrder.map((id, i) => {
                  const label = categoryLabel(id);
                  const enabled = prefs.interests.includes(id);
                  return (
                    <li key={id} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-subtle" aria-label={t("settings.priority", { n: i + 1 })}>
                        {i + 1}
                      </span>
                      <span className={`min-w-0 flex-1 text-sm ${enabled ? "font-medium text-fg" : "text-subtle line-through"}`}>{label?.[lang] ?? id}</span>
                      <button
                        type="button"
                        onClick={() => save({ categoryOrder: move(prefs.categoryOrder, i, -1) })}
                        disabled={i === 0}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                        aria-label={`${t("settings.moveUp")}: ${label?.[lang] ?? id}`}
                        title={t("settings.moveUp")}
                      >
                        <ChevronUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => save({ categoryOrder: move(prefs.categoryOrder, i, 1) })}
                        disabled={i === prefs.categoryOrder.length - 1}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
                        aria-label={`${t("settings.moveDown")}: ${label?.[lang] ?? id}`}
                        title={t("settings.moveDown")}
                      >
                        <ChevronDown className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={label?.[lang] ?? id}
                        onClick={() => save({ interests: toggleIn(prefs.interests, id) })}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${enabled ? "border-accent bg-accent" : "border-line-strong bg-surface-2"}`}
                      >
                        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"}`} />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <h3 className="mb-1 mt-4 text-sm font-semibold text-muted">{t("settings.moreTopics")}</h3>
              <p className="mb-2 text-xs text-subtle">{t("settings.moreTopicsHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {MORE_TOPIC_IDS.map((id) => (
                  <ToggleChip key={id} active={prefs.interests.includes(id)} onClick={() => save({ interests: toggleIn(prefs.interests, id) })}>
                    {categoryLabel(id)?.[lang] ?? id}
                  </ToggleChip>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title={t("settings.companies")} hint={t("settings.companiesHint")}>
          {prefs && (
            <div className="flex flex-wrap gap-1.5">
              {COMPANIES.map((c) => (
                <ToggleChip key={c.id} active={prefs.followedCompanies.includes(c.id)} onClick={() => save({ followedCompanies: toggleIn(prefs.followedCompanies, c.id) })}>
                  {c[lang]}
                </ToggleChip>
              ))}
            </div>
          )}
        </Card>

        <Card title={t("settings.content")}>
          {prefs && (
            <div className="divide-y divide-line">
              <Switch id="show-reviews" checked={prefs.showReviews} onChange={(v) => save({ showReviews: v })} label={t("settings.showReviews")} hint={t("settings.showReviewsHint")} />
              <Switch id="tech-policy" checked={prefs.includeTechPolicy} onChange={(v) => save({ includeTechPolicy: v })} label={t("settings.techPolicy")} hint={t("settings.techPolicyHint")} />
            </div>
          )}
        </Card>

        <Card title={t("settings.ai")}>
          {status && (
            <div className="space-y-2 text-sm">
              <p className={status.ai.configured ? "text-ok" : "text-fg"}>
                {status.ai.configured ? t("settings.aiOn", { model: status.ai.model ?? status.ai.provider }) : t("settings.aiOff")}
              </p>
              {!status.ai.configured && <p className="text-muted">{t(IS_STATIC ? "settings.aiHowToStatic" : "settings.aiHowTo")}</p>}
              {status.ai.configured && <p className="text-muted">{t("settings.aiPending", { n: status.ai.pending })}</p>}
              {status.ai.lastError && <p className="text-caution">{t("settings.aiError", { e: status.ai.lastError })}</p>}
              <p className="text-muted">{t("settings.aiAccuracy")}</p>
            </div>
          )}
        </Card>

        <Card title={t("settings.data")}>
          {prefs && (
            <div className="space-y-3">
              {IS_STATIC ? (
                <p className="text-sm text-muted">{t("settings.localData")}</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium text-fg">{t("settings.retention")}</span>
                  <select
                    className="h-9 rounded-md border border-line bg-surface px-2.5 text-sm"
                    value={prefs.retentionDays}
                    onChange={(e) => save({ retentionDays: Number(e.target.value) })}
                  >
                    {[7, 14, 30, 60, 90].map((n) => (
                      <option key={n} value={n}>
                        {t("settings.days", { n })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-sm text-muted">{t("settings.timesExplained")}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title={t("settings.sources")} hint={t("settings.sourcesHint")}>
          <ul className="divide-y divide-line">
            {(sources ?? []).map((s) => {
              const state = !s.lastAttemptAt ? "pending" : s.lastStatus === "blocked" ? "blocked" : s.lastStatus === "error" ? "error" : "ok";
              const dot = { ok: "bg-ok", error: "bg-caution", blocked: "bg-breaking", pending: "bg-subtle" }[state];
              const label = { ok: t("sources.ok"), error: t("sources.error"), blocked: t("sources.blocked"), pending: t("sources.pending") }[state];
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a href={s.homepage} target="_blank" rel="noopener noreferrer" lang="en" className="font-medium text-fg hover:text-accent">
                        {s.name}
                      </a>
                      {s.kind === "official" && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-ok">
                          <BadgeCheck className="size-3.5" aria-hidden />
                          {t("sources.official")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-block size-2 rounded-full ${dot}`} aria-hidden />
                        {label}
                      </span>
                      {s.lastSuccessAt && <span>{t("sources.lastSuccess", { time: formatRelative(s.lastSuccessAt, lang, now) })}</span>}
                      <span>{t("sources.articles", { n: s.articleCount })}</span>
                      {!s.aiAllowed && <span className="text-caution">{t("sources.noAi")}</span>}
                    </p>
                    {state === "error" && s.lastError && (
                      <p className="mt-0.5 text-xs text-caution" lang="en" dir="ltr">
                        {s.lastError}
                      </p>
                    )}
                  </div>
                  {!IS_STATIC && (
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input type="checkbox" checked={s.enabled} onChange={(e) => toggleSource(s.id, e.target.checked)} className="size-4 accent-[var(--accent)]" />
                      {t("sources.enabled")}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
