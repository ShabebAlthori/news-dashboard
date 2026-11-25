import { XMLParser } from "fast-xml-parser";
import { cleanTitle, htmlToText, isHttpUrl } from "./text";

export interface ParsedItem {
  guid: string;
  url: string;
  title: string;
  /** Plain text of the feed's description/summary. */
  description: string;
  /** Plain text of the longest content field offered by the feed (may equal description). */
  content: string;
  author: string | null;
  imageUrl: string | null;
  /** ms epoch, or null when the feed supplied no parseable date. */
  publishedAt: number | null;
  categories: string[];
}

export interface ParsedFeed {
  title: string;
  items: ParsedItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) =>
    ["item", "entry", "link", "category", "media:content", "media:thumbnail", "enclosure", "dc:subject"].includes(name),
});

type Node = Record<string, unknown>;

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const node = value as Node;
    if ("#text" in node) return text(node["#text"]);
    if ("__cdata" in node) return text(node["__cdata"]);
  }
  return "";
}

function attr(value: unknown, name: string): string {
  if (!value || typeof value !== "object") return "";
  const v = (value as Node)[`@_${name}`];
  return typeof v === "string" ? v : "";
}

export function parseDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    // Normalize a few non-standard but common variants: "Tue, 25 Nov 2026 07:00:00 EST" etc. are handled
    // by Date.parse; handle "2026-11-25 07:00:00" (no T) and trailing "Z GMT".
    t = Date.parse(s.replace(" ", "T"));
  }
  if (Number.isNaN(t)) return null;
  return t;
}

function firstImage(item: Node): string | null {
  const candidates: string[] = [];
  for (const key of ["media:content", "media:thumbnail"]) {
    const list = item[key];
    if (Array.isArray(list)) {
      for (const m of list) {
        const medium = attr(m, "medium");
        const type = attr(m, "type");
        const url = attr(m, "url");
        if (url && (!medium || medium === "image") && (!type || type.startsWith("image"))) candidates.push(url);
      }
    }
  }
  const group = item["media:group"] as Node | undefined;
  if (group && Array.isArray(group["media:content"])) {
    for (const m of group["media:content"] as unknown[]) {
      const url = attr(m, "url");
      if (url) candidates.push(url);
    }
  }
  if (Array.isArray(item.enclosure)) {
    for (const e of item.enclosure) {
      if (attr(e, "type").startsWith("image") && attr(e, "url")) candidates.push(attr(e, "url"));
    }
  }
  const html = text(item["content:encoded"]) || text(item.description) || text(item.content) || text(item.summary);
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) candidates.push(imgMatch[1]);
  const found = candidates.find((c) => isHttpUrl(c) && c.startsWith("https://"));
  return found ?? null;
}

function categoriesOf(item: Node): string[] {
  const out: string[] = [];
  for (const key of ["category", "dc:subject"]) {
    const list = item[key];
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      const term = attr(c, "term") || attr(c, "label") || text(c);
      if (term) out.push(cleanTitle(term));
    }
  }
  return [...new Set(out.filter(Boolean))].slice(0, 20);
}

function pickLink(item: Node): string {
  const link = item.link;
  if (Array.isArray(link)) {
    // Atom: prefer rel="alternate" (or no rel) with an href.
    const alt = link.find((l) => attr(l, "href") && (!attr(l, "rel") || attr(l, "rel") === "alternate"));
    if (alt) return attr(alt, "href");
    const anyHref = link.find((l) => attr(l, "href"));
    if (anyHref) return attr(anyHref, "href");
    return text(link[0]);
  }
  return text(link);
}

function normalizeItem(item: Node, isAtom: boolean): ParsedItem | null {
  const title = cleanTitle(text(item.title));
  let url = pickLink(item).trim();
  const guidRaw = text(item.guid) || text(item.id);
  if (!isHttpUrl(url) && isHttpUrl(guidRaw)) url = guidRaw;
  if (!title || !isHttpUrl(url)) return null;

  const descriptionHtml = isAtom ? text(item.summary) || text(item.content) : text(item.description);
  const contentHtml = text(item["content:encoded"]) || (isAtom ? text(item.content) : "") || descriptionHtml;
  const description = htmlToText(descriptionHtml);
  const content = htmlToText(contentHtml);

  const dateRaw =
    text(item.pubDate) || text(item.published) || text(item["dc:date"]) || text(item.updated) || text(item["a10:updated"]);
  const publishedAt = dateRaw ? parseDate(dateRaw) : null;

  let author = text(item["dc:creator"]) || text(item.author);
  if (!author && item.author && typeof item.author === "object") author = text((item.author as Node).name);
  author = cleanTitle(author) || "";

  return {
    guid: (guidRaw || url).trim().slice(0, 500),
    url,
    title,
    description: description.length > 4000 ? description.slice(0, 4000) : description,
    content: content.length > 12000 ? content.slice(0, 12000) : content,
    author: author || null,
    imageUrl: firstImage(item),
    publishedAt,
    categories: categoriesOf(item),
  };
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom. Throws on malformed XML. */
export function parseFeed(xml: string): ParsedFeed {
  const trimmed = xml.trim();
  if (!trimmed.startsWith("<")) throw new Error("Response is not XML");
  const doc = parser.parse(trimmed) as Node;

  const rss = doc.rss as Node | undefined;
  if (rss) {
    const channel = (Array.isArray(rss.channel) ? rss.channel[0] : rss.channel) as Node;
    const items = (channel?.item as Node[] | undefined) ?? [];
    return {
      title: cleanTitle(text(channel?.title)),
      items: items.map((i) => normalizeItem(i, false)).filter((i): i is ParsedItem => i !== null),
    };
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    const entries = (feed.entry as Node[] | undefined) ?? [];
    return {
      title: cleanTitle(text(feed.title)),
      items: entries.map((e) => normalizeItem(e, true)).filter((i): i is ParsedItem => i !== null),
    };
  }
  const rdf = (doc["rdf:RDF"] ?? doc["RDF"]) as Node | undefined;
  if (rdf) {
    const items = (rdf.item as Node[] | undefined) ?? [];
    const channel = rdf.channel as Node | undefined;
    return {
      title: cleanTitle(text(channel?.title)),
      items: items.map((i) => normalizeItem(i, false)).filter((i): i is ParsedItem => i !== null),
    };
  }
  throw new Error("Unrecognized feed format (expected RSS, RDF or Atom)");
}
