"use client";

import { Bell, Bookmark, CalendarDays, ListOrdered, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import { markRead } from "@/lib/client/actions";
import { IS_STATIC } from "@/lib/client/mode";
import { formatRelative } from "@/lib/shared/format";
import type { StoriesResponse, Story } from "@/lib/shared/types";
import { useNow, useUi } from "./providers";
import { storyHeadline } from "./story-text";

/** Dropdown anchored to its trigger; closes on outside click, Escape and navigation. */
export function Popover({
  label,
  trigger,
  children,
  badge,
  onOpenChange,
  width = "w-[340px]",
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  badge?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }
  const set = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => set(!open)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative inline-flex size-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 ${open ? "bg-surface-2" : ""}`}
      >
        {trigger}
        {badge}
      </button>
      <div
        role="dialog"
        aria-label={label}
        inert={!open}
        className={`absolute end-0 top-12 z-50 ${width} max-w-[calc(100vw-24px)] max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-w-none origin-top rounded-2xl border border-line bg-surface p-2 shadow-lift transition duration-150 ease-out rtl:origin-top-left ltr:origin-top-right ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        {children(() => set(false))}
      </div>
    </div>
  );
}

/** Bilingual search: Arabic or English, submitted to the search page. */
export function SearchBox({ className = "" }: { className?: string }) {
  const { t } = useUi();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlQuery = pathname === "/search" ? (sp.get("q") ?? "") : "";
  const [value, setValue] = useState(urlQuery);
  const [last, setLast] = useState(urlQuery);
  if (urlQuery !== last) {
    setLast(urlQuery);
    setValue(urlQuery);
  }
  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        {t("top.searchLabel")}
      </label>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-subtle" aria-hidden />
      <input
        id="global-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("top.search")}
        autoComplete="off"
        dir="auto"
        className="h-11 w-full rounded-full border border-line bg-surface pe-4 ps-11 text-[15px] text-fg shadow-card transition-colors placeholder:text-subtle hover:border-line-strong focus:border-accent focus:outline-none"
      />
    </form>
  );
}

// "Seen" time for notifications, kept in this browser.
const SEEN_KEY = "techpulse.alertsSeenAt";
const seenListeners = new Set<() => void>();
function readSeen(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeSeen(t: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(t));
  } catch {
    // storage unavailable: the badge simply resets next visit
  }
  for (const l of seenListeners) l();
}
function subscribeSeen(l: () => void) {
  seenListeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    seenListeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

const storyTime = (s: Story) => Date.parse(s.publishedAt ?? s.fetchedAt);

/** Alerts: breaking and major stories of the last 24 hours, newest first. */
export function Notifications() {
  const { t, lang } = useUi();
  const now = useNow(300_000);
  const from = Math.floor(now / 300_000) * 300_000 - 24 * 3_600_000;
  const { data } = useSWR<StoriesResponse>(`/api/stories?from=${from}&sort=importance&limit=24`, { refreshInterval: 300_000 });
  const seen = useSyncExternalStore(subscribeSeen, readSeen, () => Number.POSITIVE_INFINITY);
  const [seenWhenOpened, setSeenWhenOpened] = useState<number | null>(null);
  const alerts = (data?.stories ?? [])
    .filter((s) => s.breaking || s.tier === "major")
    .slice(0, 8)
    .sort((a, b) => storyTime(b) - storyTime(a));
  const unseen = alerts.filter((s) => storyTime(s) > seen).length;

  return (
    <Popover
      label={t("top.notifications")}
      width="w-[380px]"
      onOpenChange={(open) => {
        if (open) {
          setSeenWhenOpened(seen);
          writeSeen(Date.now());
        }
      }}
      trigger={<Bell className="size-5" aria-hidden />}
      badge={
        unseen > 0 ? (
          <span className="absolute end-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-bg">
            <span className="sr-only">{t("top.notifNew", { n: unseen })}</span>
            <span aria-hidden>{unseen}</span>
          </span>
        ) : null
      }
    >
      {() => (
        <div>
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="font-semibold text-fg">{t("top.notifications")}</p>
            <p className="text-xs text-muted">{t("top.notifHint")}</p>
          </div>
          {alerts.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-sm text-muted">{t("top.notifEmpty")}</p>
          ) : (
            <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
              {alerts.map((s) => {
                const h = storyHeadline(s, lang);
                const fresh = seenWhenOpened !== null && storyTime(s) > seenWhenOpened;
                return (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markRead(s.leadArticleId, s.url)}
                      className="flex gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-2"
                    >
                      <span className={`mt-2 size-2 shrink-0 rounded-full ${s.breaking ? "bg-breaking" : fresh ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
                      <span className="min-w-0">
                        <span lang={h.lang} dir={h.lang === "ar" ? "rtl" : "ltr"} className="line-clamp-2 block text-sm font-medium leading-snug text-fg">
                          {h.text}
                        </span>
                        <span className="mt-0.5 block text-xs text-subtle">
                          {s.breaking && <span className="font-semibold text-breaking">{t("card.breaking")} · </span>}
                          <span dir="auto">{s.source.name}</span>
                          {s.publishedAt && <> · {formatRelative(s.publishedAt, lang, now)}</>}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

/** There are no accounts: the profile menu explains where the reader's data lives. */
export function ProfileMenu() {
  const { t } = useUi();
  const links = [
    { href: "/settings", label: t("nav.settings"), icon: Settings },
    { href: "/settings#categories", label: t("settings.categories"), icon: ListOrdered },
    { href: "/saved", label: t("nav.saved"), icon: Bookmark },
    { href: "/report", label: t("nav.report"), icon: CalendarDays },
  ];
  return (
    <Popover
      label={t("top.profile")}
      width="w-[300px]"
      trigger={
        <span className="inline-flex size-9 items-center justify-center rounded-full brand-gradient text-white shadow-sm">
          <UserRound className="size-5" aria-hidden />
        </span>
      }
    >
      {(close) => (
        <div>
          <div className="px-2.5 pb-2.5 pt-1.5">
            <p className="font-semibold text-fg">{t("top.profileTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">{IS_STATIC ? t("top.profileNoteStatic") : t("top.profileNoteServer")}</p>
          </div>
          <ul className="border-t border-line pt-1.5">
            {links.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={close} className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-fg transition-colors hover:bg-surface-2">
                  <Icon className="size-4 text-muted" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}
