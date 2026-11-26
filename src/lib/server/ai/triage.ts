// Turns the AI's classification of a story (one primary category, an optional secondary one,
// subject companies and guide/review/opinion flags) into the stored tags.
//
// The detailed topics found by the rules are kept only where they agree with the AI's
// categories; a category the rules missed gets a sensible default topic. So the filters,
// dashboard and report all follow the AI's reading, and the rules only add detail.
import { CATEGORIES, groupOfTopic, MORE_TOPIC_IDS, type Section } from "@/lib/shared/taxonomy";
import type { TriageItem } from "./prompt";

const BUSINESS_EVENT_TOPIC: Record<string, string> = {
  earnings: "earnings",
  acquisition: "acquisitions",
  layoffs: "layoffs",
  leadership: "leadership",
  partnership: "partnerships",
  funding: "strategy",
  pricing: "strategy",
};

export interface TriageInput {
  categories: string[];
  sections: string[];
  eventType: string;
  sourceSection: string;
  /** Company whose own newsroom published the story. */
  sourceCompany?: string;
}

export interface TriageTags {
  primary: string;
  secondary: string | null;
  categories: string[];
  sections: Section[];
  companies: string[];
  eventType: string;
}

export function triageTags(input: TriageInput, item: Pick<TriageItem, "primary_category" | "secondary_category" | "companies" | "buyers_guide" | "review" | "opinion">): TriageTags {
  const primary: string = item.primary_category;
  const secondary: string | null = item.secondary_category === "none" || item.secondary_category === primary ? null : item.secondary_category;
  const groups: string[] = [primary, secondary].filter((g): g is string => !!g && g !== "other");

  // Rule topics that agree with the AI. "Product announcements" never makes a story Business on its own.
  let topics = input.categories.filter((t) => t !== "products" && (groups.includes(groupOfTopic(t)) || (primary === "other" && MORE_TOPIC_IDS.includes(t))));
  for (const g of groups) {
    if (topics.some((t) => groupOfTopic(t) === g)) continue;
    if (g === "business") topics.push(BUSINESS_EVENT_TOPIC[input.eventType] ?? "strategy");
    else if (g === "hardware-gaming") topics.push(input.sections.includes("gaming") || input.sourceSection === "gaming" ? "game-industry" : "hardware");
    else topics.push(g);
  }
  topics = [...new Set(topics)].slice(0, 4);

  const sections = new Set<Section>();
  for (const t of topics) {
    const def = CATEGORIES.find((c) => c.id === t);
    if (def) sections.add(def.section);
  }
  if (groups.includes("business")) sections.add("business");
  else sections.delete("business");
  if (!sections.has("tech") && !sections.has("gaming")) {
    for (const s of input.sections) if (s === "tech" || s === "gaming") sections.add(s);
    if (!sections.has("tech") && !sections.has("gaming")) sections.add(input.sourceSection === "gaming" ? "gaming" : "tech");
  }

  const companies = [...new Set([...item.companies, ...(input.sourceCompany ? [input.sourceCompany] : [])])];
  const eventType = item.buyers_guide || item.review ? "review" : item.opinion ? "opinion" : input.eventType;

  return { primary, secondary, categories: topics, sections: [...sections], companies, eventType };
}
