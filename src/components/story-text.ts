// Which headline/summary to show for a story in the reader's language, and in which
// language that text actually is (stories from Arabic sources start out Arabic-only).
import type { Lang, Story } from "@/lib/shared/types";

export function storyHeadline(story: Story, view: Lang): { text: string; lang: Lang } {
  const original: Lang = story.lang ?? "en";
  if (view === "ar") return story.title.ar ? { text: story.title.ar, lang: "ar" } : { text: story.title.original, lang: original };
  // An Arabic-source story without an English translation yet keeps its Arabic headline.
  if (original === "ar" && story.title.en === story.title.original) return { text: story.title.original, lang: "ar" };
  return { text: story.title.en, lang: "en" };
}

export function storySummary(
  story: Story,
  view: Lang,
): { text: string; lang: Lang; note: "arUnavailable" | "enUnavailable" | null } | null {
  const { en, ar } = story.summary;
  if (view === "ar") {
    if (ar) return { text: ar, lang: "ar", note: null };
    if (en) return { text: en, lang: "en", note: "arUnavailable" };
    return null;
  }
  if (en) return { text: en, lang: "en", note: null };
  if (ar) return { text: ar, lang: "ar", note: "enUnavailable" };
  return null;
}
