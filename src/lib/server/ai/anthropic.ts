import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config";
import { AiOutputSchema, buildUserMessage, SYSTEM_PROMPT, type AiOutput, type PromptArticle } from "./prompt";
import { AiError } from "./errors";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Resolves ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the server environment.
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Server-side refusal fallbacks are supported on these model families. */
function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5|mythos-5)/.test(model);
}

export async function summarizeWithClaude(article: PromptArticle): Promise<{ output: AiOutput; model: string }> {
  const model = config.ai.anthropicModel;
  const useFallbacks = config.ai.anthropicFallbacks && supportsFallbacks(model);
  try {
    // `create` (not `parse`) so the stop reason can be checked before the body is parsed:
    // a refusal has no JSON body and must not be mistaken for a malformed response.
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(article) }],
      output_config: { effort: config.ai.anthropicEffort, format: betaZodOutputFormat(AiOutputSchema) },
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new AiError("refusal", `Model declined to summarize (${response.stop_details?.category ?? "unspecified"})`);
    }
    if (response.stop_reason === "max_tokens") throw new AiError("invalid", "Response truncated (max_tokens)");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("invalid", "Response was not valid JSON");
    }
    const parsed = AiOutputSchema.safeParse(json);
    if (!parsed.success) throw new AiError("invalid", "Response did not match the expected schema");
    return { output: parsed.data, model: response.model };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AiError("auth", "Anthropic API key is missing or invalid");
    }
    if (err instanceof Anthropic.RateLimitError) throw new AiError("rate-limit", "Anthropic rate limit reached");
    if (err instanceof Anthropic.BadRequestError) throw new AiError("invalid", `Bad request: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("unavailable", "Could not reach the Anthropic API");
    if (err instanceof Anthropic.APIError) throw new AiError("unavailable", `Anthropic API error ${err.status ?? ""}`.trim());
    throw new AiError("invalid", (err as Error).message || "Unknown AI error");
  }
}
