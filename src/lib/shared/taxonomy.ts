// Client-safe taxonomy: sections, categories and tracked companies.
// Keep this file free of server-only imports — it is bundled into the UI.

export type Section = "tech" | "gaming" | "business";

export interface CategoryDef {
  id: string;
  section: Section;
  en: string;
  ar: string;
}

export const SECTIONS: { id: Section; en: string; ar: string }[] = [
  { id: "tech", en: "Technology", ar: "التقنية" },
  { id: "gaming", en: "Gaming", ar: "الألعاب" },
  { id: "business", en: "Companies & Business", ar: "الشركات والأعمال" },
];

/**
 * Fine-grained topics. Articles are tagged with these ids (stored in the database), and
 * each topic belongs to one of the reader's priority categories below.
 */
export const CATEGORIES: CategoryDef[] = [
  // Technology
  { id: "data", section: "tech", en: "Data & Analytics", ar: "البيانات والتحليلات" },
  { id: "ai", section: "tech", en: "AI & Artificial Intelligence", ar: "الذكاء الاصطناعي" },
  { id: "dev", section: "tech", en: "Programming & Open Source", ar: "البرمجة والمصادر المفتوحة" },
  { id: "security", section: "tech", en: "Cybersecurity & Hacking", ar: "الأمن السيبراني والاختراق" },
  { id: "hardware", section: "tech", en: "PC Hardware & GPUs", ar: "عتاد الحاسوب وبطاقات الرسوميات" },
  { id: "chips", section: "tech", en: "CPUs & Semiconductors", ar: "المعالجات وأشباه الموصلات" },
  { id: "saudi", section: "tech", en: "Saudi Technology & Startups", ar: "التقنية والشركات الناشئة في السعودية" },
  { id: "robotics", section: "tech", en: "Robotics", ar: "الروبوتات" },
  { id: "software", section: "tech", en: "Software & Apps", ar: "البرمجيات والتطبيقات" },
  { id: "mobile", section: "tech", en: "Phones & Consumer Electronics", ar: "الهواتف والإلكترونيات الاستهلاكية" },
  { id: "os", section: "tech", en: "Operating Systems", ar: "أنظمة التشغيل" },
  // Gaming
  { id: "pc-gaming", section: "gaming", en: "PC Gaming", ar: "ألعاب الحاسوب" },
  { id: "consoles", section: "gaming", en: "PlayStation, Xbox & Nintendo", ar: "بلايستيشن وإكس بوكس ونينتندو" },
  { id: "releases", section: "gaming", en: "Releases & Announcements", ar: "الإصدارات والإعلانات" },
  { id: "game-industry", section: "gaming", en: "Gaming Industry", ar: "صناعة الألعاب" },
  { id: "gaming-hardware", section: "gaming", en: "Gaming Hardware", ar: "عتاد الألعاب" },
  { id: "platforms", section: "gaming", en: "Steam & Platforms", ar: "ستيم والمنصات الرقمية" },
  { id: "engines", section: "gaming", en: "Game Engines", ar: "محركات الألعاب" },
  { id: "esports-business", section: "gaming", en: "Esports Business", ar: "أعمال الرياضات الإلكترونية" },
  // Business
  { id: "earnings", section: "business", en: "Earnings & Results", ar: "النتائج المالية" },
  { id: "acquisitions", section: "business", en: "Acquisitions & Mergers", ar: "الاستحواذات والاندماجات" },
  { id: "partnerships", section: "business", en: "Partnerships", ar: "الشراكات" },
  { id: "layoffs", section: "business", en: "Layoffs & Restructuring", ar: "تسريح الموظفين وإعادة الهيكلة" },
  { id: "leadership", section: "business", en: "Leadership Changes", ar: "تغييرات القيادة" },
  { id: "strategy", section: "business", en: "Strategy & Investment", ar: "الاستراتيجية والاستثمار" },
  { id: "products", section: "business", en: "Product Announcements", ar: "إعلانات المنتجات" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function categoriesFor(section: Section): CategoryDef[] {
  return CATEGORIES.filter((c) => c.section === section);
}

export function categoryById(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Reader-facing categories, in the reader's default priority order.

export interface PriorityCategory {
  id: string;
  en: string;
  ar: string;
  /** Topic ids (above) that belong to this category. */
  topics: string[];
}

/** One-line description of each category (category pages). */
export const CATEGORY_ABOUT: Record<string, { en: string; ar: string }> = {
  data: {
    en: "Data platforms, analytics and BI, data engineering, and the databases underneath them.",
    ar: "منصات البيانات والتحليلات وذكاء الأعمال وهندسة البيانات وقواعد البيانات التي تقوم عليها.",
  },
  ai: { en: "Models, research, products and policy across artificial intelligence.", ar: "النماذج والأبحاث والمنتجات والسياسات في عالم الذكاء الاصطناعي." },
  business: {
    en: "Earnings, deals, funding, leadership changes and strategy at technology companies.",
    ar: "النتائج المالية والصفقات والتمويل وتغييرات القيادة واستراتيجيات شركات التقنية.",
  },
  dev: { en: "Languages, frameworks, developer tools and open-source projects.", ar: "لغات البرمجة وأطر العمل وأدوات المطوّرين ومشاريع المصادر المفتوحة." },
  security: { en: "Breaches, vulnerabilities, threat research and the tools that defend against them.", ar: "الاختراقات والثغرات وأبحاث التهديدات وأدوات الحماية منها." },
  "hardware-gaming": {
    en: "CPUs, GPUs and PC hardware, consoles, games and the games industry.",
    ar: "المعالجات وبطاقات الرسوميات وعتاد الحاسوب، والمنصات المنزلية والألعاب وصناعتها.",
  },
  saudi: { en: "Technology, startups and digital transformation in Saudi Arabia.", ar: "التقنية والشركات الناشئة والتحوّل الرقمي في المملكة العربية السعودية." },
  robotics: {
    en: "Robots, drones, autonomous machines and the electronics behind them.",
    ar: "الروبوتات والطائرات المسيّرة والآلات ذاتية التشغيل والإلكترونيات التي تقف خلفها.",
  },
};

export const PRIORITY_CATEGORIES: PriorityCategory[] = [
  { id: "data", en: "Data & Analytics", ar: "البيانات والتحليلات", topics: ["data"] },
  { id: "ai", en: "AI & Artificial Intelligence", ar: "الذكاء الاصطناعي", topics: ["ai"] },
  {
    id: "business",
    en: "Business & Financial Results",
    ar: "الأعمال والنتائج المالية",
    topics: ["earnings", "acquisitions", "partnerships", "layoffs", "leadership", "strategy", "products"],
  },
  { id: "dev", en: "Programming & Open Source", ar: "البرمجة والمصادر المفتوحة", topics: ["dev"] },
  { id: "security", en: "Cybersecurity & Hacking", ar: "الأمن السيبراني والاختراق", topics: ["security"] },
  {
    id: "hardware-gaming",
    en: "PC Hardware & Gaming",
    ar: "عتاد الحاسوب والألعاب",
    topics: ["hardware", "chips", "pc-gaming", "consoles", "releases", "game-industry", "gaming-hardware", "platforms", "engines", "esports-business"],
  },
  { id: "saudi", en: "Saudi Technology & Startups", ar: "التقنية والشركات الناشئة في السعودية", topics: ["saudi"] },
  { id: "robotics", en: "Robotics & Electronics", ar: "الروبوتات والإلكترونيات", topics: ["robotics"] },
];

export const PRIORITY_IDS = PRIORITY_CATEGORIES.map((c) => c.id);

/** Topics outside the priority list; kept (nothing is hidden) but ranked below it. */
export const MORE_TOPIC_IDS = ["software", "mobile", "os"];

/** Everything a reader can switch on or off: the 8 priority categories plus the extra topics. */
export const INTEREST_IDS = [...PRIORITY_IDS, ...MORE_TOPIC_IDS];

const TOPIC_TO_GROUP = new Map<string, string>();
for (const g of PRIORITY_CATEGORIES) for (const t of g.topics) TOPIC_TO_GROUP.set(t, g.id);

/** The priority category a topic belongs to (or the topic itself for "more topics"). */
export function groupOfTopic(topic: string): string {
  return TOPIC_TO_GROUP.get(topic) ?? topic;
}

/** Topic ids covered by a category or topic id (for filtering). */
export function topicsOf(id: string): string[] {
  return PRIORITY_CATEGORIES.find((g) => g.id === id)?.topics ?? [id];
}

/** All ids accepted as a category filter: priority categories and individual topics. */
export const FILTER_IDS = [...new Set([...PRIORITY_IDS, ...CATEGORY_IDS])];

/** Dashboard category chips, in this exact order ("all" = no filter), with short labels. */
export const DASHBOARD_CHIPS: { id: string; en: string; ar: string }[] = [
  { id: "all", en: "All", ar: "الكل" },
  { id: "data", en: "Data & Analytics", ar: "البيانات والتحليلات" },
  { id: "ai", en: "AI", ar: "الذكاء الاصطناعي" },
  { id: "business", en: "Business", ar: "الأعمال" },
  { id: "dev", en: "Programming", ar: "البرمجة" },
  { id: "security", en: "Cybersecurity", ar: "الأمن السيبراني" },
  { id: "hardware-gaming", en: "Hardware & Gaming", ar: "العتاد والألعاب" },
  { id: "saudi", en: "Saudi Tech", ar: "التقنية السعودية" },
  { id: "robotics", en: "Robotics", ar: "الروبوتات" },
];

/** Short label for a priority category (badges, chips); falls back to the full label. */
export function shortCategoryLabel(id: string): { en: string; ar: string } | undefined {
  return DASHBOARD_CHIPS.find((c) => c.id === id && id !== "all") ?? categoryLabel(id);
}

/** Display label for a priority category or a topic. */
export function categoryLabel(id: string): { en: string; ar: string } | undefined {
  return PRIORITY_CATEGORIES.find((g) => g.id === id) ?? categoryById(id);
}

/**
 * Topics that describe what a story is about. "Product announcements" is a weak signal on its
 * own: a GTA 6 or GPU launch belongs to its subject, not to Business, when another topic exists.
 */
export function subjectTopics(topics: string[]): string[] {
  return topics.length > 1 ? topics.filter((t) => t !== "products") : topics;
}

/** The category a story is labelled with (badges, report sections). An AI-chosen primary category wins. */
export function storyCategory(topics: string[], order: string[] = PRIORITY_IDS, primary?: string | null): string | undefined {
  if (primary && (PRIORITY_IDS.includes(primary) || MORE_TOPIC_IDS.includes(primary))) return primary;
  const subject = subjectTopics(topics);
  return primaryCategory(subject, order) ?? (subject[0] ? groupOfTopic(subject[0]) : undefined);
}

/** The story's highest-priority category, following the reader's order. */
export function primaryCategory(topics: string[], order: string[] = PRIORITY_IDS): string | undefined {
  const groups = [...new Set(topics.map(groupOfTopic))];
  let best: string | undefined;
  let bestRank = Infinity;
  for (const g of groups) {
    const rank = order.indexOf(g);
    const r = rank === -1 ? 100 + MORE_TOPIC_IDS.indexOf(g) : rank;
    if (r < bestRank) {
      bestRank = r;
      best = g;
    }
  }
  return best;
}

export interface CompanyDef {
  id: string;
  en: string;
  ar: string;
  /** 1 = industry bellwether, 2 = major, 3 = notable */
  tier: 1 | 2 | 3;
  /** Listed explicitly by the user as a must-track company. */
  core: boolean;
}

export const COMPANIES: CompanyDef[] = [
  { id: "microsoft", en: "Microsoft", ar: "مايكروسوفت", tier: 1, core: true },
  { id: "google", en: "Google", ar: "جوجل", tier: 1, core: true },
  { id: "apple", en: "Apple", ar: "آبل", tier: 1, core: true },
  { id: "nvidia", en: "NVIDIA", ar: "إنفيديا", tier: 1, core: true },
  { id: "amd", en: "AMD", ar: "AMD", tier: 1, core: true },
  { id: "intel", en: "Intel", ar: "إنتل", tier: 1, core: true },
  { id: "amazon", en: "Amazon", ar: "أمازون", tier: 1, core: true },
  { id: "meta", en: "Meta", ar: "ميتا", tier: 1, core: true },
  { id: "openai", en: "OpenAI", ar: "OpenAI", tier: 1, core: true },
  { id: "anthropic", en: "Anthropic", ar: "Anthropic", tier: 2, core: true },
  { id: "sony", en: "Sony", ar: "سوني", tier: 1, core: true },
  { id: "samsung", en: "Samsung", ar: "سامسونج", tier: 1, core: true },
  { id: "qualcomm", en: "Qualcomm", ar: "كوالكوم", tier: 2, core: true },
  { id: "valve", en: "Valve", ar: "فالف", tier: 2, core: true },
  { id: "tencent", en: "Tencent", ar: "تينسنت", tier: 2, core: true },
  { id: "nintendo", en: "Nintendo", ar: "نينتندو", tier: 1, core: true },
  { id: "ea", en: "Electronic Arts", ar: "إلكترونيك آرتس", tier: 2, core: true },
  { id: "take-two", en: "Take-Two", ar: "تيك-تو", tier: 2, core: true },
  // Other major companies worth following
  { id: "tsmc", en: "TSMC", ar: "TSMC", tier: 1, core: false },
  { id: "arm", en: "Arm", ar: "Arm", tier: 2, core: false },
  { id: "xai", en: "xAI", ar: "xAI", tier: 3, core: false },
  { id: "bytedance", en: "ByteDance / TikTok", ar: "بايت دانس / تيك توك", tier: 2, core: false },
  { id: "epic", en: "Epic Games", ar: "إيبك جيمز", tier: 2, core: false },
  { id: "ubisoft", en: "Ubisoft", ar: "يوبيسوفت", tier: 3, core: false },
  // Data platforms
  { id: "databricks", en: "Databricks", ar: "داتابريكس", tier: 2, core: true },
  { id: "snowflake", en: "Snowflake", ar: "سنوفليك", tier: 2, core: true },
  { id: "palantir", en: "Palantir", ar: "بالانتير", tier: 2, core: true },
];

/** Companies shown in Trending Companies, in this order when activity ties. */
export const TRENDING_COMPANY_IDS = ["nvidia", "microsoft", "google", "apple", "amazon", "amd", "intel", "openai", "anthropic", "databricks", "snowflake", "palantir"];

export const COMPANY_IDS = COMPANIES.map((c) => c.id);

export function companyById(id: string): CompanyDef | undefined {
  return COMPANIES.find((c) => c.id === id);
}

export type EventType =
  | "acquisition"
  | "earnings"
  | "layoffs"
  | "leadership"
  | "security-incident"
  | "launch"
  | "regulation"
  | "partnership"
  | "funding"
  | "outage"
  | "pricing"
  | "delay"
  | "update"
  | "review"
  | "opinion"
  | "general";

export const EVENT_LABELS: Record<EventType, { en: string; ar: string }> = {
  acquisition: { en: "Acquisition", ar: "استحواذ" },
  earnings: { en: "Earnings", ar: "نتائج مالية" },
  layoffs: { en: "Layoffs", ar: "تسريح موظفين" },
  leadership: { en: "Leadership", ar: "تغيير قيادي" },
  "security-incident": { en: "Security incident", ar: "حادث أمني" },
  launch: { en: "Announcement", ar: "إعلان" },
  regulation: { en: "Regulation & legal", ar: "تنظيم وقضاء" },
  partnership: { en: "Partnership", ar: "شراكة" },
  funding: { en: "Funding", ar: "تمويل" },
  outage: { en: "Outage", ar: "انقطاع خدمة" },
  pricing: { en: "Pricing", ar: "الأسعار" },
  delay: { en: "Delay", ar: "تأجيل" },
  update: { en: "Update", ar: "تحديث" },
  review: { en: "Review", ar: "مراجعة" },
  opinion: { en: "Analysis", ar: "تحليل" },
  general: { en: "News", ar: "خبر" },
};

export type ImportanceTier = "major" | "notable" | "standard" | "minor";

export function tierForScore(score: number): ImportanceTier {
  if (score >= 72) return "major";
  if (score >= 55) return "notable";
  if (score >= 38) return "standard";
  return "minor";
}
