"use client";

import { Bookmark, Building2, Cpu, Gamepad2, LayoutDashboard, Menu, Newspaper, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { I18nKey } from "@/lib/shared/i18n";
import { LanguageToggle, ThemeToggle } from "./controls";
import { useUi } from "./providers";
import { StatusIndicator } from "./status-indicator";

const NAV: { href: string; key: I18nKey; icon: typeof LayoutDashboard }[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/latest", key: "nav.latest", icon: Newspaper },
  { href: "/technology", key: "nav.technology", icon: Cpu },
  { href: "/gaming", key: "nav.gaming", icon: Gamepad2 },
  { href: "/companies", key: "nav.companies", icon: Building2 },
  { href: "/search", key: "nav.search", icon: Search },
  { href: "/saved", key: "nav.saved", icon: Bookmark },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

const MOBILE_TABS = ["/", "/latest", "/technology", "/gaming", "/companies"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ tagline = true }: { tagline?: boolean }) {
  const { t } = useUi();
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-fg text-sm font-bold text-bg" aria-hidden>
        B
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-fg">{t("app.name")}</span>
        {tagline && <span className="block text-xs text-muted">{t("app.tagline")}</span>}
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useUi();
  return (
    <nav aria-label={t("nav.menu")}>
      <ul className="space-y-0.5">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[15px] ${active ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useUi();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t("nav.skip")}
      </a>

      {/* Desktop sidebar — sits on the start side (right in Arabic, left in English). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="space-y-4 border-t border-line pt-4">
          <StatusIndicator />
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Brand tagline={false} />
          <div className="flex items-center gap-1.5">
            <Link href="/search" className="inline-flex size-9 items-center justify-center rounded-md text-fg hover:bg-surface-2" aria-label={t("nav.search")}>
              <Search className="size-5" aria-hidden />
            </Link>
            <LanguageToggle />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-md text-fg hover:bg-surface-2"
              aria-label={t("nav.menu")}
              aria-expanded={drawerOpen}
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t("nav.menu")}>
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => MOBILE_TABS.includes(n.href)).map(({ href, key, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-accent" : "text-muted"}`}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="truncate">{t(key)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <button type="button" className="absolute inset-0 bg-black/40" aria-label={t("nav.close")} onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 end-0 flex w-72 max-w-[85%] flex-col bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex size-9 items-center justify-center rounded-md hover:bg-surface-2" aria-label={t("nav.close")}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-5 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="space-y-4 border-t border-line pt-4">
              <StatusIndicator />
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
