"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useUi, type ThemePref } from "./providers";

/** EN | عربي segmented switch. Switching keeps the current page and filters. */
export function LanguageToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang } = useUi();
  const options = [
    { value: "en" as const, label: "EN", aria: "English" },
    { value: "ar" as const, label: compact ? "ع" : "عربي", aria: "العربية" },
  ];
  return (
    <div role="radiogroup" aria-label="Language / اللغة" className={`inline-flex items-center rounded-full border border-line bg-surface ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={lang === o.value}
          aria-label={o.aria}
          lang={o.value}
          onClick={() => setLang(o.value)}
          className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
            lang === o.value ? "brand-gradient text-white shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Sun — switch — moon. Picks an explicit light or dark theme. */
export function ThemeSwitch({ rail = false }: { rail?: boolean }) {
  const { resolvedTheme, setTheme, t } = useUi();
  const dark = resolvedTheme === "dark";
  const label = dark ? t("theme.switchToLight") : t("theme.switchToDark");
  if (rail) {
    const Icon = dark ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={() => setTheme(dark ? "light" : "dark")}
        aria-label={label}
        title={label}
        className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-fg transition-colors hover:bg-surface-2"
      >
        <Icon className="size-[18px]" aria-hidden />
      </button>
    );
  }
  return (
    <div className="card flex items-center justify-center gap-4 px-4 py-3">
      <Sun className={`size-[18px] transition-colors ${dark ? "text-subtle" : "text-caution"}`} aria-hidden />
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label={t("theme.dark")}
        title={label}
        onClick={() => setTheme(dark ? "light" : "dark")}
        className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] ${dark ? "brand-gradient" : "bg-surface-3"}`}
      >
        <span
          className={`absolute top-1 start-1 size-5 rounded-full bg-white shadow transition-transform duration-200 ${dark ? "ltr:translate-x-6 rtl:-translate-x-6" : ""}`}
        />
      </button>
      <Moon className={`size-[18px] transition-colors ${dark ? "text-accent-strong" : "text-subtle"}`} aria-hidden />
    </div>
  );
}

const ORDER: ThemePref[] = ["system", "light", "dark"];

/** Cycles system → light → dark (kept for compact places). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme, t } = useUi();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`inline-flex size-11 items-center justify-center rounded-lg border border-line text-fg hover:bg-surface-2 ${className}`}
      aria-label={`${t("theme.toggle")}: ${t(`theme.${theme}`)}`}
      title={`${t("theme.toggle")}: ${t(`theme.${theme}`)}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-lg px-3.5 py-1.5 text-sm transition-colors ${value === o.value ? "brand-gradient font-semibold text-white shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="font-medium text-fg">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors after:absolute after:-inset-2.5 after:content-[''] ${checked ? "border-transparent brand-gradient" : "border-line-strong bg-surface-2"}`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
