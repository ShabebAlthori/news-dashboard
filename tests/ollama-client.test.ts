// Verifies the Ollama (free, local) provider against a local HTTP server.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: http.Server;
let lastBody: { model: string; stream: boolean; format: { type: string; properties: Record<string, unknown> }; messages: { role: string; content: string }[] } | null = null;
let status = 200;
let content = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastBody = JSON.parse(data);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "qwen2.5:7b-instruct", message: { role: "assistant", content } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("summarizeWithOllama", () => {
  it("requests JSON-schema output and validates the reply", async () => {
    content = JSON.stringify({
      headline_en: "A",
      headline_ar: "أ",
      summary_en: "S.",
      summary_ar: "ملخص.",
      significance: 2,
      excluded_topic: "none",
      speculative: false,
      insufficient_text: true,
      categories: [],
      companies: [],
    });
    const { summarizeWithOllama } = await import("@/lib/server/ai/ollama");
    const { output, model } = await summarizeWithOllama({ sourceName: "x", title: "A", text: "S.", publishedAt: null });
    expect(output.headline_ar).toBe("أ");
    expect(model).toBe("qwen2.5:7b-instruct");
    expect(lastBody?.stream).toBe(false);
    expect(lastBody?.format.type).toBe("object");
    expect(Object.keys(lastBody!.format.properties)).toContain("summary_ar");
    expect(lastBody?.messages[0].role).toBe("system");
  });

  it("rejects malformed output and reports a missing model", async () => {
    const { summarizeWithOllama } = await import("@/lib/server/ai/ollama");
    content = '{"headline_en": 1}';
    await expect(summarizeWithOllama({ sourceName: "x", title: "A", text: "", publishedAt: null })).rejects.toMatchObject({ kind: "invalid" });
    status = 404;
    await expect(summarizeWithOllama({ sourceName: "x", title: "A", text: "", publishedAt: null })).rejects.toMatchObject({ kind: "auth" });
  });
});
