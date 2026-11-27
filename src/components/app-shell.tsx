"use client";

import { Bookmark, Building2, CalendarDays, ChartNoAxesColumn, House, Menu, Search, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { I18nKey } from "@/lib/shared/i18n";
import { PRIORITY_IDS, shortCategoryLabel } from "@/lib/shared/taxonomy";
import { Brand } from "./brand";
import { LanguageToggle, ThemeButton, ThemeSwitch } from "./controls";
import { useUi } from "./providers";
import { StaleNotice, StatusCard, StatusPill } from "./status-indicator";
import { IS_STATIC, BASE_PATH } from "@/lib/client/mode";
import { Notifications, ProfileMenu, SearchBox } from "./top-bar";

type NavItem = { href: string; key: I18nKey; icon: typeof House };

/** Primary destinations (header on desktop, drawer on smaller screens). */
const PRIMARY: NavItem[] = [
  { href: "/", key: "nav.dashboard", icon: House },
  { href: "/latest", key: "nav.latest", icon: Zap },
  { href: "/radar", key: "nav.radar", icon: ChartNoAxesColumn },
  { href: "/companies", key: "nav.companies", icon: Building2 },
  { href: "/report", key: "nav.report", icon: CalendarDays },
  { href: "/saved", key: "nav.saved", icon: Bookmark },
];

/** Everything else (drawer and footer). */
const SECONDARY: { href: string; key: I18nKey }[] = [
  { href: "/technology", key: "nav.technology" },
  { href: "/gaming", key: "nav.gaming" },
  { href: "/stocks", key: "nav.stocks" },
  { href: "/search", key: "nav.search" },
  { href: "/settings", key: "nav.settings" },
];

/** Bottom tabs on phones. */
const TABS: { href: string; icon: typeof House }[] = [
  { href: "/", icon: House },
  { href: "/latest", icon: Zap },
  { href: "/radar", icon: ChartNoAxesColumn },
  { href: "/companies", icon: Building2 },
  { href: "/saved", icon: Bookmark },
];

export const categoryHref = (id: string) => `/category/${id}`;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop primary navigation: quiet text links, the current page on a subtle surface. */
function PrimaryNav() {
  const pathname = usePathname();
  const { t } = useUi();
  return (
    <nav aria-label={t("nav.primary")} className="hidden lg:block">
      <ul className="flex items-center">
        {PRIMARY.map(({ href, key }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} title={t(key)} className="group inline-flex h-11 items-center px-0.5">
                <span
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active ? "bg-surface-2 font-medium text-fg" : "text-muted group-hover:text-fg"
                  }`}
                >
                  {t(`tab.${href}` as I18nKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The eight categories, each with its own page. Scrolls sideways on small screens. */
function CategoryNav() {
  const pathname = usePathname();
  const { t, lang } = useUi();
  return (
    <nav aria-label={t("nav.categories")} className="border-b border-line">
      <div className="no-scrollbar mx-auto max-w-[1320px] overflow-x-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex w-max items-center gap-1 sm:gap-2">
          {PRIORITY_IDS.map((id) => {
            const href = categoryHref(id);
            const active = isActive(pathname, href);
            return (
              <li key={id}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex h-11 items-center whitespace-nowrap px-2 text-[13.5px] transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] ${
                    active ? "font-medium text-fg after:bg-accent" : "text-muted hover:text-fg after:bg-transparent"
                  }`}
                >
                  {shortCategoryLabel(id)?.[lang] ?? id}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function SearchFallback() {
  return <div className="h-10 w-full rounded-lg border border-line bg-surface" aria-hidden />;
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label={label} title={label}>
      {children}
    </Link>
  );
}

function Footer() {
  const { t, lang } = useUi();
  const heading = "mb-3 text-sm font-medium text-fg";
  const link = "inline-flex min-h-9 items-center text-sm text-muted transition-colors hover:text-fg";
  return (
    <footer className="mt-16 border-t border-line bg-bg-2">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <div className="max-w-sm space-y-4">
          <Brand tagline={false} />
          <p className="text-sm leading-relaxed text-muted">{t("footer.tagline")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeSwitch />
          </div>
        </div>
        <div>
          <h2 className={heading}>{t("footer.read")}</h2>
          <ul>
            {[...PRIMARY.slice(1, 5), ...SECONDARY.slice(0, 3)].map(({ href, key }) => (
              <li key={href}>
                <Link href={href} className={link}>
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>{t("nav.categories")}</h2>
          <ul>
            {PRIORITY_IDS.map((id) => (
              <li key={id}>
                <Link href={categoryHref(id)} className={link}>
                  {shortCategoryLabel(id)?.[lang] ?? id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>{t("footer.you")}</h2>
          <ul>
            {[PRIMARY[5], ...SECONDARY.slice(3)].map(({ href, key }) => (
              <li key={href}>
                <Link href={href} className={link}>
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1320px] px-4 py-5 text-xs text-subtle sm:px-6 lg:px-8">{t("footer.note")}</p>
      </div>
    </footer>
  );
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
    <div className="flex min-h-dvh flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t("nav.skip")}
      </a>

      {/* Header: one compact row, sticky. */}
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-2 sm:px-4 md:h-[60px] lg:gap-4 lg:px-8">
          <span className="ps-1 sm:ps-0">
            <Brand tagline={false} />
          </span>
          <PrimaryNav />
          <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
            <Suspense fallback={<SearchFallback />}>
              <SearchBox className="hidden w-[220px] xl:block 2xl:w-[280px]" />
            </Suspense>
            <span className="xl:hidden">
              <IconLink href="/search" label={t("nav.search")}>
                <Search className="size-[18px]" aria-hidden />
              </IconLink>
            </span>
            <span className="hidden lg:block">
              <StatusPill />
            </span>
            <LanguageToggle compact />
            <span className="hidden md:block">
              <ThemeButton />
            </span>
            <Notifications />
            <span className="hidden md:block">
              <ProfileMenu />
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-fg hover:bg-surface-2 lg:hidden"
              aria-label={t("nav.menu")}
              aria-expanded={drawerOpen}
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <CategoryNav />

      <main id="content" className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-10 pt-5 sm:px-6 md:pt-8 lg:px-8">
        <StaleNotice />
        {children}
      </main>

      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <Footer />
      </div>

      {/* Bottom tabs — phones. Opaque, padded above the home indicator. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg-2 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t("nav.tabs")}>
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11.5px] leading-none ${active ? "font-medium text-fg" : "text-subtle"}`}
                >
                  <Icon className={`size-5 ${active ? "text-accent" : ""}`} aria-hidden />
                  <span className="max-w-full truncate">{t(`tab.${href}` as I18nKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Drawer — below the desktop breakpoint. */}
      <div className={`fixed inset-0 z-40 overflow-hidden lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label={t("nav.menu")} inert={!drawerOpen}>
        <button
          type="button"
          tabIndex={-1}
          className={`absolute inset-0 bg-[var(--scrim)] transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          aria-label={t("nav.close")}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute inset-y-0 end-0 flex w-[320px] max-w-[88%] flex-col border-s border-line bg-bg-2 transition-transform duration-200 ease-out ${
            drawerOpen ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full"
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <Brand tagline={false} onNavigate={() => setDrawerOpen(false)} />
            <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2" aria-label={t("nav.close")}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            <nav aria-label={t("nav.primary")}>
              <ul>
                {PRIMARY.map(({ href, key, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setDrawerOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] ${active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
                      >
                        <Icon className={`size-[18px] ${active ? "text-accent" : ""}`} aria-hidden />
                        {t(key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div>
              <p className="eyebrow px-3 pb-2">{t("footer.more")}</p>
              <ul>
                {SECONDARY.map(({ href, key }) => (
                  <li key={href}>
                    <Link href={href} onClick={() => setDrawerOpen(false)} className="flex h-11 items-center rounded-lg px-3 text-[15px] text-muted hover:bg-surface-2 hover:text-fg">
                      {t(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="space-y-3 border-t border-line p-4">
            <ThemeSwitch />
            <StatusCard />
          </div>
        </div>
      </div>
    </div>
  );
}
