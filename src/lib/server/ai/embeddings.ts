// Multilingual text embeddings (Gemini), used to merge stories that report the same event in
// different words or languages. Documented REST endpoint: models/{model}:batchEmbedContents.
import { config } from "../config";
import { AiError } from "./errors";

export const EMBED_DIMENSIONS = 768;
const MAX_PER_REQUEST = 100;

interface EmbedResponse {
  embeddings?: { values?: number[] }[];
  error?: { message?: string };
}

function normalize(values: number[]): Float32Array {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(values, (v) => v / norm);
}

export function embeddingsAvailable(): boolean {
  return config.ai.provider === "gemini" && !!config.ai.geminiApiKey;
}

/** Embed up to 100 texts in one request; vectors are unit length (dot product = cosine). */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (!texts.length) return [];
  if (texts.length > MAX_PER_REQUEST) throw new Error(`At most ${MAX_PER_REQUEST} texts per request`);
  const model = config.ai.geminiEmbedModel;
  let res: Response;
  try {
    res = await fetch(`${config.ai.geminiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.ai.geminiApiKey },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text: text.slice(0, 2000) }] },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBED_DIMENSIONS,
        })),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AiError("unavailable", "Could not reach the Gemini embeddings API");
  }
  const body = (await res.json().catch(() => ({}))) as EmbedResponse;
  if (!res.ok) {
    const detail = body.error?.message ? `: ${body.error.message.slice(0, 160)}` : "";
    if (res.status === 429) throw new AiError("rate-limit", `Embedding quota reached${detail}`);
    throw new AiError(res.status === 401 || res.status === 403 ? "auth" : "unavailable", `Embedding request failed (${res.status})${detail}`);
  }
  const vectors = (body.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) throw new AiError("invalid", "Embedding response did not match the request");
  return vectors.map(normalize);
}

export function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBlob(b: Buffer): Float32Array {
  // Copy: SQLite buffers are not guaranteed to be 4-byte aligned.
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
