"use client";

import { Bookmark, Building2, ChartColumn, Cpu, Gamepad2, House, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { I18nKey } from "@/lib/shared/i18n";
import { Brand, TechPulseMark } from "./brand";
import { LanguageToggle, ThemeSwitch } from "./controls";
import { useUi } from "./providers";
import { StaleNotice, StatusCard } from "./status-indicator";
import { IS_STATIC, BASE_PATH } from "@/lib/client/mode";
import { Notifications, ProfileMenu, SearchBox } from "./top-bar";

const NAV: { href: string; key: I18nKey; icon: typeof House }[] = [
  { href: "/", key: "nav.dashboard", icon: House },
  { href: "/latest", key: "nav.latest", icon: Zap },
  { href: "/radar", key: "nav.radar", icon: ChartColumn },
  { href: "/technology", key: "nav.technology", icon: Cpu },
  { href: "/gaming", key: "nav.gaming", icon: Gamepad2 },
  { href: "/companies", key: "nav.companies", icon: Building2 },
  { href: "/saved", key: "nav.saved", icon: Bookmark },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

const MOBILE_TABS = ["/", "/latest", "/radar", "/technology", "/saved"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Desktop sidebar collapse preference (per browser).
const COLLAPSE_KEY = "techpulse.sidebarCollapsed";
const collapseListeners = new Set<() => void>();
function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    // ignore: the sidebar simply opens expanded next time
  }
  for (const l of collapseListeners) l();
}
function subscribeCollapsed(l: () => void) {
  collapseListeners.add(l);
  return () => collapseListeners.delete(l);
}

/**
 * Navigation links. `rail` = icons only (tablet, or a collapsed desktop sidebar);
 * `responsiveRail` = icons only below 1280px and full labels above.
 */
function NavLinks({ mode, onNavigate }: { mode: "full" | "rail" | "responsive"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useUi();
  const labelClass = mode === "full" ? "" : mode === "rail" ? "sr-only" : "sr-only xl:not-sr-only";
  const itemClass = mode === "full" ? "px-3.5" : mode === "rail" ? "justify-center px-0" : "justify-center px-0 xl:justify-start xl:px-3.5";
  return (
    <nav aria-label={t("nav.menu")}>
      <ul className="space-y-1">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={mode === "full" ? undefined : t(key)}
                className={`group flex h-11 items-center gap-3.5 rounded-xl text-[15px] transition-colors ${itemClass} ${
                  active ? "brand-gradient font-semibold text-white shadow-[0_8px_24px_-10px_rgba(113,59,255,0.7)]" : "text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                <Icon className={`size-5 shrink-0 ${active ? "" : "text-subtle group-hover:text-fg"}`} aria-hidden />
                <span className={labelClass}>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar() {
  const { t } = useUi();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // md–lg: always a rail. xl+: full unless the reader collapsed it.
  const mode = collapsed ? "rail" : "responsive";
  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-sidebar py-5 transition-[width] duration-200 md:flex ${
        collapsed ? "w-[84px] px-3" : "w-[84px] px-3 xl:w-[256px] xl:px-4"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-center xl:justify-between"} gap-2 px-1`}>
        <span className={collapsed ? "" : "xl:hidden"}>
          <Link href="/" aria-label={t("app.name")} className="rounded-lg">
            <TechPulseMark className="size-10" />
          </Link>
        </span>
        {!collapsed && (
          <span className="hidden xl:block">
            <Brand />
          </span>
        )}
      </div>

      <div className="mt-8 flex-1 overflow-y-auto overflow-x-hidden">
        <NavLinks mode={mode} />
      </div>

      <div className="mt-4 space-y-3">
        <div className={collapsed ? "flex justify-center" : "flex justify-center xl:block"}>
          <span className={collapsed ? "" : "xl:hidden"}>
            <ThemeSwitch rail />
          </span>
          {!collapsed && (
            <span className="hidden xl:block">
              <ThemeSwitch />
            </span>
          )}
        </div>
        <div className={collapsed ? "" : "xl:hidden"}>
          <StatusCard rail />
        </div>
        {!collapsed && (
          <div className="hidden xl:block">
            <StatusCard />
          </div>
        )}
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          className="hidden h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-subtle transition-colors hover:bg-surface-2 hover:text-fg xl:flex"
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {collapsed ? <PanelLeftOpen className="size-4 rtl:-scale-x-100" aria-hidden /> : <PanelLeftClose className="size-4 rtl:-scale-x-100" aria-hidden />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}

function SearchFallback() {
  return <div className="h-11 w-full rounded-full border border-line bg-surface" aria-hidden />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useUi();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  // Web edition: install the service worker (offline copy of the app and the latest data).
  useEffect(() => {
    if (!IS_STATIC || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {
      // Not fatal: the site works without it, just not offline.
    });
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t("nav.skip")}
      </a>

      {/* Sidebar on the start side: left in English, right in Arabic. */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — tablet and desktop */}
        <header className="glass sticky top-0 z-30 hidden items-center gap-4 border-b border-line/60 px-6 py-3 md:flex lg:px-8">
          <Suspense fallback={<SearchFallback />}>
            <SearchBox className="max-w-[640px] flex-1" />
          </Suspense>
          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle />
            <span className="mx-1 h-7 w-px bg-line" aria-hidden />
            <Notifications />
            <ProfileMenu />
          </div>
        </header>

        {/* Top bar — phones */}
        <header className="glass sticky top-0 z-30 flex items-center justify-between gap-1 border-b border-line/60 px-2 py-1.5 md:hidden">
          {/* The wordmark needs ~110px: shown only when the five 44px controls still fit beside it. */}
          <span className="min-[440px]:hidden">
            <Brand compact />
          </span>
          <span className="hidden min-[440px]:block">
            <Brand tagline={false} />
          </span>
          <div className="flex items-center gap-0.5">
            <Link href="/search" className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-2" aria-label={t("nav.search")}>
              <Search className="size-5" aria-hidden />
            </Link>
            <LanguageToggle compact />
            <Notifications />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-2"
              aria-label={t("nav.menu")}
              aria-expanded={drawerOpen}
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <main id="content" className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 md:pb-12 md:pt-6 lg:px-8">
          <StaleNotice />
          {children}
        </main>

        {/* Bottom navigation — phones */}
        {/* Opaque, so list text never shows through the labels; padded above the home indicator. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.5)] md:hidden" aria-label={t("nav.menu")}>
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => MOBILE_TABS.includes(n.href)).map(({ href, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-14 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-xs ${active ? "font-semibold text-accent" : "text-muted"}`}
                  >
                    <span className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="max-w-full truncate">{t(`tab.${href}` as I18nKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Drawer — phones */}
      <div className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label={t("nav.menu")} inert={!drawerOpen}>
        <button
          type="button"
          tabIndex={-1}
          className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          aria-label={t("nav.close")}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute inset-y-0 end-0 flex w-[300px] max-w-[86%] flex-col border-s border-line bg-sidebar p-4 shadow-lift transition-transform duration-200 ease-out ${
            drawerOpen ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Brand onNavigate={() => setDrawerOpen(false)} />
            <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2" aria-label={t("nav.close")}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mt-6 flex-1 overflow-y-auto">
            <NavLinks mode="full" onNavigate={() => setDrawerOpen(false)} />
          </div>
          <div className="space-y-3 pt-4">
            <ThemeSwitch />
            <StatusCard />
          </div>
        </div>
      </div>
    </div>
  );
}
