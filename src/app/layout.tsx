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
  title: "Briefing · الموجز",
  description: "A personal, bilingual technology and gaming news dashboard.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
};

// Resolves "system" before first paint so there is no light/dark flash.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):"system";var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
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
  const theme: ThemePref = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

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
