// Prints category, section, company and cluster statistics plus 20 random stories with their
// tags, to review classification and duplicate merging quality.
//
//   npm run review:tags                                  # the published site (PAGES_URL or the default below)
//   npm run review:tags -- out/data/snapshot.json         # a local snapshot file
//   npm run review:tags -- <url-or-file> --seed 7 --n 30  # another random sample / size
import fs from "node:fs";
import { categoryLabel, companyById, PRIORITY_IDS, storyCategory } from "../src/lib/shared/taxonomy";
import type { Snapshot, SnapshotStory } from "../src/lib/shared/types";

const DEFAULT_URL = "https://shabebalthori.github.io/news-dashboard/data/snapshot.json";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function load(): Promise<Snapshot> {
  const input = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--")) ?? (process.env.PAGES_URL ? `${process.env.PAGES_URL.replace(/\/$/, "")}/data/snapshot.json` : DEFAULT_URL);
  if (/^https?:\/\//.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${input}`);
    return (await res.json()) as Snapshot;
  }
  return JSON.parse(fs.readFileSync(input, "utf8")) as Snapshot;
}

function pct(n: number, total: number) {
  return `${String(n).padStart(4)}  ${((100 * n) / Math.max(1, total)).toFixed(1).padStart(5)}%`;
}

function table(title: string, counts: Map<string, number>, total: number, label: (k: string) => string = (k) => k) {
  console.log(`\n${title}`);
  for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${label(k).padEnd(34)} ${pct(n, total)}`);
}

function count<T>(items: T[], keys: (t: T) => string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) for (const k of new Set(keys(it))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

// Small seeded PRNG so a sample can be reproduced.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

async function main() {
  const snap = await load();
  const stories = snap.stories;
  const total = stories.length;
  const day = stories.filter((s) => s.sortTime >= Date.parse(snap.generatedAt) - 24 * 3_600_000);
  const primary = (s: SnapshotStory) => storyCategory(s.categories, PRIORITY_IDS, s.primaryCategory) ?? "(none)";
  const label = (id: string) => categoryLabel(id)?.en ?? id;

  console.log(`Snapshot ${snap.generatedAt} — ${total} stories (${day.length} in the last 24 hours)`);
  const ai = stories.filter((s) => s.primaryCategory).length;
  console.log(`Classified by AI: ${pct(ai, total)}   AI summaries: ${pct(stories.filter((s) => s.summary.origin === "ai").length, total)}`);
  const arabicTitles = stories.filter((s) => s.lang !== "ar" && s.title.ar).length;
  const englishTitles = stories.filter((s) => s.lang === "ar" && s.title.en !== s.title.original).length;
  console.log(`Headlines translated: EN→AR ${arabicTitles}/${stories.filter((s) => s.lang !== "ar").length}, AR→EN ${englishTitles}/${stories.filter((s) => s.lang === "ar").length}`);

  table("Primary category (all stories)", count(stories, (s) => [primary(s)]), total, label);
  table("Primary category (last 24 hours)", count(day, (s) => [primary(s)]), day.length, label);
  table("Sections (a story can have several)", count(stories, (s) => s.sections), total);
  table("Event types", count(stories, (s) => [s.eventType]), total);
  table("Companies (top 15)", new Map([...count(stories, (s) => s.companies).entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)), total, (id) => companyById(id)?.en ?? id);

  console.log("\nClusters");
  const bySize = count(stories, (s) => [s.sourceCount >= 4 ? "4+ publishers" : `${s.sourceCount} publisher${s.sourceCount > 1 ? "s" : ""}`]);
  for (const [k, n] of [...bySize.entries()].sort()) console.log(`  ${k.padEnd(34)} ${pct(n, total)}`);
  const multilingual = stories.filter((s) => s.coverage.some((c) => (c.lang ?? "en") !== s.lang));
  console.log(`  ${"mixing Arabic and English".padEnd(34)} ${pct(multilingual.length, total)}`);
  for (const s of [...stories].sort((a, b) => b.coverage.length - a.coverage.length).slice(0, 3)) {
    console.log(`  largest: ${s.coverage.length + 1} articles — ${s.title.original.slice(0, 80)}`);
  }

  const n = Number(arg("n") ?? 20);
  const random = rng(Number(arg("seed") ?? Date.now() % 100000));
  const sample = [...stories].sort(() => random() - 0.5).slice(0, n);
  console.log(`\n${n} random stories (seed ${arg("seed") ?? "random"}):`);
  for (const s of sample) {
    console.log(`\n• ${s.title.original.slice(0, 110)}`);
    if (s.title.ar && s.lang !== "ar") console.log(`  AR: ${s.title.ar.slice(0, 110)}`);
    if (s.lang === "ar" && s.title.en !== s.title.original) console.log(`  EN: ${s.title.en.slice(0, 110)}`);
    console.log(
      `  ${s.source.name} · primary: ${label(primary(s))}${s.primaryCategory ? " (AI)" : " (rules)"} · topics: ${s.categories.join(", ") || "—"} · sections: ${s.sections.join(", ")}`,
    );
    console.log(`  companies: ${s.companies.join(", ") || "—"} · event: ${s.eventType} · publishers: ${s.sourceCount}${s.coverage.length ? ` · also: ${s.coverage.map((c) => c.sourceName).join(", ")}` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
