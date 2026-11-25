"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useUi, type ThemePref } from "./providers";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useUi();
  const next = lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      lang={next}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-line px-2.5 text-sm font-medium text-fg hover:bg-surface-2 ${className}`}
      aria-label={next === "ar" ? "التبديل إلى العربية" : "Switch to English"}
      title={next === "ar" ? "التبديل إلى العربية" : "Switch to English"}
    >
      {next === "ar" ? "العربية" : "English"}
    </button>
  );
}

const ORDER: ThemePref[] = ["system", "light", "dark"];

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme, t } = useUi();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`inline-flex size-9 items-center justify-center rounded-md border border-line text-fg hover:bg-surface-2 ${className}`}
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
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          lang={o.lang}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm ${value === o.value ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted hover:text-fg"}`}
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
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2"}`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
