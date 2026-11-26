// Merges stories that report the same event but were not grouped by the word-overlap
// clustering — typically the Arabic and English versions of a story, or the same news told
// with different words. Uses multilingual embeddings of each story's headline and lead.
import type Database from "better-sqlite3";
import { cosine, embeddingsAvailable, embedTexts, fromBlob, toBlob } from "./ai/embeddings";
import { recomputeCluster } from "./cluster";
import { config } from "./config";
import { sourceById } from "./sources";

const HOUR = 3_600_000;
const WINDOW_HOURS = 48;
const MAX_TIME_GAP_HOURS = 36;
const MAX_REQUESTS = 3;

interface LeadRow {
  cluster_id: number;
  sort_time: number;
  article_count: number;
  article_id: number;
  source_id: string;
  title: string;
  excerpt: string;
  embedding: Buffer | null;
}

export interface MergeResult {
  embedded: number;
  merged: number;
  /** Pairs that were merged (for the run log). */
  pairs: { a: string; b: string; similarity: number }[];
  /** Closest pairs that stayed apart (helps tune EMBED_MERGE_THRESHOLD). */
  nearMisses: { a: string; b: string; similarity: number }[];
  skipped?: string;
}

/** Pairs to merge: different publishers, close in time, similarity at or above the threshold. */
export function similarPairs(
  items: { id: number; publisher: string; time: number; vector: Float32Array }[],
  threshold: number,
): { a: number; b: number; similarity: number }[] {
  const out: { a: number; b: number; similarity: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i];
      const y = items[j];
      if (x.publisher === y.publisher) continue;
      if (Math.abs(x.time - y.time) > MAX_TIME_GAP_HOURS * HOUR) continue;
      const similarity = cosine(x.vector, y.vector);
      if (similarity >= threshold) out.push({ a: x.id, b: y.id, similarity });
    }
  }
  return out;
}

export async function mergeDuplicateStories(db: Database.Database, now = Date.now()): Promise<MergeResult> {
  const result: MergeResult = { embedded: 0, merged: 0, pairs: [], nearMisses: [] };
  if (!embeddingsAvailable()) return { ...result, skipped: "no embedding provider (needs GEMINI_API_KEY)" };

  const leads = db
    .prepare(
      `SELECT c.id AS cluster_id, c.sort_time, c.article_count, a.id AS article_id, a.source_id, a.title, a.excerpt, a.embedding
       FROM clusters c JOIN articles a ON a.id = c.lead_article_id
       WHERE c.excluded = 0 AND c.sort_time > ?`,
    )
    .all(now - WINDOW_HOURS * HOUR) as LeadRow[];

  // Embed leads that have no vector yet (headline + start of the lead paragraph).
  const missing = leads.filter((l) => !l.embedding);
  const store = db.prepare("UPDATE articles SET embedding = ? WHERE id = ?");
  for (let i = 0, requests = 0; i < missing.length && requests < MAX_REQUESTS; i += 100, requests++) {
    const chunk = missing.slice(i, i + 100);
    const vectors = await embedTexts(chunk.map((l) => `${l.title}\n${l.excerpt.slice(0, 300)}`));
    db.transaction(() => {
      chunk.forEach((l, k) => {
        l.embedding = toBlob(vectors[k]);
        store.run(l.embedding, l.article_id);
      });
    })();
    result.embedded += chunk.length;
  }

  const items = leads
    .filter((l) => l.embedding)
    .map((l) => ({ id: l.cluster_id, publisher: sourceById(l.source_id)?.publisher ?? l.source_id, time: l.sort_time, vector: fromBlob(l.embedding!) }));
  const byId = new Map(leads.map((l) => [l.cluster_id, l]));
  const pairs = similarPairs(items, config.ai.mergeThreshold);
  result.nearMisses = similarPairs(items, config.ai.mergeThreshold - 0.06)
    .filter((p) => p.similarity < config.ai.mergeThreshold)
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, 5)
    .map((p) => ({ a: byId.get(p.a)!.title.slice(0, 70), b: byId.get(p.b)!.title.slice(0, 70), similarity: Math.round(p.similarity * 1000) / 1000 }));
  if (!pairs.length) return result;

  // Union-find over clusters; each group keeps its largest (then oldest) cluster.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const p of pairs.sort((x, y) => y.similarity - x.similarity)) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra !== rb) parent.set(rb, ra);
    result.pairs.push({ a: byId.get(p.a)!.title.slice(0, 70), b: byId.get(p.b)!.title.slice(0, 70), similarity: Math.round(p.similarity * 1000) / 1000 });
  }
  const groups = new Map<number, number[]>();
  for (const id of new Set(pairs.flatMap((p) => [p.a, p.b]))) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const move = db.prepare("UPDATE articles SET cluster_id = ? WHERE cluster_id = ?");
  const drop = db.prepare("DELETE FROM clusters WHERE id = ?");
  db.transaction(() => {
    for (const ids of groups.values()) {
      const keep = [...ids].sort((x, y) => byId.get(y)!.article_count - byId.get(x)!.article_count || byId.get(x)!.sort_time - byId.get(y)!.sort_time)[0];
      for (const id of ids) {
        if (id === keep) continue;
        move.run(keep, id);
        drop.run(id);
        result.merged++;
      }
      recomputeCluster(db, keep);
    }
  })();
  return result;
}
