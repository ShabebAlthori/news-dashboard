// Story clustering: groups articles from different outlets that report the same event.
import type Database from "better-sqlite3";
import { parseJsonArray } from "./db";
import { baseScore, combinedSignificance, coverageFactor, impactFactor, penaltyPoints } from "./scoring";
import { sourceById } from "./sources";

export const CLUSTER_WINDOW_MS = 36 * 3_600_000;
export const SIMILARITY_THRESHOLD = 0.42;

export interface ClusterCandidate {
  id: number;
  tokens: string[];
  companies: string[];
  time: number;
  clusterId: number | null;
  sourcePublisher: string;
}

export interface IdfMap {
  weights: Map<string, number>;
  /** Tokens at least this heavy count as "rare" (relative to corpus size). */
  rare: number;
  max: number;
}

export function buildIdf(docs: { tokens: string[] }[]): IdfMap {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  const weights = new Map<string, number>();
  for (const [t, f] of df) weights.set(t, Math.log(1 + n / f));
  // A token is "rare" when it appears in at most ~3% of documents (and never fewer than 3).
  const rare = Math.log(1 + n / Math.max(3, n * 0.03)) - 1e-9;
  return { weights, rare, max: Math.log(1 + n) };
}

/**
 * Weighted Dice similarity over headline tokens. Rare shared words (e.g. a product
 * name or a dollar amount) weigh much more than common ones ("gta", "6", "game").
 */
export function similarity(a: string[], b: string[], idf: IdfMap): number {
  if (!a.length || !b.length) return 0;
  const w = (t: string) => idf.weights.get(t) ?? idf.max;
  const setB = new Set(b);
  let shared = 0;
  let sharedCount = 0;
  let sharedRare = 0;
  let wa = 0;
  let wb = 0;
  for (const t of a) wa += w(t);
  for (const t of b) wb += w(t);
  for (const t of new Set(a)) {
    if (setB.has(t)) {
      const weight = w(t);
      shared += weight;
      sharedCount++;
      if (weight >= idf.rare) sharedRare++;
    }
  }
  if (sharedCount < 2 || sharedRare < 1) return 0;
  return (2 * shared) / (wa + wb);
}

export interface Assignment {
  articleId: number;
  clusterId: number | null; // null => create a new cluster
}

/**
 * Assign each new article to the cluster of its most similar recent article, or to
 * a new cluster. New articles are processed oldest-first so the earliest report
 * starts the cluster.
 */
export function assignClusters(
  existing: ClusterCandidate[],
  incoming: ClusterCandidate[],
  createCluster: (seed: ClusterCandidate) => number,
): Assignment[] {
  const pool = [...existing];
  const idf = buildIdf([...existing, ...incoming]);
  const results: Assignment[] = [];
  const sorted = [...incoming].sort((x, y) => x.time - y.time);
  for (const art of sorted) {
    let best: ClusterCandidate | null = null;
    let bestSim = 0;
    for (const other of pool) {
      if (other.clusterId == null) continue;
      if (Math.abs(other.time - art.time) > CLUSTER_WINDOW_MS) continue;
      const sim = similarity(art.tokens, other.tokens, idf);
      if (sim > bestSim) {
        bestSim = sim;
        best = other;
      }
    }
    let clusterId: number;
    if (best && bestSim >= SIMILARITY_THRESHOLD) {
      clusterId = best.clusterId!;
    } else {
      clusterId = createCluster(art);
    }
    art.clusterId = clusterId;
    pool.push(art);
    results.push({ articleId: art.id, clusterId });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cluster aggregate recomputation

interface MemberRow {
  id: number;
  source_id: string;
  title: string;
  excerpt: string;
  published_at: number | null;
  fetched_at: number;
  sections: string;
  categories: string;
  companies: string;
  event_type: string;
  significance: number;
  ai_significance: number | null;
  ai_status: string;
  rumor: number;
  policy: number;
  clickbait: number;
  excluded: number;
  image_url: string | null;
  primary_category: string | null;
}

function leadScore(m: MemberRow): number {
  const src = sourceById(m.source_id);
  let s = src?.credibility ?? 0.7;
  if (m.excerpt.length >= 120) s += 0.12;
  else if (m.excerpt.length < 40) s -= 0.15;
  if (src?.kind === "official") s += 0.04;
  if (m.image_url) s += 0.02;
  if (m.rumor) s -= 0.05;
  if (m.clickbait > 0) s -= 0.05 * m.clickbait;
  return s;
}

export function recomputeCluster(db: Database.Database, clusterId: number): void {
  const members = db
    .prepare(
      `SELECT id, source_id, title, excerpt, published_at, fetched_at, sections, categories, companies, event_type,
              significance, ai_significance, ai_status, rumor, policy, clickbait, excluded, image_url, primary_category
       FROM articles WHERE cluster_id = ?`,
    )
    .all(clusterId) as MemberRow[];
  const active = members.filter((m) => !m.excluded);
  if (active.length === 0) {
    db.prepare("UPDATE clusters SET excluded = 1, updated_at = ? WHERE id = ?").run(Date.now(), clusterId);
    return;
  }

  const current = db.prepare("SELECT lead_article_id FROM clusters WHERE id = ?").get(clusterId) as
    | { lead_article_id: number | null }
    | undefined;
  let lead = active.reduce((best, m) => (leadScore(m) > leadScore(best) ? m : best), active[0]);
  // Keep a lead that already has an AI summary unless a clearly better source appears.
  const currentLead = active.find((m) => m.id === current?.lead_article_id);
  if (currentLead && currentLead.ai_status === "done" && leadScore(lead) < leadScore(currentLead) + 0.1) lead = currentLead;

  const publishers = new Set(active.map((m) => sourceById(m.source_id)?.publisher ?? m.source_id));
  const credibility = Math.max(...active.map((m) => sourceById(m.source_id)?.credibility ?? 0.7));
  const hasOfficial = active.some((m) => sourceById(m.source_id)?.kind === "official");
  const times = active.map((m) => m.published_at).filter((t): t is number => t != null);
  const firstPublished = times.length ? Math.min(...times) : null;
  const lastPublished = times.length ? Math.max(...times) : null;
  const firstSeen = Math.min(...active.map((m) => m.fetched_at));

  const sigOf = (m: MemberRow) => combinedSignificance(m.significance, m.ai_significance);
  const strongest = active.reduce((best, m) => (sigOf(m) > sigOf(best) ? m : best), active[0]);
  // Significance: the lead's rating, nudged up when another outlet frames it as a bigger event.
  const significance = Math.min(1, Math.max(sigOf(lead), 0.5 * sigOf(lead) + 0.5 * sigOf(strongest)));
  // A cluster is a rumour only if every report is hedged.
  const rumor = active.every((m) => m.rumor === 1);
  const policy = lead.policy === 1;

  const union = (field: "sections" | "categories" | "companies") => {
    const counts = new Map<string, number>();
    for (const m of active) for (const v of parseJsonArray(m[field])) counts.set(v, (counts.get(v) ?? 0) + 1);
    const leadVals = parseJsonArray(lead[field]);
    return [...counts.entries()]
      .filter(([v, c]) => leadVals.includes(v) || c >= Math.max(2, Math.ceil(active.length * 0.4)))
      .sort((a, b) => b[1] - a[1])
      .map(([v]) => v);
  };
  const sections = union("sections");
  const categories = union("categories").slice(0, 4);
  const companies = union("companies").slice(0, 6);

  const eventType = sigOf(strongest) > sigOf(lead) + 0.1 ? strongest.event_type : lead.event_type;
  const penalties = penaltyPoints({
    rumor,
    eventType: lead.event_type as never,
    clickbait: lead.clickbait,
    headlineOnly: active.every((m) => m.excerpt.length < 40),
  });
  const base = baseScore({
    significance,
    coverage: coverageFactor(publishers.size),
    credibility,
    impact: impactFactor(companies, categories),
    penalties,
  });

  db.prepare(
    `UPDATE clusters SET lead_article_id = ?, first_published_at = ?, last_published_at = ?, sort_time = ?, first_seen_at = ?,
       updated_at = ?, article_count = ?, source_count = ?, sections = ?, categories = ?, companies = ?, event_type = ?,
       significance = ?, credibility = ?, has_official = ?, rumor = ?, policy = ?, penalties = ?, base_score = ?, excluded = 0,
       primary_category = ?
     WHERE id = ?`,
  ).run(
    lead.id,
    firstPublished,
    lastPublished,
    firstPublished ?? firstSeen,
    firstSeen,
    Date.now(),
    active.length,
    publishers.size,
    JSON.stringify(sections),
    JSON.stringify(categories),
    JSON.stringify(companies),
    eventType,
    significance,
    credibility,
    hasOfficial ? 1 : 0,
    rumor ? 1 : 0,
    policy ? 1 : 0,
    penalties,
    Math.round(base * 100) / 100,
    lead.primary_category ?? active.find((m) => m.primary_category)?.primary_category ?? null,
    clusterId,
  );
}
