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

export const CATEGORIES: CategoryDef[] = [
  // Technology
  { id: "ai", section: "tech", en: "Artificial Intelligence", ar: "الذكاء الاصطناعي" },
  { id: "software", section: "tech", en: "Software & Apps", ar: "البرمجيات والتطبيقات" },
  { id: "security", section: "tech", en: "Cybersecurity", ar: "الأمن السيبراني" },
  { id: "hardware", section: "tech", en: "PC Hardware & GPUs", ar: "عتاد الحاسوب وبطاقات الرسوميات" },
  { id: "chips", section: "tech", en: "CPUs & Semiconductors", ar: "المعالجات وأشباه الموصلات" },
  { id: "mobile", section: "tech", en: "Phones & Consumer Electronics", ar: "الهواتف والإلكترونيات الاستهلاكية" },
  { id: "os", section: "tech", en: "Operating Systems", ar: "أنظمة التشغيل" },
  { id: "dev", section: "tech", en: "Programming & Developers", ar: "البرمجة والمطورون" },
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
];

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
