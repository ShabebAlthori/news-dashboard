import { decodeHTML } from "entities";

const BLOCK_TAGS = /<\/(p|div|li|h[1-6]|blockquote|section|article|tr)>|<br\s*\/?>/gi;

/** Convert feed HTML to clean plain text. Drops scripts, styles, figures and captions. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  // Some feeds double-encode their HTML (e.g. "&lt;p&gt;"); decode once first if so.
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(s) && !/<[a-z]/i.test(s)) s = decodeHTML(s);
  s = s
    .replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeHTML(s);
  s = s
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return stripBoilerplate(s);
}

const BOILERPLATE: RegExp[] = [
  /The post .{3,300}? appeared first on .{2,120}?\.?$/i,
  // Arabic WordPress footers: «نُشر المقال … أولًا على …» and «التدوينة … ظهرت أولاً على …»
  /(?:نُ?شِ?ر|نشر) المقال[\s\S]{3,400}?أو(?:ل|لً|لا|لاً|لًا)ا? على[^\n]{2,120}?\s*\.?\s*$/u,
  /(?:التدوينة\s+[\s\S]{3,400}?)?ظهرت أو(?:ل|لا|لاً|لًا)ا? على[^\n]{2,120}?\s*\.?\s*$/u,
  /This article originally appeared on .{2,120}? at https?:\/\/\S+\.?$/i,
  /\bContinue reading\b.*$/i,
  /\bRead more\b\s*(»|›|\.\.\.|…)?\s*$/i,
  /\bRead the full (story|article)\b.*$/i,
  /\[(…|\.\.\.|&hellip;)\]\s*$/,
  /\bComments?\s*$/i,
  /\bSee full article\b.*$/i,
];

export function stripBoilerplate(s: string): string {
  let out = s;
  for (const re of BOILERPLATE) out = out.replace(re, "").trim();
  return out;
}

/** Collapse whitespace and decode entities in a title. */
export function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let t = decodeHTML(String(raw).replace(/<[^>]+>/g, " "));
  if (/&[a-z#0-9]+;/i.test(t)) t = decodeHTML(t);
  return t.replace(/\s+/g, " ").trim();
}

/** Split text into sentences (English-oriented, conservative). */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  // Protect dots that do not end a sentence: decimals ("$7.5"), versions ("v1.2"),
  // domains ("x.com") and common abbreviations ("U.S.", "Inc.").
  const DOT = "\u0000";
  const protectedText = normalized
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
    .replace(/\b([a-z0-9-]+)\.(com|net|org|io|ai|dev|app|co|gg|tv)\b/gi, `$1${DOT}$2`)
    .replace(/\b(Mr|Ms|Mrs|Dr|Inc|Corp|Ltd|Co|vs|St|No|Jr|Sr|e\.g|i\.e)\./g, (m) => m.replace(/\./g, DOT))
    .replace(/\b([A-Z])\.(?=\s?[A-Z]\.|\s+[a-z])/g, `$1${DOT}`)
    .replace(/\b(U|E)\.(S|K|U)\./g, `$1${DOT}$2${DOT}`);
  const parts = protectedText.match(/[^.!?؟]+(?:[.!?؟]+["'”’)\]»]*|$)/g) ?? [protectedText];
  return parts.map((p) => p.replaceAll(DOT, ".").trim()).filter(Boolean);
}

/**
 * Extractive summary taken verbatim from the publisher's own feed text:
 * the first 2–3 sentences, capped in length. This is never rewritten, so it
 * cannot introduce facts that are not in the source.
 */
export function feedExcerptSummary(text: string, title: string, maxChars = 420): string {
  const sentences = splitSentences(text).filter((s) => s.length > 12);
  const out: string[] = [];
  let len = 0;
  for (const s of sentences) {
    // Skip a sentence that merely repeats the headline.
    if (out.length === 0 && similarity(s, title) > 0.85) continue;
    if (len + s.length > maxChars && out.length >= 1) break;
    out.push(s);
    len += s.length + 1;
    if (out.length >= 3) break;
  }
  let summary = out.join(" ").trim();
  if (!summary && text) summary = text.slice(0, maxChars).trim();
  if (summary.length > maxChars + 80) summary = summary.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  return summary;
}

function similarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|cmpid|ref|ref_src|source|src|ocid|guccounter|guce_referrer|guce_referrer_sig|taid|smid|sr_share|icid|cid|mbid|rss|feed|traffic_source)$/i;

/** Normalize a URL for duplicate detection. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^amp\./, "");
    u.protocol = "https:";
    const keep = new URLSearchParams();
    const keys = [...new Set([...u.searchParams.keys()])].sort();
    for (const key of keys) {
      if (TRACKING_PARAMS.test(key)) continue;
      for (const v of u.searchParams.getAll(key)) keep.append(key, v);
    }
    const qs = keep.toString();
    let pathname = u.pathname.replace(/\/amp\/?$/, "/").replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${u.protocol}//${u.hostname}${pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    return raw.trim();
  }
}

export function isHttpUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ---------- Tokenization for story clustering ----------

const STOPWORDS = new Set(
  (
    "a an the and or but if then than so of to in on at by for with from into onto over under about as is are was were be been being " +
    "it its it's this that these those there their they them he she his her we our you your i me my mine not no yes do does did done " +
    "has have had having will would can could should may might must shall just now new news today week year years day days month " +
    "says said say report reports reported reportedly according announces announced announce launches launched launch unveils unveiled " +
    "reveals revealed here heres what whats why how who when where which more most less first latest finally officially still also " +
    "after before amid ahead out up down off back get gets got make makes made take takes taking big biggest best top all any some " +
    "one two three via vs inc corp co ltd update updates updated live video watch look looks like now available coming soon next " +
    "time times way ways thing things people its own every other only even much many very really"
  ).split(/\s+/),
);

function stem(token: string): string {
  if (token.length <= 4 || /\d/.test(token)) return token;
  let t = token;
  if (t.endsWith("ies") && t.length > 5) return t.slice(0, -3) + "y";
  if (t.endsWith("ing") && t.length > 6) t = t.slice(0, -3);
  else if (t.endsWith("ed") && t.length > 5) t = t.slice(0, -2);
  else if (t.endsWith("es") && t.length > 5 && /(ches|shes|xes|sses)$/.test(t)) t = t.slice(0, -2);
  else if (t.endsWith("s") && !t.endsWith("ss") && t.length > 4) t = t.slice(0, -1);
  // Normalize a trailing silent "e" so "reinstates"/"reinstated"/"reinstate" share a stem.
  if (t.endsWith("e") && t.length > 4) t = t.slice(0, -1);
  return t;
}

// Common Arabic function words, ignored when comparing headlines.
const AR_STOPWORDS = new Set(
  "في من على إلى الى عن مع أن ان إن التي الذي الذين هذا هذه ذلك تلك كان كانت يكون تكون قد لقد لم لن لا ما ماذا هل بعد قبل حتى عند بين خلال منذ حول ضد عبر أو او ثم كل بعض غير أي اي أكثر اكثر أول اول جديد جديدة جديدا يمكن تم يتم وفق وفقا بحسب حيث كما أيضا أيضًا الآن اليوم شركة".split(/\s+/),
);

function normalizeArabic(token: string): string {
  let t = token
    .replace(/[\u064B-\u0652\u0640]/g, "") // diacritics and tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
  if (t.length > 4) t = t.replace(/^(وال|بال|كال|فال|لل|ال)/, "");
  return t;
}

/** Content tokens of a headline (plus optional lead text) for similarity matching. */
export function tokenize(text: string): string[] {
  const normalized = text
    .replace(/[\u064B-\u0652\u0640]/g, "") // Arabic diacritics/tatweel would otherwise split words
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/(\w)[-.](\d)/g, "$1$2") // gpt-5 -> gpt5, m4.5 -> m45
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const out: string[] = [];
  for (const raw of normalized.split(/\s+/)) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw) || AR_STOPWORDS.has(raw)) continue;
    if (/[\u0600-\u06FF]/.test(raw)) {
      const t = normalizeArabic(raw);
      if (t.length >= 2 && !AR_STOPWORDS.has(t)) out.push(t);
      continue;
    }
    out.push(stem(raw));
  }
  return [...new Set(out)];
}
