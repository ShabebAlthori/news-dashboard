import { describe, expect, it } from "vitest";
import { canonicalizeUrl, cleanTitle, feedExcerptSummary, htmlToText, splitSentences, tokenize } from "@/lib/server/text";

describe("htmlToText", () => {
  it("strips tags, scripts, figures and WordPress boilerplate", () => {
    const html = `<p>Hello <b>world</b>.</p><script>alert(1)</script><figure><img src="x"><figcaption>Caption</figcaption></figure><p>The post Foo appeared first on Bar.</p>`;
    expect(htmlToText(html)).toBe("Hello world .");
  });
  it("decodes entities and double-encoded HTML", () => {
    expect(htmlToText("&lt;p&gt;Over 25 games &amp; more&lt;/p&gt;")).toBe("Over 25 games & more");
    expect(cleanTitle("Rock &#038; Roll &amp;amp; more")).toBe("Rock & Roll & more");
  });
});

describe("splitSentences", () => {
  it("does not split decimals, abbreviations or domains", () => {
    const s = splitSentences("Amazon will pay a reported $7.5 billion for Decart. The U.S. deal closes in Q1. Visit x.com for more.");
    expect(s).toEqual(["Amazon will pay a reported $7.5 billion for Decart.", "The U.S. deal closes in Q1.", "Visit x.com for more."]);
  });
});

describe("feedExcerptSummary", () => {
  it("keeps the publisher's own sentences verbatim and caps length", () => {
    const text = "Nvidia announced results. Revenue rose 20% to $35.1 billion. Gaming revenue fell. Data center revenue grew.";
    const out = feedExcerptSummary(text, "Nvidia reports earnings");
    expect(out).toBe("Nvidia announced results. Revenue rose 20% to $35.1 billion. Gaming revenue fell.");
  });
});

describe("canonicalizeUrl", () => {
  it("removes tracking parameters, fragments, www and trailing slashes", () => {
    expect(canonicalizeUrl("https://www.example.com/news/story/?utm_source=rss&utm_medium=feed&id=5#comments")).toBe("https://example.com/news/story?id=5");
    expect(canonicalizeUrl("http://example.com/a/amp/")).toBe("https://example.com/a");
  });
});

describe("tokenize", () => {
  it("normalizes product names and shares stems across inflections", () => {
    expect(tokenize("GPT-5 launches")).toContain("gpt5");
    const a = tokenize("NVIDIA board reinstates Jensen Huang");
    const b = tokenize("Jensen Huang reinstated as Nvidia CEO");
    expect(a.filter((t) => b.includes(t))).toEqual(expect.arrayContaining(["nvidia", "jensen", "huang", "reinstat"]));
  });
});
