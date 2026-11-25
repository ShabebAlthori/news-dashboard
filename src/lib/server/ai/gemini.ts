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

const responseJsonSchema = simplify(z.toJSONSchema(AiOutputSchema));

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string };
}

// The free tier allows only a few requests per minute: space calls out and, when the main
// model's quota is used up, continue with the lighter model for the rest of the run.
let lastCallAt = 0;
let quotaExhausted = new Set<string>();
let quotaDay = "";

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
  return [config.ai.geminiModel, ...config.ai.geminiFallbackModels].filter((m, i, all) => m && all.indexOf(m) === i && !quotaExhausted.has(m));
}

async function call(model: string, article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  await pace();
  let res: Response;
  try {
    res = await fetch(`${config.ai.geminiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.ai.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserMessage(article) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new AiError("unavailable", "Could not reach the Gemini API");
  }

  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const detail = body.error?.message ? `: ${body.error.message.slice(0, 200)}` : "";
    if (res.status === 429) throw new AiError("rate-limit", `Gemini quota reached for ${model}${detail}`);
    if (res.status === 401 || res.status === 403) throw new AiError("auth", `Gemini API key is missing or invalid${detail}`);
    if (res.status === 404) throw new AiError("config", `Gemini model "${model}" is not available${detail}`);
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
  const parsed = AiOutputSchema.safeParse(json);
  if (!parsed.success) throw new AiError("invalid", "Gemini output did not match the expected schema");
  return { output: parsed.data, model: body.modelVersion || model };
}

export async function summarizeWithGemini(article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  if (!config.ai.geminiApiKey) throw new AiError("auth", "GEMINI_API_KEY is not set");
  const models = modelsToTry();
  if (!models.length) throw new AiError("rate-limit", "Gemini free-tier quota used up for today");
  for (let i = 0; i < models.length; i++) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await call(models[i], article);
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
        // "High demand" / 5xx overloads are usually brief: retry once, then try the lighter model.
        const overloaded = err.kind === "unavailable" && /\b50[0234]\b|high demand|overloaded/i.test(err.message);
        if (overloaded && attempt === 0) {
          await new Promise((r) => setTimeout(r, config.ai.geminiRetryDelayMs));
          continue;
        }
        const quotaOrMissing = err.kind === "rate-limit" || (err.kind === "config" && err.message.includes("is not available"));
        if ((overloaded || quotaOrMissing) && i < models.length - 1) {
          if (quotaOrMissing) quotaExhausted.add(models[i]); // skip it for the rest of the day
          break; // next model
        }
        throw err;
      }
    }
  }
  throw new AiError("rate-limit", "Gemini free-tier quota used up for today");
}

/** For tests. */
export function resetGeminiState() {
  lastCallAt = 0;
  quotaExhausted = new Set();
  quotaDay = "";
}
