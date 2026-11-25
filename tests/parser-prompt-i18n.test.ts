import { describe, expect, it } from "vitest";
import { unverifiedNumbers } from "@/lib/server/ai/prompt";
import { parseContentSignals } from "@/lib/server/robots";
import { parseFeed } from "@/lib/server/feed-parser";
import { toFtsQuery } from "@/lib/server/queries";
import { translate } from "@/lib/shared/i18n";

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Example</title>
<item><title><![CDATA[Nvidia &amp; AMD news]]></title><link>https://example.com/a?utm_source=rss</link><guid>a1</guid>
<pubDate>Tue, 24 Nov 2026 21:37:30 +0000</pubDate><description><![CDATA[<p>Short <b>summary</b>.</p>]]></description>
<content:encoded><![CDATA[<p>Longer full text here.</p>]]></content:encoded><category>Hardware</category><dc:creator>Jane</dc:creator>
<media:content url="https://cdn.example.com/a.jpg" medium="image"/></item>
<item><title>No date item</title><link>https://example.com/b</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title type="html">Atom &lt;em&gt;entry&lt;/em&gt;</title><link rel="alternate" href="https://example.org/x"/><id>tag:x</id>
<published>2026-11-24T10:00:00Z</published><summary>Sum</summary><author><name>Ann</name></author></entry></feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>RDF</title></channel><item><title>Team Fortress 2 Update Released</title><link>https://store.example.com/news/1</link><dc:date>2026-11-23T22:35:00Z</dc:date></item></rdf:RDF>`;

describe("feed parser", () => {
  it("parses RSS 2.0 with content, media and dates", () => {
    const f = parseFeed(RSS);
    expect(f.items).toHaveLength(2);
    const [a, b] = f.items;
    expect(a.title).toBe("Nvidia & AMD news");
    expect(a.description).toBe("Short summary .");
    expect(a.content).toBe("Longer full text here.");
    expect(a.imageUrl).toBe("https://cdn.example.com/a.jpg");
    expect(a.publishedAt).toBe(Date.parse("2026-11-24T21:37:30Z"));
    expect(a.categories).toEqual(["Hardware"]);
    expect(b.publishedAt).toBeNull(); // never invented
  });
  it("parses Atom and RDF", () => {
    expect(parseFeed(ATOM).items[0]).toMatchObject({ title: "Atom entry", url: "https://example.org/x", author: "Ann" });
    expect(parseFeed(RDF).items[0]).toMatchObject({ title: "Team Fortress 2 Update Released", publishedAt: Date.parse("2026-11-23T22:35:00Z") });
  });
  it("rejects non-feed responses", () => {
    expect(() => parseFeed("<html><body>Not a feed</body></html>")).toThrow();
    expect(() => parseFeed("Service unavailable")).toThrow();
  });
});

describe("AI fact guard", () => {
  const source = "Ubisoft lays off 166 staff. Net bookings fell 16.5% in H1 2026, the company said.";
  it("accepts summaries whose numbers all appear in the source", () => {
    const out = {
      headline_en: "Ubisoft lays off 166 staff",
      headline_ar: "يوبيسوفت تسرّح 166 موظفًا",
      summary_en: "Ubisoft cut 166 jobs; bookings fell 16.5% in H1.",
      summary_ar: "سرّحت يوبيسوفت 166 موظفًا، وتراجعت الحجوزات 16.5% في النصف الأول.",
    };
    expect(unverifiedNumbers(out, source, Date.UTC(2026, 10, 24))).toEqual([]);
  });
  it("flags invented numbers in either language, including Arabic-Indic digits", () => {
    const out = { headline_en: "Ubisoft lays off 166 staff", headline_ar: "", summary_en: "It employs 18,000 people.", summary_ar: "تراجعت بنسبة ٢٠٪" };
    expect(unverifiedNumbers(out, source, null).sort()).toEqual(["18000", "20"]);
  });
});

describe("robots Content-Signal", () => {
  it("reads signals for the * group only", () => {
    const body = "User-agent: GPTBot\nContent-Signal: ai-input=yes\n\nUser-agent: *\nContent-Signal: search=yes, ai-train=no, ai-input=no\nAllow: /";
    expect(parseContentSignals(body)).toEqual({ search: "yes", "ai-train": "no", "ai-input": "no" });
  });
});

describe("search query", () => {
  it("builds a safe prefix query and strips FTS syntax", () => {
    expect(toFtsQuery('nvidia "ceo"')).toBe('"nvidia"* AND "ceo"*');
    expect(toFtsQuery("إنفيديا")).toBe('("إنفيديا"* OR "NVIDIA"*)');
    expect(toFtsQuery("اختراق")).toBe('("اختراق"* OR "hack"* OR "breach"*)');
    expect(toFtsQuery("  ")).toBeNull();
  });
});

describe("i18n", () => {
  it("uses Arabic plural forms", () => {
    expect(translate("ar", "card.sources", { n: 1 })).toBe("مصدر واحد");
    expect(translate("ar", "card.sources", { n: 2 })).toBe("مصدران");
    expect(translate("ar", "card.sources", { n: 5 })).toBe("5 مصادر");
    expect(translate("ar", "card.sources", { n: 11 })).toBe("11 مصدرًا");
    expect(translate("en", "card.sources", { n: 1 })).toBe("1 source");
    expect(translate("en", "card.sources", { n: 3 })).toBe("3 sources");
  });
});
