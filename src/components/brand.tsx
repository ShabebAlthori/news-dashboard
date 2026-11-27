"use client";

import Link from "next/link";
import { useId } from "react";
import { useUi } from "./providers";

/** The TechPulse mark: a "T" whose crossbar carries a pulse line. */
export function TechPulseMark({ className = "size-9" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a27bff" />
          <stop offset="0.5" stopColor="#713bff" />
          <stop offset="1" stopColor="#4388ff" />
        </linearGradient>
      </defs>
      <path
        d="M4.2 4.5h23.6a1.6 1.6 0 0 1 1.3 2.6l-3.4 4.6a2.2 2.2 0 0 1-1.8.9h-4.6v13.3a1.6 1.6 0 0 1-.75 1.36l-4.1 2.55A1.6 1.6 0 0 1 12 28.45V12.6H7.6a2.2 2.2 0 0 1-1.8-.9L2.9 7.1a1.6 1.6 0 0 1 1.3-2.6Z"
        fill={`url(#${id}-g)`}
      />
      <path d="M6.8 8.6h4.3l1.5-2.3 2.2 4.6 1.7-2.3h8.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
    </svg>
  );
}

export function Brand({ tagline = true, compact = false, onNavigate }: { tagline?: boolean; compact?: boolean; onNavigate?: () => void }) {
  const { t } = useUi();
  return (
    <Link href="/" onClick={onNavigate} className="flex min-h-11 min-w-11 items-center gap-3 rounded-lg" aria-label={compact ? t("app.name") : undefined}>
      <TechPulseMark className={compact ? "size-9" : "size-10"} />
      {!compact && (
        <span className="leading-tight">
          <span className="block font-sans text-[19px] font-bold tracking-tight text-fg" lang="en" dir="ltr">
            {t("app.name")}
          </span>
          {tagline && <span className="block text-[13px] text-muted">{t("app.tagline")}</span>}
        </span>
      )}
    </Link>
  );
}
