import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Providers, type ThemePref } from "@/components/providers";
import type { Lang } from "@/lib/shared/types";

export const metadata: Metadata = {
  title: "TechPulse",
  description: "TechPulse — a personal, bilingual (Arabic/English) technology, data and gaming news dashboard.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4fa" },
    { media: "(prefers-color-scheme: dark)", color: "#090b18" },
  ],
};

// Resolves the theme before first paint so there is no light/dark flash. Dark is the default.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):"dark";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

// Web edition: language (cookie, else the browser's language) and theme are applied before paint.
const STATIC_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var c=function(n){var m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):null};var l=c("lang");if(l!=="ar"&&l!=="en"){l=/^ar\\b/i.test(navigator.language||"")?"ar":"en"}d.lang=l;d.dir=l==="ar"?"rtl":"ltr";var t=c("theme")||"dark";d.classList.toggle("dark",t!=="light"&&(t!=="system"||window.matchMedia("(prefers-color-scheme: dark)").matches))}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  if (process.env.NEXT_PUBLIC_STATIC === "1") {
    return (
      <html lang="en" dir="ltr" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: STATIC_BOOT_SCRIPT }} />
        </head>
        <body className="min-h-dvh">
          <Providers initialLang={null} initialTheme="dark">
            <AppShell>{children}</AppShell>
          </Providers>
        </body>
      </html>
    );
  }

  const store = await cookies();
  const cookieLang = store.get("lang")?.value;
  let lang: Lang;
  if (cookieLang === "ar" || cookieLang === "en") {
    lang = cookieLang;
  } else {
    const accept = (await headers()).get("accept-language") ?? "";
    lang = /^\s*ar\b/i.test(accept) ? "ar" : "en";
  }
  const themeCookie = store.get("theme")?.value;
  const theme: ThemePref = themeCookie === "light" || themeCookie === "system" ? themeCookie : "dark";

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Providers initialLang={lang} initialTheme={theme}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
