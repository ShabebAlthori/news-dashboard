import { describe, expect, it } from "vitest";
import { classify } from "@/lib/server/classify";
import { sourceById } from "@/lib/server/sources";

const tech = sourceById("verge")!;
const gaming = sourceById("eurogamer")!;
const official = sourceById("nvidia-news")!;

const run = (title: string, source = tech, text = "") => classify({ title, text, feedCategories: [], source });

describe("excluded topics", () => {
  it.each([
    ["NordVPN Coupons: 75% Off + 3 Months Free", "deals"],
    ["16 Best Black Friday Headphone Deals (2026): Up to 57% Off", "deals"],
    ["512GB MacBook Neo drops to $699 — comes with Touch ID", "deals"],
    ["How to steal the Schafter V12 in GTA 6", "guides"],
    ["All GTA 6 Kitty Litter lab locations", "guides"],
    ["Wordle today: hints and answer for November 25", "puzzles"],
    ["Election Deniers Despair Because Even Donald Trump Isn't Buying It", "politics"],
    ["Trump claims credit for Jensen Huang's return to Nvidia", "politics"],
    ["Ukraine sinks Russian warship in the Black Sea", "politics"],
    ["Apple TV becomes the new U.S. home of F1 ACADEMY, the all-female racing series", "sports"],
    ["Team Liquid beats Fnatic to win the esports grand final", "sports"],
    ["Rings of Power Renewed by Amazon for Season 4", "entertainment"],
    ["Amazon casts Deborah Ann Woll as Faye in God of War live-action series", "entertainment"],
    ["Official PlayStation Podcast Episode 553: Peak Gaming", "roundup"],
    ["Fans are furious after this hilarious meme goes viral", "clickbait"],
  ])("excludes %s as %s", (title, reason) => {
    const c = run(title, title.includes("PlayStation") || title.includes("GTA") ? gaming : tech);
    expect(c.excluded).toBe(true);
    expect(c.excludeReason).toBe(reason);
  });

  it("does not mistake business deals, sports games or game titles for excluded topics", () => {
    expect(run("Microsoft closes $69 billion deal to buy Activision Blizzard").excluded).toBe(false);
    expect(run("EA Sports FC 26 sells 10 million copies", gaming).excluded).toBe(false);
    expect(run("Marathon's new runner shell is a jet-propelled robot samurai", gaming).excluded).toBe(false);
    expect(run("Spanish LaLiga confirms hackers stole soccer fans' personal data").excluded).toBe(false);
  });

  it("keeps tech regulation as policy but drops general politics", () => {
    const c = run("EU fines Apple €1.8 billion in App Store antitrust case");
    expect(c.excluded).toBe(false);
    expect(c.eventType).toBe("regulation");
    expect(run("Senate passes new immigration bill").excluded).toBe(true);
  });
});

describe("categories, companies and events", () => {
  it("tags leadership changes at tracked companies as major business news", () => {
    const c = run("NVIDIA Board Reinstates Jensen Huang as President, CEO and Board Director", official);
    expect(c.companies).toContain("nvidia");
    expect(c.eventType).toBe("leadership");
    expect(c.sections).toContain("business");
    expect(c.categories).toContain("leadership");
    expect(c.significance).toBeGreaterThan(0.8);
  });

  it("recognizes security incidents and does not read Cyberpunk as cyber security", () => {
    const sec = run("Microsoft Azure flaw exploited to steal customers' API credentials");
    expect(sec.eventType).toBe("security-incident");
    expect(sec.categories).toContain("security");
    const game = run("Cyberpunk 2's development team has grown, with plans to get even bigger", gaming);
    expect(game.categories).not.toContain("security");
  });

  it("flags rumours and lowers their significance", () => {
    const confirmed = run("Sony announces PS6 for 2028");
    const rumour = run("Sony reportedly plans PS6 for 2028, according to insiders");
    expect(rumour.rumor).toBe(true);
    expect(rumour.significance).toBeLessThan(confirmed.significance);
  });

  it("drops stories unrelated to tech, gaming or tracked companies", () => {
    expect(run("Back-to-back measles deaths is our new reality").excludeReason).toBe("off-topic");
  });
});
