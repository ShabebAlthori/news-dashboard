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

/**
 * Each category has one identifying colour, used only as a small mark next to its name (and to
 * tint the artwork of stories without a photo) — never as a filled badge.
 */
const CATEGORY_TINTS: Record<string, { mark: string }> = {
  data: { mark: "#8b72ff" },
  ai: { mark: "#65a6ff" },
  business: { mark: "#e3a857" },
  dev: { mark: "#45c2b1" },
  security: { mark: "#f2777a" },
  "hardware-gaming": { mark: "#e07bc4" },
  saudi: { mark: "#56d6a0" },
  robotics: { mark: "#4fc3e8" },
  other: { mark: "#9298a8" },
};

export function categoryTint(id: string | undefined) {
  return CATEGORY_TINTS[id ?? "other"] ?? CATEGORY_TINTS.other;
}

/** The story's category in the reader's priority order. */
export function useStoryCategory(story: Story): string | undefined {
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  return storyCategory(story.categories, prefs?.categoryOrder ?? PRIORITY_IDS, story.primaryCategory);
}

/** Category label: a small colour mark and the name. `tone="onImage"` for use over photos. */
export function CategoryBadge({ id, className = "", tone = "default" }: { id: string | undefined; className?: string; tone?: "default" | "onImage" }) {
  const { lang } = useUi();
  if (!id) return null;
  const label = shortCategoryLabel(id)?.[lang];
  if (!label) return null;
  const tones = tone === "onImage" ? "rounded-md bg-black/60 px-2 py-0.5 text-white" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tones} ${className}`}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: categoryTint(id).mark }} aria-hidden />
      {label}
    </span>
  );
}

/** Shown for stories without a publisher image — a quiet typographic tile, never a stand-in photo. */
export function FallbackArt({ category, seed = 0, label, className = "" }: { category: string | undefined; seed?: number; label?: string; className?: string }) {
  const Icon = (category && CATEGORY_ICONS[category]) || Sparkles;
  const h = Math.abs(seed * 2654435761) % 1000;
  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`} aria-hidden>
      <div
        className="absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)", backgroundSize: `${[16, 20, 24][h % 3]}px ${[16, 20, 24][h % 3]}px` }}
      />
      <span className="absolute start-0 top-0 h-full w-0.5" style={{ background: categoryTint(category).mark }} />
      <Icon className={`absolute top-1/2 size-[30%] max-h-20 max-w-20 -translate-y-1/2 text-subtle/60 ${h % 2 ? "end-[12%]" : "end-[24%]"}`} strokeWidth={1.25} />
      {label && (
        <span className="absolute start-4 top-3.5 max-w-[70%] truncate font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-subtle" dir="auto">
          {label}
        </span>
      )}
    </div>
  );
}

/** Whether a story's own photo should be shown (the reader can turn images off). */
export function useShowImage(story: Story): boolean {
  const { data: prefs } = useSWR<Prefs>("/api/settings");
  return (prefs?.showImages ?? true) && !!story.imageUrl;
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
      fetchPriority={eager ? "high" : undefined}
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
  const tones = tone === "onImage" ? "border-white/25 bg-black/60 text-white/90" : "border-line text-subtle";
  return (
    <span title={t("card.originalLangHint")} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium leading-4 ${tones} ${className}`}>
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
      ? "bg-black/55 text-white hover:bg-black/70"
      : saved
        ? "text-accent hover:bg-surface-2"
        : "text-subtle hover:bg-surface-2 hover:text-fg";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? t("card.saved") : t("card.save")}
      title={saved ? t("card.saved") : t("card.save")}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors ${tones} ${className}`}
    >
      <Bookmark className={`size-[18px] ${saved ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}
