"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useUi } from "./providers";

// Building blocks for rail sections (Stocks and other side panels): a hairline rule, a quiet
// heading and a text action — no boxes.

export function ViewAll({ href, label, ariaLabel }: { href: string; label?: string; ariaLabel?: string }) {
  const { t } = useUi();
  return (
    <Link href={href} aria-label={ariaLabel} className="group inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm text-muted transition-colors hover:text-fg">
      {label ?? t("dash.seeAll")}
      <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

export function PanelTitle({ icon, title, hint, action, id }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-subtle">{icon}</span>}
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-semibold text-fg">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-[13px] text-subtle">{hint}</p>}
        </div>
      </div>
      {action && <span className="-mt-2.5 shrink-0">{action}</span>}
    </div>
  );
}

/** Icon beside a panel title (kept as a plain, muted icon). */
export function IconBubble({ children }: { children: ReactNode }) {
  return <span className="inline-flex size-5 items-center justify-center">{children}</span>;
}
