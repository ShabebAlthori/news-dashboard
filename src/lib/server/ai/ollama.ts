// Free, local alternative to a hosted model: Ollama (https://ollama.com).
// Uses Ollama's native /api/chat endpoint with JSON-schema constrained output.
import { z } from "zod/v4";
import { config } from "../config";
import { AiError } from "./errors";
import { AiOutputSchema, buildUserMessage, SYSTEM_PROMPT, type AiOutput, type PromptArticle } from "./prompt";

const jsonSchema = z.toJSONSchema(AiOutputSchema);

export async function summarizeWithOllama(article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  let res: Response;
  try {
    res = await fetch(`${config.ai.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ai.ollamaModel,
        stream: false,
        format: jsonSchema,
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(article) },
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
  const result = AiOutputSchema.safeParse(parsed);
  if (!result.success) throw new AiError("invalid", "Ollama output did not match the expected schema");
  return { output: result.data, model: body.model || config.ai.ollamaModel };
}
