// Google Gemini API (free tier available: https://aistudio.google.com/apikey).
// Uses the documented REST endpoint `models/{model}:generateContent` with JSON-schema output.
import { z } from "zod/v4";
import { config } from "../config";
import { AiError } from "./errors";
import { AiOutputSchema, buildUserMessage, SYSTEM_PROMPT, type AiOutput, type PromptArticle } from "./prompt";

/** Plain JSON Schema (type/properties/items/enum/required) — the subset Gemini accepts. */
function simplify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(simplify);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "$schema" || key === "additionalProperties") continue;
    out[key] = key === "properties" ? Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, simplify(v)])) : simplify(value);
  }
  return out;
}

const jsonSchemaCache = new WeakMap<z.ZodType, unknown>();
function responseSchemaFor(schema: z.ZodType): unknown {
  let s = jsonSchemaCache.get(schema);
  if (!s) {
    s = simplify(z.toJSONSchema(schema));
    jsonSchemaCache.set(schema, s);
  }
  return s;
}

/** A structured request: system prompt, user message and the zod schema the answer must match. */
export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] };
}

// The free tier allows only a few requests per minute and per day. Calls are spaced out;
// a model whose *daily* quota is used up is skipped until the next UTC day, and a model
// that keeps answering "busy" rests for a while. This state is saved between runs.
let lastCallAt = 0;
let quotaExhausted = new Set<string>();
let quotaDay = "";
let busyUntil = new Map<string, number>();
const BUSY_REST_MS = 10 * 60_000;
/** Set if the API rejects thinkingConfig for a model; then it is sent without it. */
const noThinkingConfig = new Set<string>();

export interface GeminiState {
  day: string;
  exhausted: string[];
  busyUntil: Record<string, number>;
}

export function getGeminiState(): GeminiState {
  return { day: quotaDay, exhausted: [...quotaExhausted], busyUntil: Object.fromEntries(busyUntil) };
}

export function restoreGeminiState(state: GeminiState | null | undefined) {
  if (!state) return;
  const today = new Date().toISOString().slice(0, 10);
  if (state.day === today) {
    quotaDay = today;
    quotaExhausted = new Set(state.exhausted);
  }
  const now = Date.now();
  busyUntil = new Map(Object.entries(state.busyUntil ?? {}).filter(([, t]) => t > now));
}

async function pace() {
  const wait = lastCallAt + config.ai.geminiMinIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

function modelsToTry(): string[] {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDay) {
    quotaDay = today;
    quotaExhausted = new Set();
  }
  const now = Date.now();
  return [config.ai.geminiModel, ...config.ai.geminiFallbackModels].filter(
    (m, i, all) => m && all.indexOf(m) === i && !quotaExhausted.has(m) && (busyUntil.get(m) ?? 0) <= now,
  );
}

/**
 * A 429 is either the per-minute limit (wait and continue) or the per-day quota (skip the
 * model until tomorrow). Gemini says which in the error details (QuotaFailure.quotaId).
 */
export function classify429(error: GeminiResponse["error"]): { daily: boolean; retryAfterMs: number | null } {
  const details = error?.details ?? [];
  const ids = details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "");
  const text = `${ids.join(" ")} ${error?.message ?? ""}`;
  const daily = /per ?day|perday|daily/i.test(text);
  const delay = details.map((d) => d.retryDelay).find(Boolean) ?? text.match(/retry in ([\d.]+)s/i)?.[1];
  const seconds = delay ? Number.parseFloat(String(delay)) : NaN;
  return { daily, retryAfterMs: Number.isFinite(seconds) ? Math.min(90_000, Math.ceil(seconds * 1000)) : null };
}

async function call<T>(model: string, req: JsonRequest<T>): Promise<{ data: T; model: string }> {
  await pace();
  let res: Response;
  try {
    res = await fetch(`${config.ai.geminiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.ai.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: responseSchemaFor(req.schema),
          maxOutputTokens: req.maxOutputTokens ?? 8192,
          // Summarizing and translating need little reasoning; low thinking keeps requests fast.
          ...(noThinkingConfig.has(model) ? {} : { thinkingConfig: { thinkingLevel: "LOW" } }),
        },
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
    });
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError";
    throw new AiError("unavailable", timedOut ? `Gemini request timed out (${model})` : "Could not reach the Gemini API");
  }

  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const detail = body.error?.message ? `: ${body.error.message.slice(0, 200)}` : "";
    if (res.status === 429) {
      const { daily, retryAfterMs } = classify429(body.error);
      if (daily) throw new AiError("rate-limit", `Gemini daily quota reached for ${model}${detail}`);
      throw new AiError("throttled", `Gemini per-minute limit reached for ${model}`, retryAfterMs);
    }
    if (res.status === 401 || res.status === 403) throw new AiError("auth", `Gemini API key is missing or invalid${detail}`);
    if (res.status === 404) throw new AiError("config", `Gemini model "${model}" is not available${detail}`);
    if (res.status === 400 && /thinking/i.test(body.error?.message ?? "") && !noThinkingConfig.has(model)) {
      noThinkingConfig.add(model);
      return call(model, req); // this model does not accept thinkingConfig
    }
    if (res.status === 400) throw new AiError("config", `Gemini rejected the request${detail}`);
    throw new AiError("unavailable", `Gemini API error ${res.status}${detail}`);
  }

  if (body.promptFeedback?.blockReason) throw new AiError("refusal", `Gemini blocked the request (${body.promptFeedback.blockReason})`);
  const candidate = body.candidates?.[0];
  const finish = candidate?.finishReason ?? "";
  if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(finish)) {
    throw new AiError("refusal", `Gemini declined to summarize (${finish})`);
  }
  if (finish === "MAX_TOKENS") throw new AiError("invalid", "Gemini response truncated (max tokens)");
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("invalid", "Gemini returned invalid JSON");
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) throw new AiError("invalid", "Gemini output did not match the expected schema");
  return { data: parsed.data, model: body.modelVersion || model };
}

/** Run a structured request, falling back across models when one is busy or out of quota. */
export async function generateWithGemini<T>(req: JsonRequest<T>): Promise<{ data: T; model: string }> {
  if (!config.ai.geminiApiKey) throw new AiError("auth", "GEMINI_API_KEY is not set");
  const models = modelsToTry();
  if (!models.length) throw new AiError("rate-limit", "All Gemini models are busy or out of free quota; will retry on the next update");
  let lastError: AiError | null = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await call(model, req);
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
        lastError = err;
        // Per-minute limit: wait as asked (once), then move on to the next model.
        if (err.kind === "throttled") {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, err.retryAfterMs ?? config.ai.geminiRetryDelayMs * 4));
            continue;
          }
          break;
        }
        // Busy ("high demand"), 5xx and timeouts are usually brief: retry once, then rest
        // this model for a while and try the next one.
        if (err.kind === "unavailable") {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, config.ai.geminiRetryDelayMs));
            continue;
          }
          busyUntil.set(model, Date.now() + BUSY_REST_MS);
          break;
        }
        // Daily free quota used up, or the model no longer exists: skip it for today.
        if (err.kind === "rate-limit" || (err.kind === "config" && err.message.includes("is not available"))) {
          quotaExhausted.add(model);
          break;
        }
        throw err;
      }
    }
  }
  throw lastError ?? new AiError("rate-limit", "Gemini free-tier quota used up for today");
}

export async function summarizeWithGemini(article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  const { data, model } = await generateWithGemini({ system: SYSTEM_PROMPT, user: buildUserMessage(article), schema: AiOutputSchema });
  return { output: data, model };
}

/** For tests. */
export function resetGeminiState() {
  lastCallAt = 0;
  quotaExhausted = new Set();
  quotaDay = "";
  busyUntil = new Map();
  noThinkingConfig.clear();
}
