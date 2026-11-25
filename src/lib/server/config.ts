// Server-only configuration. Never import this from client components:
// it reads secrets from the environment.
import path from "node:path";

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

export type AiProvider = "anthropic" | "ollama" | "none";

function resolveProvider(): AiProvider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "ollama" || explicit === "none") return explicit;
  // Auto: use Claude when a key is present, otherwise no AI (feed excerpts only).
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return "none";
}

export const config = {
  databasePath: path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || "./data/news.db"),
  refreshMinutesDefault: int("REFRESH_INTERVAL_MINUTES", 12, 10, 15),
  schedulerDisabled: bool("DISABLE_SCHEDULER", false),
  cronSecret: process.env.CRON_SECRET || "",
  fetchTimeoutMs: int("FETCH_TIMEOUT_MS", 20000, 3000, 60000),
  maxFeedBytes: 6 * 1024 * 1024,
  userAgent:
    "PersonalNewsDashboard/1.0 (self-hosted personal RSS reader" +
    (process.env.FETCH_CONTACT ? `; +${process.env.FETCH_CONTACT}` : "") +
    ")",
  /** Only ingest items published within this many days (older items in a feed are ignored). */
  ingestMaxAgeDays: int("INGEST_MAX_AGE_DAYS", 7, 1, 30),
  retentionDaysDefault: int("RETENTION_DAYS", 30, 3, 365),
  ai: {
    provider: resolveProvider(),
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    anthropicEffort: (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high" | "xhigh" | "max",
    anthropicFallbacks: (process.env.ANTHROPIC_FALLBACKS || "default").toLowerCase() !== "off",
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, ""),
    ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
    maxPerRun: int("AI_MAX_ARTICLES_PER_RUN", 30, 0, 500),
    dailyLimit: int("AI_DAILY_LIMIT", 200, 0, 10000),
    concurrency: int("AI_CONCURRENCY", 3, 1, 10),
  },
  auth: {
    user: process.env.DASHBOARD_USER || "",
    password: process.env.DASHBOARD_PASSWORD || "",
  },
};

export function aiModelLabel(): string | null {
  switch (config.ai.provider) {
    case "anthropic":
      return config.ai.anthropicModel;
    case "ollama":
      return config.ai.ollamaModel;
    default:
      return null;
  }
}
