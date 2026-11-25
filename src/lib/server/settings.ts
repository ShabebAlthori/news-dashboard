import { z } from "zod/v4";
import { normalizePrefs } from "@/lib/shared/prefs";
import { COMPANIES, COMPANY_IDS, INTEREST_IDS, PRIORITY_IDS } from "@/lib/shared/taxonomy";
import { DEFAULT_PREFS, type Prefs } from "@/lib/shared/types";
import { config } from "./config";
import { getDb } from "./db";

export function getSetting<T>(key: string): T | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export const PrefsSchema = z.object({
  interests: z.array(z.enum(INTEREST_IDS as [string, ...string[]])).max(INTEREST_IDS.length),
  categoryOrder: z.array(z.enum(PRIORITY_IDS as [string, ...string[]])).max(PRIORITY_IDS.length),
  followedCompanies: z.array(z.enum(COMPANY_IDS as [string, ...string[]])).max(COMPANY_IDS.length),
  showReviews: z.boolean(),
  includeTechPolicy: z.boolean(),
  showImages: z.boolean(),
  refreshMinutes: z.number().int().min(10).max(15),
  retentionDays: z.number().int().min(3).max(365),
});

export function defaultPrefs(): Prefs {
  return {
    ...DEFAULT_PREFS,
    interests: [...INTEREST_IDS],
    categoryOrder: [...PRIORITY_IDS],
    followedCompanies: COMPANIES.filter((c) => c.core).map((c) => c.id),
    refreshMinutes: config.refreshMinutesDefault,
    retentionDays: config.retentionDaysDefault,
  };
}

export function getPrefs(): Prefs {
  const stored = getSetting<Partial<Prefs>>("prefs");
  // Older saved settings (topic-level interests, no priority order) are migrated, not reset.
  const merged = normalizePrefs({ ...defaultPrefs(), categoryOrder: [], ...(stored ?? {}) } as Prefs);
  const parsed = PrefsSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultPrefs();
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const next = PrefsSchema.parse(normalizePrefs({ ...getPrefs(), ...patch }));
  setSetting("prefs", next);
  return next;
}

export interface AiRuntimeStatus {
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
}

export function getAiStatus(): AiRuntimeStatus {
  return getSetting<AiRuntimeStatus>("ai_status") ?? { lastError: null, lastErrorAt: null, lastSuccessAt: null };
}

export function setAiStatus(patch: Partial<AiRuntimeStatus>): void {
  setSetting("ai_status", { ...getAiStatus(), ...patch });
}
