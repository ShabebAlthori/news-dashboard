// Reader preferences: defaults and migration of older saved preferences.
import { CATEGORY_IDS, INTEREST_IDS, PRIORITY_IDS, groupOfTopic } from "./taxonomy";
import type { Prefs } from "./types";

/** Categories added after the first release; switched on for readers who saved settings earlier. */
const ADDED_IN_V2 = ["data", "saudi", "robotics"];

/**
 * Bring stored preferences up to date without losing the reader's choices:
 * - old topic-level interests are mapped to their priority category,
 * - a missing or partial priority order is completed in the default order,
 * - categories that did not exist yet are switched on.
 */
export function normalizePrefs(p: Prefs): Prefs {
  const legacy = !Array.isArray(p.categoryOrder) || p.categoryOrder.length === 0;
  const interests = new Set<string>();
  for (const id of p.interests ?? []) {
    if (INTEREST_IDS.includes(id)) interests.add(id);
    else if (CATEGORY_IDS.includes(id)) interests.add(groupOfTopic(id));
  }
  if (legacy) for (const id of ADDED_IN_V2) interests.add(id);
  if (!p.interests || p.interests.length === 0) for (const id of INTEREST_IDS) interests.add(id);

  const order = (p.categoryOrder ?? []).filter((id, i, all) => PRIORITY_IDS.includes(id) && all.indexOf(id) === i);
  for (const id of PRIORITY_IDS) if (!order.includes(id)) order.push(id);

  return { ...p, interests: INTEREST_IDS.filter((id) => interests.has(id)), categoryOrder: order };
}
