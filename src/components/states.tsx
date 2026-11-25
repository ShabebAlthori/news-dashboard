"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useUi } from "./providers";

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-4">
        {icon}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-[30px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      <Inbox className="mx-auto size-8 text-subtle" aria-hidden />
      <p className="mt-3 font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useUi();
  return (
    <div className="card px-6 py-10 text-center">
      <AlertTriangle className="mx-auto size-7 text-caution" aria-hidden />
      <p className="mt-3 font-medium text-fg">{t("list.error")}</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface-2">
        {t("list.retry")}
      </button>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useUi();
  return (
    <div className="space-y-3" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-3 h-5 w-4/5" />
          <div className="skeleton mt-2 h-4 w-full" />
          <div className="skeleton mt-1.5 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function NewStoriesBanner({ onShow }: { onShow: () => void }) {
  const { t } = useUi();
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm" role="status">
      <span className="text-accent-strong">{t("status.newAvailable")}</span>
      <button type="button" onClick={onShow} className="brand-gradient inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 font-medium text-white">
        <RefreshCw className="size-3.5" aria-hidden />
        {t("status.show")}
      </button>
    </div>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
