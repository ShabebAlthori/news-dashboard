// Verifies the real Anthropic SDK request we send and that we parse its response,
// using a local HTTP server in place of the API (no key or network needed).
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: http.Server;
let lastBody: Record<string, unknown> | null = null;
let lastHeaders: http.IncomingHttpHeaders = {};
let reply: (body: Record<string, unknown>) => { status: number; json: unknown } = () => ({ status: 500, json: {} });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastBody = JSON.parse(data);
      lastHeaders = req.headers;
      const r = reply(lastBody!);
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
  process.env.ANTHROPIC_EFFORT = "low";
});

afterAll(() => server.close());

const goodOutput = {
  headline_en: "Ubisoft lays off 166 staff",
  headline_ar: "يوبيسوفت تسرّح 166 موظفًا",
  summary_en: "Ubisoft is laying off 166 employees.",
  summary_ar: "تسرّح يوبيسوفت 166 موظفًا.",
  significance: 4,
  excluded_topic: "none",
  speculative: false,
  insufficient_text: false,
  categories: ["game-industry", "layoffs"],
  companies: ["ubisoft"],
};

function message(text: string, stop_reason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("summarizeWithClaude", () => {
  it("sends a structured-output request with effort and refusal fallbacks, and parses the result", async () => {
    reply = () => ({ status: 200, json: message(JSON.stringify(goodOutput)) });
    const { summarizeWithClaude } = await import("@/lib/server/ai/anthropic");
    const { output, model } = await summarizeWithClaude({ sourceName: "GamesIndustry.biz", title: "Ubisoft lays off 166 staff", text: "Ubisoft is laying off 166 employees.", publishedAt: Date.now() });
    expect(output).toEqual(goodOutput);
    expect(model).toBe("claude-opus-5-5");

    expect(lastBody?.model).toBe("claude-opus-5-5");
    expect(lastBody?.fallbacks).toBe("default");
    expect(String(lastHeaders["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    const outputConfig = lastBody?.output_config as { effort: string; format: { type: string; schema: unknown } };
    expect(outputConfig.effort).toBe("low");
    expect(outputConfig.format.type).toBe("json_schema");
    expect(lastBody).not.toHaveProperty("thinking"); // adaptive thinking is the model default
    const userContent = (lastBody?.messages as { content: string }[])[0].content;
    expect(userContent).toContain("<original_headline>Ubisoft lays off 166 staff</original_headline>");
    // The SDK sends the configured server-side key (as a bearer token in SDK v1).
    expect(lastHeaders["authorization"] ?? `Bearer ${lastHeaders["x-api-key"]}`).toBe("Bearer sk-test");
  });

  it("maps refusals and auth errors to typed AI errors", async () => {
    const { summarizeWithClaude } = await import("@/lib/server/ai/anthropic");
    const { AiError } = await import("@/lib/server/ai/errors");
    reply = () => ({ status: 200, json: { ...message(""), stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } } });
    await expect(summarizeWithClaude({ sourceName: "x", title: "t", text: "x", publishedAt: null })).rejects.toMatchObject({ kind: "refusal" });

    reply = () => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
    const err = await summarizeWithClaude({ sourceName: "x", title: "t", text: "x", publishedAt: null }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("auth");
    expect(err.stopsRun).toBe(true);
  });
});
