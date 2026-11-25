// Verifies the Gemini provider (free tier) against a local HTTP server.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

interface Seen {
  path: string;
  key: string | undefined;
  body: {
    systemInstruction: { parts: { text: string }[] };
    contents: { role: string; parts: { text: string }[] }[];
    generationConfig: { responseMimeType: string; responseJsonSchema: Record<string, unknown>; maxOutputTokens: number; temperature?: number; thinkingConfig?: { thinkingLevel: string } };
  };
}

let server: http.Server;
const seen: Seen[] = [];
let handler: (path: string) => { status: number; json: unknown } = () => ({ status: 500, json: {} });

const output = {
  headline_en: "Nvidia reinstates its CEO",
  headline_ar: "إنفيديا تعيد رئيسها التنفيذي",
  summary_en: "Nvidia reinstated its CEO.",
  summary_ar: "أعادت إنفيديا رئيسها التنفيذي.",
  significance: 5,
  excluded_topic: "none",
  speculative: false,
  insufficient_text: false,
  categories: ["leadership"],
  companies: ["nvidia"],
};
const ok = (model: string) => ({
  status: 200,
  json: {
    candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(output) }] }, finishReason: "STOP" }],
    modelVersion: model,
  },
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", key: req.headers["x-goog-api-key"] as string | undefined, body: JSON.parse(data) });
      const r = handler(req.url ?? "");
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MIN_INTERVAL_MS = "0";
  process.env.GEMINI_RETRY_DELAY_MS = "0";
  // Fixed list so the tests check the fallback mechanism, not the default order.
  process.env.GEMINI_FALLBACK_MODELS = "gemini-3.5-flash-lite";
});
afterAll(() => server.close());
beforeEach(async () => {
  seen.length = 0;
  (await import("@/lib/server/ai/gemini")).resetGeminiState();
});

const article = { sourceName: "The Verge", title: "Nvidia reinstates its CEO", text: "Nvidia reinstated its CEO.", publishedAt: null };

describe("summarizeWithGemini", () => {
  it("calls generateContent with JSON-schema output and parses the answer (ignoring thought parts)", async () => {
    handler = () => ok("gemini-3.8-flash");
    const { summarizeWithGemini } = await import("@/lib/server/ai/gemini");
    const res = await summarizeWithGemini(article);
    expect(res.output).toEqual(output);
    expect(res.model).toBe("gemini-3.8-flash");
    const req = seen[0];
    expect(req.path).toBe("/v1beta/models/gemini-3.8-flash:generateContent");
    expect(req.key).toBe("test-gemini-key");
    expect(req.body.systemInstruction.parts[0].text).toContain("Accuracy rules");
    expect(req.body.contents[0].parts[0].text).toContain("<original_headline>Nvidia reinstates its CEO</original_headline>");
    expect(req.body.generationConfig.responseMimeType).toBe("application/json");
    expect(req.body.generationConfig.responseJsonSchema).not.toHaveProperty("$schema");
    expect(req.body.generationConfig.responseJsonSchema).toHaveProperty("properties.summary_ar");
    expect(req.body.generationConfig).not.toHaveProperty("temperature");
    expect(req.body.generationConfig).toHaveProperty("thinkingConfig.thinkingLevel", "LOW");
  });

  it("falls back to the lighter model when the free quota of the main model is used up", async () => {
    handler = (path) => (path.includes("gemini-3.8-flash") ? { status: 429, json: { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } } } : ok("gemini-3.5-flash-lite"));
    const { summarizeWithGemini } = await import("@/lib/server/ai/gemini");
    expect((await summarizeWithGemini(article)).model).toBe("gemini-3.5-flash-lite");
    // The exhausted model is skipped for the rest of the day.
    await summarizeWithGemini(article);
    expect(seen.map((s) => s.path.split("/").pop())).toEqual([
      "gemini-3.8-flash:generateContent",
      "gemini-3.5-flash-lite:generateContent",
      "gemini-3.5-flash-lite:generateContent",
    ]);
  });

  it("retries a temporarily overloaded model once, then uses the lighter model", async () => {
    const { summarizeWithGemini } = await import("@/lib/server/ai/gemini");
    const busy = { status: 503, json: { error: { code: 503, message: "This model is currently experiencing high demand." } } };
    let calls = 0;
    handler = () => (++calls === 1 ? busy : ok("gemini-3.8-flash"));
    expect((await summarizeWithGemini(article)).model).toBe("gemini-3.8-flash");
    expect(seen).toHaveLength(2); // retried the same model

    seen.length = 0;
    handler = (path) => (path.includes("gemini-3.8-flash") ? busy : ok("gemini-3.5-flash-lite"));
    expect((await summarizeWithGemini(article)).model).toBe("gemini-3.5-flash-lite");
    // The busy model is rested for a while, so the next story goes straight to the lighter one.
    await summarizeWithGemini(article);
    expect(seen[3].path).toContain("gemini-3.5-flash-lite");
  });

  it("resends without thinkingConfig if a model rejects it", async () => {
    const { summarizeWithGemini } = await import("@/lib/server/ai/gemini");
    handler = () =>
      seen.at(-1)?.body.generationConfig.thinkingConfig
        ? { status: 400, json: { error: { code: 400, message: "Thinking level is not supported for this model." } } }
        : ok("gemini-3.8-flash");
    expect((await summarizeWithGemini(article)).model).toBe("gemini-3.8-flash");
    expect(seen.map((s) => Boolean(s.body.generationConfig.thinkingConfig))).toEqual([true, false]);
  });

  it("maps errors: quota → rate-limit, bad key → auth, unknown model → config, safety → refusal", async () => {
    const { summarizeWithGemini, resetGeminiState } = await import("@/lib/server/ai/gemini");
    handler = () => ({ status: 429, json: { error: { message: "Quota exceeded" } } });
    await expect(summarizeWithGemini(article)).rejects.toMatchObject({ kind: "rate-limit" });
    resetGeminiState();
    handler = () => ({ status: 403, json: { error: { message: "API key not valid" } } });
    await expect(summarizeWithGemini(article)).rejects.toMatchObject({ kind: "auth" });
    handler = () => ({ status: 404, json: { error: { message: "models/x is not found" } } });
    await expect(summarizeWithGemini(article)).rejects.toMatchObject({ kind: "config", stopsRun: true });
    resetGeminiState();
    handler = () => ({ status: 200, json: { candidates: [{ finishReason: "RECITATION" }] } });
    await expect(summarizeWithGemini(article)).rejects.toMatchObject({ kind: "refusal" });
  });
});
