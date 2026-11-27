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
          <stop offset="0" stopColor="#a08cff" />
          <stop offset="0.55" stopColor="#8b72ff" />
          <stop offset="1" stopColor="#65a6ff" />
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

/** Compact logo: the mark and the wordmark (the wordmark hides on the narrowest phones). */
export function Brand({ tagline = false, compact = false, onNavigate }: { tagline?: boolean; compact?: boolean; onNavigate?: () => void }) {
  const { t } = useUi();
  return (
    <Link href="/" onClick={onNavigate} className="flex min-h-11 min-w-11 items-center gap-2.5 rounded-lg" aria-label={t("app.name")}>
      <TechPulseMark className="size-7 shrink-0" />
      {!compact && (
        <span className="leading-tight max-[339px]:sr-only" aria-hidden>
          <span className="block font-sans text-[17px] font-semibold tracking-[-0.02em] text-fg" lang="en" dir="ltr">
            {t("app.name")}
          </span>
          {tagline && <span className="block text-xs text-subtle">{t("app.tagline")}</span>}
        </span>
      )}
    </Link>
  );
}
