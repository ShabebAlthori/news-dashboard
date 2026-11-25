// Search helpers shared by the server (SQLite FTS) and the web edition (in-browser search).
import { COMPANIES } from "./taxonomy";

// Arabic search terms that should also match English source text.
const ARABIC_SYNONYMS: Record<string, string[]> = {
  ...Object.fromEntries(
    COMPANIES.filter((c) => /[؀-ۿ]/.test(c.ar)).flatMap((c) => c.ar.split(/\s*\/\s*/).map((ar) => [ar, [c.en.split(" ")[0]]])),
  ),
  غوغل: ["Google"],
  أبل: ["Apple"],
  انفيديا: ["Nvidia"],
  ذكاء: ["AI"],
  الذكاء: ["AI"],
  ألعاب: ["game"],
  الألعاب: ["game"],
  لعبة: ["game"],
  هاتف: ["phone"],
  معالج: ["processor", "CPU"],
  رقاقات: ["chip"],
  اختراق: ["hack", "breach"],
  ثغرة: ["vulnerability", "flaw"],
  استحواذ: ["acquire", "acquisition"],
  تسريح: ["layoffs"],
  أرباح: ["earnings"],
};

/** Split a query into terms; each term is a list of alternatives (the term plus synonyms). */
export function searchTerms(input: string): string[][] {
  return input
    .normalize("NFKC")
    .split(/\s+/)
    .map((t) => t.replace(/["*^():{}[\]\\]/g, "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 8)
    .map((t) => {
      const synonyms = ARABIC_SYNONYMS[t] ?? ARABIC_SYNONYMS[t.replace(/^ال/, "")];
      return synonyms ? [t, ...synonyms] : [t];
    });
}

/** Lowercase, strip Arabic diacritics/tatweel and Latin accents, for in-browser matching. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

/** True when every term (or one of its synonyms) starts a word somewhere in the text. */
export function matchesSearch(text: string, terms: string[][]): boolean {
  if (!terms.length) return true;
  const haystack = ` ${normalizeForSearch(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return terms.every((alternatives) =>
    alternatives.some((alt) => {
      const needle = normalizeForSearch(alt).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return needle.length > 0 && haystack.includes(` ${needle}`);
    }),
  );
}
