"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useUi } from "./providers";

// Building blocks shared by the dashboard's cards.

export function ViewAll({ href, label, ariaLabel }: { href: string; label?: string; ariaLabel?: string }) {
  const { t } = useUi();
  return (
    <Link href={href} aria-label={ariaLabel} className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-accent hover:underline">
      {label ?? t("dash.seeAll")}
      <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

export function PanelTitle({ icon, title, hint, action, id }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <h2 id={id} className="min-w-0 text-lg font-bold leading-tight text-fg">
          {title}
        </h2>
        <span className="ms-auto shrink-0">{action}</span>
      </div>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function IconBubble({ children }: { children: ReactNode }) {
  return <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">{children}</span>;
}
