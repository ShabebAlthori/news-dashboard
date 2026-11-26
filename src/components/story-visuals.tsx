"use client";

import { Bookmark, Bot, BrainCircuit, BriefcaseBusiness, ChartColumn, CodeXml, Gamepad2, ShieldCheck, Sparkles, Star, TreePalm } from "lucide-react";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { saveStory } from "@/lib/client/actions";
import { PRIORITY_IDS, shortCategoryLabel, storyCategory } from "@/lib/shared/taxonomy";
import type { Lang, Prefs, Story } from "@/lib/shared/types";
import { useUi } from "./providers";

export const CATEGORY_ICONS: Record<string, typeof Star> = {
  all: Star,
  data: ChartColumn,
  ai: BrainCircuit,
  business: BriefcaseBusiness,
  dev: CodeXml,
  security: ShieldCheck,
  "hardware-gaming": Gamepad2,
  saudi: TreePalm,
  robotics: Bot,
};

/** Solid badge colours (white text ≥ 4.5:1) so badges stay legible on photos in both themes. */
const CATEGORY_TINTS: Record<string, { badge: string; art: [string, string] }> = {
  data: { badge: "#6a35f0", art: ["#3b1d9c", "#0e1233"] },
  ai: { badge: "#2563d9", art: ["#16418f", "#0b1030"] },
  business: { badge: "#a15c06", art: ["#6b3d08", "#140f1c"] },
  dev: { badge: "#0b7d6e", art: ["#0b5249", "#091526"] },
  security: { badge: "#c2304a", art: ["#7a1a2e", "#130c1d"] },
  "hardware-gaming": { badge: "#4a4fd8", art: ["#2b2f94", "#0c0f2c"] },
  saudi: { badge: "#0b7f52", art: ["#0b5338", "#0a1622"] },
  robotics: { badge: "#0a6f94", art: ["#0b4a63", "#0a1226"] },
  other: { badge: "#4b5372", art: ["#2a3052", "#0c0f22"] },
};

export function categoryTint(id: string | undefined) {
  return CATEGORY_TINTS[id ?? "other"] ?? CATEGORY_TINTS.other;
}

/** The story's category in the reader's priority order. */
export function useStoryCategory(story: Story): string | undefined {
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  return storyCategory(story.categories, prefs?.categoryOrder ?? PRIORITY_IDS, story.primaryCategory);
}

export function CategoryBadge({ id, className = "" }: { id: string | undefined; className?: string }) {
  const { lang } = useUi();
  if (!id) return null;
  const label = shortCategoryLabel(id)?.[lang];
  if (!label) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm ${className}`} style={{ background: categoryTint(id).badge }}>
      {label}
    </span>
  );
}

/** Abstract artwork for stories without a publisher image — never a stand-in photo. Varies by story. */
export function FallbackArt({ category, seed = 0, label, className = "" }: { category: string | undefined; seed?: number; label?: string; className?: string }) {
  const tint = categoryTint(category);
  const Icon = (category && CATEGORY_ICONS[category]) || Sparkles;
  const h = Math.abs(seed * 2654435761) % 1000;
  const x = 15 + (h % 70);
  const y = 5 + ((h >> 3) % 40);
  const grid = [22, 28, 34][h % 3];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `radial-gradient(120% 95% at ${x}% ${y}%, ${tint.art[0]} 0%, ${tint.art[1]} 72%)` }} aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: `${grid}px ${grid}px` }}
      />
      <div className="absolute -bottom-1/3 start-[-10%] size-2/3 rounded-full opacity-40 blur-2xl" style={{ background: tint.badge }} />
      <Icon className={`absolute top-1/2 size-[38%] max-h-28 max-w-28 -translate-y-1/2 text-white/25 ${h % 2 ? "end-[12%]" : "end-[30%]"}`} strokeWidth={1.25} />
      {label && (
        <span className="absolute start-4 top-3.5 max-w-[70%] truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55" dir="auto">
          {label}
        </span>
      )}
    </div>
  );
}

/** Publisher image (hotlinked, no referrer) with abstract art if it is missing or fails. */
export function StoryImage({ story, category, className = "", eager = false }: { story: Story; category: string | undefined; className?: string; eager?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  const show = (prefs?.showImages ?? true) && story.imageUrl && failedUrl !== story.imageUrl;
  if (!show) return <FallbackArt category={category} seed={story.id} label={story.source.name} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- publisher-hosted images from many domains
    <img
      src={story.imageUrl!}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(story.imageUrl)}
      className={`object-cover ${className}`}
    />
  );
}

/**
 * Shown when a headline or summary is not available in the reader's language yet, so the
 * other language is never shown silently. `tone="onImage"` for use over photos.
 */
export function OriginalLangTag({ langs, tone = "default", className = "" }: { langs: (Lang | null | undefined)[]; tone?: "default" | "onImage"; className?: string }) {
  const { t, lang } = useUi();
  if (!langs.some((l) => l && l !== lang)) return null;
  const tones = tone === "onImage" ? "border-white/25 bg-black/55 text-white/90 backdrop-blur" : "border-line bg-surface-2 text-muted";
  return (
    <span title={t("card.originalLangHint")} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${tones} ${className}`}>
      {t("card.originalLang")}
    </span>
  );
}

/** Bookmark toggle that stays in sync with fresh data. */
export function BookmarkButton({ story, className = "", tone = "default" }: { story: Story; className?: string; tone?: "default" | "onImage" }) {
  const { t } = useUi();
  const [saved, setSaved] = useState(story.saved);
  const [savedFor, setSavedFor] = useState(story.saved);
  if (savedFor !== story.saved) {
    setSavedFor(story.saved);
    setSaved(story.saved);
  }
  async function toggle() {
    const next = !saved;
    setSaved(next);
    const ok = await saveStory(story, next);
    if (!ok) setSaved(!next);
    await mutate((key) => typeof key === "string" && (key.includes("saved=1") || key.startsWith("/api/dashboard")));
  }
  const tones =
    tone === "onImage"
      ? "bg-black/45 text-white backdrop-blur hover:bg-black/60"
      : saved
        ? "text-accent hover:bg-accent-soft"
        : "text-muted hover:bg-surface-2 hover:text-fg";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? t("card.saved") : t("card.save")}
      title={saved ? t("card.saved") : t("card.save")}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${tones} ${className}`}
    >
      <Bookmark className={`size-[18px] ${saved ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}
