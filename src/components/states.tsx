"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useUi } from "./providers";

/** Page title block: optional eyebrow, a strong headline, a short description, actions at the end. */
export function PageHeader({ title, subtitle, actions, icon, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="flex min-w-0 items-center gap-4">
        {icon}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[36px]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted sm:text-base">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line px-6 py-14 text-center">
      <Inbox className="mx-auto size-6 text-subtle" aria-hidden />
      <p className="mt-3 font-medium text-fg">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useUi();
  return (
    <div className="rounded-lg border border-line px-6 py-12 text-center">
      <AlertTriangle className="mx-auto size-6 text-caution" aria-hidden />
      <p className="mt-3 font-medium text-fg">{t("list.error")}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-surface-2">
        {t("list.retry")}
      </button>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useUi();
  return (
    <div className="rule-list" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-5 py-5 first:pt-0">
          <div className="flex-1">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-5 w-4/5" />
            <div className="skeleton mt-2 h-4 w-full" />
            <div className="skeleton mt-1.5 h-4 w-2/3" />
          </div>
          <div className="skeleton aspect-[4/3] w-24 shrink-0 rounded-lg sm:w-40" />
        </div>
      ))}
    </div>
  );
}

export function NewStoriesBanner({ onShow }: { onShow: () => void }) {
  const { t } = useUi();
  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-sm" role="status">
      <span className="flex items-center gap-2 text-fg">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        {t("status.newAvailable")}
      </span>
      <button type="button" onClick={onShow} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-fg px-3 font-medium text-bg hover:opacity-90">
        <RefreshCw className="size-3.5" aria-hidden />
        {t("status.show")}
      </button>
    </div>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-t border-line pt-4">
      <div>
        <h2 className="text-xl font-semibold text-fg">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
