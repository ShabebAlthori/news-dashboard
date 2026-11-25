"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { IS_STATIC } from "@/lib/client/mode";
import { staticFetch } from "@/lib/client/static-api";
import { translate, type I18nKey } from "@/lib/shared/i18n";
import type { Lang } from "@/lib/shared/types";

export type ThemePref = "light" | "dark" | "system";

interface UiContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: I18nKey, vars?: Record<string, string | number>) => string;
  theme: ThemePref;
  /** The theme actually shown ("system" resolved). */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePref) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

function applyTheme(theme: ThemePref) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export async function fetcher<T>(url: string): Promise<T> {
  if (IS_STATIC) return staticFetch<T>(url);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

const noopSubscribe = () => () => {};

function subscribeSystemTheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * In the static web edition the HTML is identical for everyone, so the reader's language
 * and theme are only known in the browser (an inline script applies them before paint).
 * The app is therefore rendered after mount, avoiding a flash of the wrong language.
 */
function ClientOnlyProviders({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;
  const lang: Lang = document.documentElement.lang === "en" ? "en" : "ar";
  const m = document.cookie.match(/(?:^|; )theme=([^;]*)/);
  // Dark is the signature TechPulse look; "system" is kept for readers who chose it.
  const cookieTheme = m ? decodeURIComponent(m[1]) : "dark";
  const theme: ThemePref = cookieTheme === "light" || cookieTheme === "system" ? cookieTheme : "dark";
  return (
    <ProvidersInner initialLang={lang} initialTheme={theme}>
      {children}
    </ProvidersInner>
  );
}

export function Providers({ initialLang, initialTheme, children }: { initialLang: Lang | null; initialTheme: ThemePref; children: ReactNode }) {
  if (initialLang === null) return <ClientOnlyProviders>{children}</ClientOnlyProviders>;
  return (
    <ProvidersInner initialLang={initialLang} initialTheme={initialTheme}>
      {children}
    </ProvidersInner>
  );
}

function ProvidersInner({ initialLang, initialTheme, children }: { initialLang: Lang; initialTheme: ThemePref; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<ThemePref>(initialTheme);

  // Switching language only swaps strings and direction in place — the URL (and
  // therefore the current page and all filters) is untouched.
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeCookie("lang", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  }, []);

  const setTheme = useCallback((next: ThemePref) => {
    setThemeState(next);
    writeCookie("theme", next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const systemDark = useSyncExternalStore(subscribeSystemTheme, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => true);
  const resolvedTheme: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  const value = useMemo<UiContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      theme,
      resolvedTheme,
      setTheme,
    }),
    [lang, setLang, theme, resolvedTheme, setTheme],
  );

  return (
    <UiContext.Provider value={value}>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, dedupingInterval: 5000, keepPreviousData: true }}>{children}</SWRConfig>
    </UiContext.Provider>
  );
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <Providers>");
  return ctx;
}

/** Re-renders every `intervalMs` so relative times ("5 minutes ago") stay current. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
