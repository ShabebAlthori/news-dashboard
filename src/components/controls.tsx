"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useUi, type ThemePref } from "./providers";

/** EN | ع switch. Switching keeps the current page and filters. */
export function LanguageToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang } = useUi();
  const options = [
    { value: "en" as const, label: "EN", aria: "English" },
    { value: "ar" as const, label: compact ? "ع" : "عربي", aria: "العربية" },
  ];
  return (
    <div role="radiogroup" aria-label="Language / اللغة" className={`inline-flex h-11 items-center ${className}`}>
      <span className="inline-flex items-center rounded-lg border border-line p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={lang === o.value}
            aria-label={o.aria}
            lang={o.value}
            onClick={() => setLang(o.value)}
            // 44px tall hit area around a compact 32px segment.
            className={`relative inline-flex h-8 min-w-9 items-center justify-center rounded-md px-2 text-[13px] font-medium transition-colors after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[''] ${
              lang === o.value ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Light / dark in one icon button (header). */
export function ThemeButton() {
  const { resolvedTheme, setTheme, t } = useUi();
  const dark = resolvedTheme === "dark";
  const label = dark ? t("theme.switchToLight") : t("theme.switchToDark");
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

/** Light | Dark segmented control (drawer, footer). `rail` keeps the icon-only button. */
export function ThemeSwitch({ rail = false }: { rail?: boolean }) {
  const { resolvedTheme, setTheme, t } = useUi();
  if (rail) return <ThemeButton />;
  const options = [
    { value: "light" as const, label: t("theme.light"), icon: Sun },
    { value: "dark" as const, label: t("theme.dark"), icon: Moon },
  ];
  return (
    <div role="radiogroup" aria-label={t("settings.theme")} className="inline-flex items-center rounded-lg border border-line p-0.5">
      {options.map(({ value, label, icon: Icon }) => {
        const on = resolvedTheme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(value)}
            className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors ${on ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
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
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-md px-3.5 py-1.5 text-sm transition-colors ${value === o.value ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
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
        className={`relative mt-1 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2.5 after:content-[''] ${checked ? "bg-brand" : "bg-surface-3"}`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
