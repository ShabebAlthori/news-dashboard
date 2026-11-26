// Free, local alternative to a hosted model: Ollama (https://ollama.com).
// Uses Ollama's native /api/chat endpoint with JSON-schema constrained output.
import { z } from "zod/v4";
import { config } from "../config";
import { AiError } from "./errors";
import type { JsonRequest } from "./gemini";
import { AiOutputSchema, buildUserMessage, SYSTEM_PROMPT, type AiOutput, type PromptArticle } from "./prompt";

export async function summarizeWithOllama(article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  const { data, model } = await generateWithOllama({ system: SYSTEM_PROMPT, user: buildUserMessage(article), schema: AiOutputSchema });
  return { output: data, model };
}

/** Run a structured request (any zod schema) against a local Ollama model. */
export async function generateWithOllama<T>(req: JsonRequest<T>): Promise<{ data: T; model: string }> {
  let res: Response;
  try {
    res = await fetch(`${config.ai.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ai.ollamaModel,
        stream: false,
        format: z.toJSONSchema(req.schema),
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch {
    throw new AiError("unavailable", `Could not reach Ollama at ${config.ai.ollamaBaseUrl}`);
  }
  if (res.status === 404) throw new AiError("auth", `Ollama model "${config.ai.ollamaModel}" is not installed (run: ollama pull ${config.ai.ollamaModel})`);
  if (!res.ok) throw new AiError("unavailable", `Ollama returned HTTP ${res.status}`);

  const body = (await res.json()) as { message?: { content?: string }; model?: string };
  const content = body.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiError("invalid", "Ollama returned invalid JSON");
  }
  const result = req.schema.safeParse(parsed);
  if (!result.success) throw new AiError("invalid", "Ollama output did not match the expected schema");
  return { data: result.data, model: body.model || config.ai.ollamaModel };
}
