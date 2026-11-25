import { describe, expect, it } from "vitest";
import { assignClusters, buildIdf, similarity, type ClusterCandidate } from "@/lib/server/cluster";
import { baseScore, combinedSignificance, coverageFactor, finalScore, isBreaking } from "@/lib/server/scoring";
import { tokenize } from "@/lib/server/text";

const HOUR = 3_600_000;
const doc = (id: number, title: string, time: number): ClusterCandidate => ({
  id,
  tokens: tokenize(title),
  companies: [],
  time,
  clusterId: null,
  sourcePublisher: `p${id}`,
});

describe("clustering", () => {
  const t0 = Date.UTC(2026, 10, 24, 12);
  const corpus = [
    doc(1, "NVIDIA Board Reinstates Jensen Huang as President and CEO", t0),
    doc(2, "Jensen Huang reinstated as Nvidia CEO following board review", t0 + HOUR),
    doc(3, "Nvidia reinstates Jensen Huang as chief executive", t0 + 2 * HOUR),
    doc(4, "GTA 6 first patch fixes progression bug on PS5", t0),
    doc(5, "GTA 6 modders get the game running on PC", t0 + HOUR),
    doc(6, "Ubisoft lays off 166 staff in Montreal studios", t0),
  ];

  it("groups reports of the same event and keeps different stories apart", () => {
    let next = 100;
    const result = assignClusters([], corpus.map((d) => ({ ...d })), () => next++);
    const clusterOf = (id: number) => result.find((r) => r.articleId === id)!.clusterId;
    expect(clusterOf(2)).toBe(clusterOf(1));
    expect(clusterOf(3)).toBe(clusterOf(1));
    expect(clusterOf(4)).not.toBe(clusterOf(5)); // both about GTA 6, but different news
    expect(clusterOf(6)).not.toBe(clusterOf(1));
  });

  it("does not merge stories far apart in time", () => {
    let next = 1;
    const result = assignClusters([], [doc(1, "Apple unveils M6 MacBook Pro", t0), doc(2, "Apple unveils M6 MacBook Pro", t0 + 72 * HOUR)], () => next++);
    expect(result[0].clusterId).not.toBe(result[1].clusterId);
  });

  it("requires a rare shared token", () => {
    const idf = buildIdf(corpus);
    expect(similarity(tokenize("GTA 6 patch"), tokenize("GTA 6 sales"), idf)).toBeLessThan(0.42);
  });
});

describe("importance", () => {
  it("rewards independent coverage", () => {
    expect(coverageFactor(1)).toBe(0);
    expect(coverageFactor(3)).toBeGreaterThan(coverageFactor(2));
    expect(coverageFactor(9)).toBe(1);
  });

  it("produces bounded scores", () => {
    const top = finalScore(baseScore({ significance: 1, coverage: 1, credibility: 1, impact: 1, penalties: 0 }), 1);
    const low = finalScore(baseScore({ significance: 0.1, coverage: 0, credibility: 0.7, impact: 0.3, penalties: 20 }), 0.25);
    expect(top).toBe(100);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThan(30);
  });

  it("only labels fresh, confirmed, widely reported major stories as breaking", () => {
    const now = Date.now();
    const base = { firstPublishedAt: now - 2 * HOUR, now, sourceCount: 4, significance: 0.85, rumor: false, score: 85 };
    expect(isBreaking(base)).toBe(true);
    expect(isBreaking({ ...base, sourceCount: 2 })).toBe(false);
    expect(isBreaking({ ...base, rumor: true })).toBe(false);
    expect(isBreaking({ ...base, firstPublishedAt: now - 9 * HOUR })).toBe(false);
    expect(isBreaking({ ...base, significance: 0.5 })).toBe(false);
    expect(isBreaking({ ...base, firstPublishedAt: null })).toBe(false);
  });

  it("blends an AI rating with the rule-based significance", () => {
    expect(combinedSignificance(0.6, null)).toBe(0.6);
    expect(combinedSignificance(0.6, 5)).toBe(0.8);
    expect(combinedSignificance(0.6, 1)).toBe(0.3);
  });
});
