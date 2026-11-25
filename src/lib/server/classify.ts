// Rule-based news classifier: topic exclusion, sections, categories, companies,
// event type and a heuristic significance score.
//
// Rules are deliberately explicit and conservative so that every decision can be
// explained. When an AI provider is configured, its judgement is combined with
// these rules later in the pipeline (see ai/index.ts); the rules never depend on it.

import { CATEGORIES, companyById, type EventType, type Section } from "@/lib/shared/taxonomy";
import type { SourceDef } from "./sources";

export type ExcludeReason =
  | "politics"
  | "sports"
  | "celebrity"
  | "entertainment"
  | "deals"
  | "guides"
  | "puzzles"
  | "clickbait"
  | "sponsored"
  | "roundup"
  | "off-topic";

export interface ClassifyInput {
  title: string;
  text: string; // plain text from the feed (description/content)
  feedCategories: string[];
  source: Pick<SourceDef, "id" | "section" | "company" | "defaults" | "kind">;
}

export interface Classification {
  excluded: boolean;
  excludeReason: ExcludeReason | null;
  sections: Section[];
  categories: string[];
  companies: string[];
  titleCompanies: string[];
  eventType: EventType;
  significance: number; // 0..1
  rumor: boolean;
  policy: boolean; // tech regulation/policy story (kept unless the user disables it)
  clickbaitPenalty: number; // 0..1
}

// ---------------------------------------------------------------------------
// Pattern helpers

const any = (re: RegExp, s: string) => re.test(s);

function countDistinct(patterns: RegExp[], s: string): number {
  let n = 0;
  for (const p of patterns) if (p.test(s)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Exclusion patterns

const HARD_POLITICS = [
  /\b(elections?|electoral|ballots?|polling stations?|voters?|voting rights|midterms?|campaign trail|presidential (race|campaign|candidate|debate)|inaugurat(ion|ed))\b/i,
  /\b(republicans?|democrats?|gop|partisan|left-wing|right-wing|far-right|far-left|maga)\b/i,
  /\b(war in (ukraine|gaza|the middle east|iran|sudan|lebanon)|ukraine war|russia[- ]ukraine|israel[- ]hamas|gaza|hamas|hezbollah|houthis?|airstrikes?|missile strikes?|ceasefire|invasion of|troops|military coup|genocide|refugees?|deportations?|immigration|ice raids?|border wall|abortion|gun control|impeach(ment|ed)?)\b/i,
];

/** Geopolitical conflict terms; skipped for cybersecurity stories, which often name countries. */
const CONFLICT = /\b(ukraine|ukrainian|russian (warship|military|forces|troops|invasion)|warships?|kremlin|nato|military strikes?|drone strikes?|war crimes?)\b/i;

const POLITICIANS =
  /\b(trump|biden|vance|kamala|harris administration|putin|xi jinping|zelensk[iy]y?|netanyahu|modi|starmer|macron|erdogan|musk'?s doge|rfk|desantis|newsom|pelosi|schumer|mcconnell)\b/i;

const SOFT_POLITICS =
  /\b(congress(ional)?|senate|senators?|lawmakers?|legislators?|white house|parliament|prime minister|ministers?|governor|mayor|politic(s|al|ians?)|government shutdown|executive order|state department|pentagon|doge|federal government|administration|geopolitic\w*|sanctions?|tariffs?)\b/i;

const REGULATION_CONTEXT =
  /\b(antitrust|regulat\w+|ftc|doj|justice department|competition (authority|regulator|watchdog)|cma|european commission|\beu\b|dma|dsa|fine[sd]?|lawsuit|sues?|sued|court|ruling|judge|ban on|banned (in|by)|export (controls?|rules?|restrictions?|licen[cs]es?)|tariffs?|chips act|privacy (law|rules)|probe|investigation|settlement|approv(al|es|ed)|blocks?|ai (act|bill|law|rules|safety)|data protection|gdpr)\b/i;

const TECH_POLICY_TOPIC =
  /\b(ai|artificial intelligence|chips?|semiconductors?|privacy|encryption|cyber(?!punk)\w*|data|tech|technology|internet|broadband|spectrum|5g|social media|platforms?|app stores?|video games?|gaming|loot boxes)\b/i;

const SPORTS_STRONG =
  /\b(nfl|nba|mlb|nhl|mls|premier league|champions league|la ?liga|serie a|bundesliga|fifa world cup|world cup|uefa|olympics?|olympic games|paralympics?|formula (one|1)|f1 academy|nascar|indycar|motogp|wimbledon|pga tour|ufc|super bowl|touchdown|quarterback|transfer window|tour de france|stanley cup|world series|thursday night football|monday night football)\b/i;
const SPORTS_WEAK =
  /\b(football|soccer|f1|tennis|golf(er)?s?|boxing|cricket|rugby|grand slam|marathon|athletes?|sports? (betting|league|team|teams|fans|streaming rights)|racing series)\b/i;

const VIDEO_GAME_SPORTS =
  /\b(ea sports|ea fc|fc \d{2}|fifa \d{2}|madden|nba 2k\d*|2k\d{2}|mlb the show|nhl \d{2}|f1 \d{2}|f1 manager|football manager|rocket league|wwe 2k|pga tour 2k|top spin|video ?games?|esports|gran turismo|forza)\b/i;

const ESPORTS = /\b(e-?sports?|pro (team|player|scene)|tournament|lan event|vct|iem|blast premier|the international|worlds 20\d\d|majors?)\b/i;
const ESPORTS_RESULTS =
  /\b(wins?|won|beats?|defeats?|eliminat\w+|grand finals?|finals?|semi-?finals?|quarter-?finals?|champions?|championship|bracket|standings|mvp|roster|signs? (player|coach)|playoffs?|recap|sweeps?|upset)\b/i;
const ESPORTS_BUSINESS =
  /\b(revenue|invest\w*|funding|sponsor\w*|layoffs?|lays off|acquir\w+|acquisition|shut(s|ting)? down|closure|partnership|franchise|viewership|valuation|bankrupt\w*|business|budget|cuts|ewc|esports world cup|league (ends|closes)|prize pool|broadcast rights|investors?)\b/i;

const CELEBRITY =
  /\b(celebrit(y|ies)|kardashians?|red carpet|dating|divorce[sd]?|engaged|wedding|pregnan\w+|beyonc[eé]|taylor swift|kanye|paparazzi|royal family|prince harry|meghan markle|influencer drama)\b/i;

const ENTERTAINMENT =
  /\b(movies?|films?|box office|cinemas?|tv (show|series)|television series|season \d+ (premiere|finale|episode|trailer|renewal)|episodes? \d+|showrunner|series finale|netflix (series|show|original)|hbo|max original|disney\+|apple tv\+|prime video|hulu|paramount\+|peacock|anime|manga|comic books?|comics|dc studios|actors?|actress(es)?|screenplay|oscars?|emmys?|grammys?|golden globes|albums?|concerts?|tour dates|reality (show|tv)|sitcom|live-action|cast(s|ing)? (as|for)|biopic|documentary|streaming series|renewed (by \w+ )?for (a )?season|(tv|series|film|movie) adaptation|first look at .{1,40} in|avengers|mcu|marvel studios|rings of power|box-office)\b/i;

/** Film/TV adaptation news is entertainment even when it mentions games. */
const STRONG_ENTERTAINMENT =
  /\b(live-action|tv (show|series|adaptation)|television (show|series|adaptation)|(movie|film|series) adaptation|box office|casts? [A-Z][\w'’]+ [A-Z][\w'’]+ (as|in)|cast as|season \d+ of the (show|series)|(netflix|hbo|prime video|disney\+|apple tv\+|paramount\+)(['’]s)? (show|series|adaptation|film|movie)|trailer for the (movie|film|show|series)|showrunner)\b/;

const ENTERTAINMENT_FEED_CATEGORY = /^(movies?|films?|tv|television|comics?|anime|entertainment|celebrity|music|streaming|culture)$/i;

const DEALS =
  /(\b\d{1,2}% off\b|\bsave (up to )?\$?\d|\$\d+ off\b|\blowest price\b|\bprice drop\b|\bon sale\b|\bsale price\b|\bcoupons?\b|\bpromo codes?\b|\bdiscount codes?\b|\bblack friday\b|\bcyber monday\b|\bprime (big deal )?day\b|\bdeal alert\b|\bdeals? (of the day|roundup)\b|\b(best|top|early|great|amazing|biggest|excellent|epic|rare) .{0,40}\bdeals?\b|\bdeals? on (the |a |an )?\w|\bat (its|their) lowest\b|\bfor just \$|\bgift (guide|ideas)\b|\bgifts? (for|that|developers|gamers)\b|\bstocking stuffers?\b|\bholiday shopping\b|\bbuy now\b|\bpreorders? (are )?(live|open)\b|\bwhere to (buy|pre-?order)\b|\bback in stock\b|\brestock\b|\bdiscounted\b|\bclearance\b|\bgrab (a|an|the|this|these)\b|\bdrops? to \$\d|\bfor \$[\d,]+\.\d{2}\b|\b(now|just|only) \$\d|\bdeal\b.*\$\d+)/i;

const GUIDES =
  /(\bhow to\b|\bguide\b|\bwalkthrough\b|\bwhere to find\b|\bhow (do|can) (i|you)\b|\btips (and|&) tricks\b|\beverything (you need to know|we know)\b|\bending explained\b|\btier list\b|\bbest (builds?|loadouts?|settings|weapons?|perks?|classes|cards|decks|teams?|characters?|mods)\b|\ball [\w' -]{1,30} locations\b|\bmission list\b|\bmissions? in order\b|\bcodes? \((\w+ )?\d{4}\)|\bredeem codes?\b|\b(active|working) codes\b|\bcheats?\b|\bshould you\b|\bunlock(ing)? (all|every)\b|\bfaq\b|\bbeginners?'? \b|\bwhen does .{1,60} (release|come out|launch|unlock)\b|\bwhat time does\b|\brelease times?\b|\bcountdown\b|\bstep[- ]by[- ]step\b|\bcheat ?sheet\b|\bchange this .{1,40} setting\b|\bsettings? (you should|to change)\b|\bexplainer\b|\bwhat is .{1,40}\?$)/i;

const PUZZLES =
  /\b(wordle|quordle|connections (hints?|answers?|today|#?\d+)|nyt (connections|mini|strands|crossword)|strands (hints?|answers?|#?\d+)|(crossword|sudoku|spelling bee) (hints?|answers?|clues?|today)|daily (hints?|answers?)|hints? and answers?|answers? (today|for (today|\w+day))|today'?s answer|pips (hints|answers))\b/i;

const CLICKBAIT_STRONG =
  /\b(you won'?t believe|will blow your mind|this one (weird )?trick|goes viral|went viral|broke the internet|breaks the internet|internet is (losing it|obsessed|freaking out)|fans are (furious|losing it|freaking out|livid)|everyone is talking about|you need to (see|watch) this|jaw-dropping|hilarious|tiktok trend|people are (mad|furious|obsessed)|weirdest|funniest|cutest)\b/i;

const CLICKBAIT_SOFT =
  /\b(here'?s why|here'?s how|this is why|the reason why|you should|insane|crazy|wild|slams|roasts|destroys|blasts|claps back|drama|outrage|meltdown|furious|epic fail|bizarre)\b/i;

const SPONSORED = /\b(sponsored|partner content|advertorial|paid (post|content)|in partnership with|presented by|brought to you by)\b/i;

const ROUNDUP =
  /\b(podcast|episode \d+|weekly (recap|roundup|digest)|this week in|week in review|news roundup|the week'?s biggest|newsletter|live ?blog|live updates|recap:|morning (brief|digest)|daily digest|what we'?re (playing|reading|watching))\b/i;

// ---------------------------------------------------------------------------
// Topic patterns (categories)

const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  ai: [
    /\b(ai|a\.i\.|artificial intelligence|machine learning|deep learning|llms?|large language models?|chatbots?|chatgpt|gpt-?\d|gemini|claude|copilot|openai|anthropic|deepmind|generative|gen ?ai|neural|agentic|ai agents?|inference|frontier models?|reasoning models?|sora|llama \d|mistral|xai|grok|deepseek|qwen|midjourney|stable diffusion|superintelligence|agi)\b/i,
  ],
  software: [
    /\b(apps?|software|browsers?|chrome|firefox|safari|microsoft office|office 365|microsoft 365|saas|cloud|aws|azure|google cloud|subscription service|whatsapp|instagram|youtube|spotify|messaging|search engine|email|productivity|photoshop|adobe|figma|slack|zoom|teams app|threads|bluesky|x\.com|social network|streaming app|web app)\b/i,
  ],
  security: [
    /\b(security|cybersecurity|cyber(?!punk)\w*|hack(s|ed|er|ers|ing)?|breach(es|ed)?|ransomware|malware|vulnerabilit(y|ies)|zero-day|0-day|exploit(s|ed)?|cve-\d+|phishing|data (leak|breach|theft)|leaked data|spyware|backdoor|patch tuesday|botnets?|ddos|infostealers?|cyberattacks?|encryption|passkeys?|passwords?|threat actors?|apt\d+|shinyhunters|lazarus)\b/i,
  ],
  hardware: [
    /\b(gpus?|graphics cards?|geforce|rtx ?\d{3,4}|radeon|rx ?\d{4}|arc (a|b|c)\d{3}|motherboards?|ram|ddr[56]|ssds?|nvme|monitors?|laptops?|pc builds?|desktop pcs?|workstations?|vram|power supply|cpu coolers?|keyboards?|mini pcs?|graphics hardware|dgx|rtx spark)\b/i,
  ],
  chips: [
    /\b(cpus?|processors?|chips?|chipsets?|semiconductors?|chipmakers?|ryzen|epyc|threadripper|core ultra|xeon|snapdragon|exynos|tensor g\d|apple m\d|m\d (pro|max|ultra)|a\d{2} (bionic|pro)|tsmc|foundry|foundries|wafers?|[0-9]+ ?nm|18a|14a|risc-v|npus?|tpus?|hbm\d?|blackwell|rubin|grace hopper|nvlink|fabs?|lithography|asml|silicon)\b/i,
  ],
  mobile: [
    /\b(smartphones?|phones?|iphone|pixel \d+|pixel (watch|buds|fold|tablet)|galaxy|android phones?|ipad|tablets?|wearables?|smartwatch(es)?|apple watch|airpods|earbuds|headphones|foldables?|oneplus|xiaomi|vision pro|quest \d|vr headsets?|ar glasses|smart glasses|ray-ban meta|e-readers?|kindle|consumer electronics|smart home|smart tv|wearable)\b/i,
  ],
  os: [
    /\b(windows (10|11|12)|windows|macos|ios \d+|ios|ipados|watchos|visionos|android \d+|android|linux|kernel|chromeos|operating systems?|wsl|steamos|harmonyos|ubuntu|fedora|debian)\b/,
    /\b(operating system|linux kernel)\b/i,
  ],
  dev: [
    /\b(programming|programmers?|developers?|github|gitlab|git|apis?|sdks?|open[- ]source|python|javascript|typescript|rust|golang|kotlin|swift|compilers?|frameworks?|ides?|vs code|visual studio|coding|devops|kubernetes|docker|npm|pypi|repositor(y|ies)|llvm|webassembly|wasm|code review|software engineers?)\b/i,
  ],
  "pc-gaming": [
    /\b(pc games?|pc gaming|pc gamers?|on pc|pc port|pc version|steam|epic games store|gog|dlss|fsr|ray tracing|path tracing|mods?|modding|modders?|system requirements|pc release)\b/i,
  ],
  consoles: [
    /\b(playstation|ps5( pro)?|ps6|xbox|series x|series s|nintendo|switch 2|nintendo switch|consoles?|game pass|playstation plus|ps plus|xbox cloud|handheld (console|gaming))\b/i,
  ],
  releases: [
    /\b(release date|launch(es|ed)? (on|in|for)|out now|available now|early access|delay(s|ed)?|postpone(d|s)?|beta|demo|remaster(ed)?|remake|sequel|dlc|expansion|gameplay reveal|reveal trailer|announcement trailer|trailer|showcase|state of play|nintendo direct|xbox games showcase|the game awards|gamescom|summer game fest|tokyo game show|launch(es|ed)?|announced|announces|revealed)\b/i,
  ],
  "game-industry": [
    /\b(game (studio|studios|developer|developers|publisher|publishers|industry|sales)|studios?|publishers?|layoffs?|union(s|ize|ized)?|revenue|copies sold|sold \d+ million|sales (chart|figures|data)|circana|ceo|earnings|embracer|ubisoft|square enix|capcom|bandai namco|sega|krafton|nexon|netease|activision|blizzard|bethesda|rockstar|cd projekt|riot games|bungie|warner bros\.? games|devolver|annapurna|concurrent players|player count)\b/i,
  ],
  "gaming-hardware": [
    /\b(controllers?|dualsense|dualshock|steam deck|steam machine|steam frame|rog ally|legion go|handhelds?|gaming (monitor|headset|mouse|laptop|pc|chair|keyboard)|console hardware|switch 2 hardware|ps5 pro|joy-con)\b/i,
  ],
  platforms: [
    /\b(steam|game pass|ps plus|playstation plus|epic games store|gog|xbox cloud gaming|geforce now|itch\.io|storefronts?|app store|google play|game subscription|cloud gaming|nintendo eshop|eshop|steamworks)\b/i,
  ],
  engines: [/\b(unreal engine|ue5|ue6|unity( engine| 6)?|godot|game engines?|cryengine|id tech|frostbite|re engine|decima|source 2|blueprints)\b/i],
  "esports-business": [/\b(esports|e-sports)\b/i],
};

const GAMING_ANCHOR =
  /\b(video ?games?|games?|gaming|gamers?|gameplay|consoles?|playstation|ps[456]|xbox|nintendo|switch 2|steam|esports|dlc|multiplayer|rpg|mmo|fps|game pass|speedrun\w*|modders?|roguelike|soulslike|metroidvania|indie games?|gta|grand theft auto|fortnite|minecraft|roblox|call of duty|pok[eé]mon|zelda|mario|halo|battlefield|elden ring|cyberpunk)\b/i;

/** Tech/gaming companies we don't track individually but that anchor a story as on-topic. */
const OTHER_TECH_COMPANIES =
  /\b(huawei|xiaomi|lenovo|asus|acer|msi|dell|hp|hpe|cisco|ibm|oracle|salesforce|adobe|broadcom|micron|sk hynix|marvell|asml|globalfoundries|foxconn|supermicro|palantir|cloudflare|crowdstrike|palo alto networks|fortinet|okta|vmware|nutanix|rackspace|spotify|snap|reddit|pinterest|discord|telegram|signal app|proton|mozilla|wikipedia|perplexity|mistral|cohere|hugging face|databricks|snowflake|coreweave|cerebras|groq|figure ai|ubisoft|square enix|capcom|bandai namco|sega|krafton|nexon|netease|embracer|cd projekt|devolver|riot|bungie|blizzard|activision|bethesda|rockstar|gamestop|roblox|unity|niantic|razer|logitech|corsair|steelseries|nothing phone|oneplus|oppo|vivo|honor|motorola|garmin|sonos|dyson|starlink|spacex)\b/i;

// ---------------------------------------------------------------------------
// Companies

interface CompanyPattern {
  id: string;
  patterns: RegExp[];
}

const COMPANY_PATTERNS: CompanyPattern[] = [
  { id: "microsoft", patterns: [/\bMicrosoft\b/i, /\bXbox\b/i, /\bWindows (10|11|12|Server)\b/i, /\bAzure\b/i, /\bCopilot\b/, /\bSatya Nadella\b/i, /\bActivision\b/i, /\bBlizzard\b/i, /\bBethesda\b/i, /\bGitHub\b/i, /\bLinkedIn\b/, /\bMojang\b/i, /\bMinecraft\b/i] },
  { id: "google", patterns: [/\bGoogle\b/i, /\bAlphabet\b/, /\bAndroid\b/, /\bGemini\b/, /\bDeepMind\b/i, /\bYouTube\b/i, /\bPixel \d+/i, /\bPixel (Watch|Buds|Fold|Tablet)\b/i, /\bChrome(OS)?\b/, /\bWaymo\b/i, /\bSundar Pichai\b/i, /\bTPUs?\b/] },
  { id: "apple", patterns: [/\bApple\b/, /\biPhone/i, /\biPad/i, /\bMacBook/i, /\bmacOS\b/i, /\biOS \d+/, /\bwatchOS\b/i, /\bvisionOS\b/i, /\bVision Pro\b/i, /\bAirPods\b/i, /\bApple Watch\b/i, /\bTim Cook\b/i, /\bApple Intelligence\b/i] },
  { id: "nvidia", patterns: [/\bNvidia\b/i, /\bGeForce\b/i, /\bRTX\b/, /\bDLSS\b/, /\bCUDA\b/, /\bJensen Huang\b/i, /\bBlackwell\b/, /\bVera Rubin\b/i, /\bDGX\b/] },
  { id: "amd", patterns: [/\bAMD\b/, /\bRadeon\b/i, /\bRyzen\b/i, /\bEPYC\b/i, /\bThreadripper\b/i, /\bLisa Su\b/i, /\bInstinct MI\d+/i] },
  { id: "intel", patterns: [/\bIntel\b/, /\bCore Ultra\b/i, /\bXeon\b/i, /\bArc (A|B|C)\d{3}\b/, /\bLip-Bu Tan\b/i, /\bGaudi \d\b/i, /\bIntel Foundry\b/i, /\bPanther Lake\b/i, /\bNova Lake\b/i] },
  { id: "amazon", patterns: [/\bAmazon\b/, /\bAWS\b/, /\bAlexa\b/, /\bKindle\b/, /\bTwitch\b/, /\bAndy Jassy\b/i, /\bProject Kuiper\b/i, /\bAmazon Leo\b/i] },
  { id: "meta", patterns: [/\bMeta\b(?![-\w])/, /\bFacebook\b/i, /\bInstagram\b/i, /\bWhatsApp\b/i, /\bMeta Quest\b/i, /\bQuest \d\b/, /\bOculus\b/i, /\bReality Labs\b/i, /\bZuckerberg\b/i, /\bLlama \d/, /\bRay-Ban Meta\b/i] },
  { id: "openai", patterns: [/\bOpenAI\b/i, /\bChatGPT\b/i, /\bGPT-\d/i, /\bSam Altman\b/i, /\bSora\b/] },
  { id: "anthropic", patterns: [/\bAnthropic\b/i, /\bClaude\b/, /\bDario Amodei\b/i] },
  { id: "sony", patterns: [/\bSony\b/i, /\bPlayStation\b/i, /\bPS5\b/i, /\bPS6\b/i, /\bPS Plus\b/i, /\bPSVR ?2?\b/i, /\bBungie\b/i, /\bInsomniac\b/i, /\bNaughty Dog\b/i] },
  { id: "samsung", patterns: [/\bSamsung\b/i, /\bGalaxy (S|Z|A|Tab|Watch|Buds|Ring|XR|Book|SmartTag)/i, /\bExynos\b/i, /\bOne UI\b/i] },
  { id: "qualcomm", patterns: [/\bQualcomm\b/i, /\bSnapdragon\b/i, /\bCristiano Amon\b/i] },
  { id: "valve", patterns: [/\bValve\b/, /\bSteam\b/, /\bSteamOS\b/i, /\bGabe Newell\b/i, /\bHalf-Life\b/i, /\bCounter-Strike\b/i, /\bDota 2\b/i] },
  { id: "tencent", patterns: [/\bTencent\b/i, /\bWeChat\b/i, /\bRiot Games\b/i, /\bHonor of Kings\b/i, /\bTiMi\b/] },
  { id: "nintendo", patterns: [/\bNintendo\b/i, /\bSwitch 2\b/i, /\bSuper Mario\b/i, /\bZelda\b/i, /\bPok[eé]mon\b/i, /\bShuntaro Furukawa\b/i] },
  { id: "ea", patterns: [/\bElectronic Arts\b/i, /\bEA\b/, /\bEA Sports\b/i, /\bBattlefield\b/i, /\bApex Legends\b/i, /\bThe Sims\b/i, /\bBioWare\b/i, /\bRespawn\b/i] },
  { id: "take-two", patterns: [/\bTake-?Two\b/i, /\bRockstar\b/i, /\bGTA\b/, /\bGrand Theft Auto\b/i, /\b2K\b/, /\bStrauss Zelnick\b/i, /\bZynga\b/i, /\bGearbox\b/i] },
  { id: "tsmc", patterns: [/\bTSMC\b/, /\bTaiwan Semiconductor\b/i] },
  { id: "arm", patterns: [/\bArm Holdings\b/i, /\bArm\b(?= (chips?|cores?|architecture|-based|CEO|designs?|licen[cs]))/, /\bRene Haas\b/i] },
  { id: "xai", patterns: [/\bxAI\b/, /\bGrok\b/] },
  { id: "bytedance", patterns: [/\bByteDance\b/i, /\bTikTok\b/i] },
  { id: "epic", patterns: [/\bEpic Games\b/i, /\bFortnite\b/i, /\bUnreal Engine\b/i, /\bTim Sweeney\b/i] },
  { id: "ubisoft", patterns: [/\bUbisoft\b/i, /\bAssassin'?s Creed\b/i] },
];

export function detectCompanies(title: string, text: string): { all: string[]; inTitle: string[] } {
  const head = text.slice(0, 1200);
  const all: string[] = [];
  const inTitle: string[] = [];
  for (const c of COMPANY_PATTERNS) {
    const titleHit = c.patterns.some((p) => p.test(title));
    let bodyHits = 0;
    for (const p of c.patterns) {
      const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
      bodyHits += head.match(re)?.length ?? 0;
    }
    if (titleHit) inTitle.push(c.id);
    if (titleHit || bodyHits >= 2) all.push(c.id);
  }
  return { all, inTitle };
}

// ---------------------------------------------------------------------------
// Events & significance

const EVENT_RULES: { type: EventType; re: RegExp; base: number }[] = [
  { type: "acquisition", base: 0.86, re: /\b(acquir(e|es|ed|ing)|acquisition|buyout|takeover of|takes over|mergers?|merges? with|to merge with|snaps up|purchase of|deal to buy|agrees to buy|to buy [A-Z]|buys [A-Z]|completes? (its )?(\$[\d.]+ ?[mb]illion )?(purchase|deal|acquisition))\b/ },
  { type: "earnings", base: 0.72, re: /\b(earnings|quarterly (results|revenue|profit|sales)|q[1-4] (results|earnings|revenue|sales)|fiscal (q[1-4]|year|quarter)|(first|second|third|fourth)[- ]quarter|revenue (rises|falls|jumps|grows|surges|drops|beats|misses|climbs|soars)|beats (estimates|expectations)|misses (estimates|expectations)|profits? (rises?|falls?|jumps?|surges?|drops?|warning|plunges?)|guidance|record revenue|annual results|financial results)\b/i },
  { type: "layoffs", base: 0.78, re: /\b(layoffs?|lay(s|ing)? off|laid off|job cuts?|cuts? (\d[\d,]* )?(jobs|roles|staff|workers|employees)|cutting jobs|redundanc(y|ies)|restructur\w*|workforce reduction|downsiz\w*|merges (two|its|their|several)|studio closures?|clos(es|ing|ed) (the |its )?studios?|shut(s|ting)? down (the |its )?(studio|team|division))\b/i },
  { type: "leadership", base: 0.8, re: /\b((new|interim) (ceo|cfo|cto|chief executive)|(ceo|cfo|cto|chief executive|president|chair\w*|head of \w+|founder|boss) (steps down|resigns|retires|exits|departs|leaves|is out|ousted|fired|to step down|to retire|to leave)|steps? down as|stepping down|resign(s|ed)? as|appoint(s|ed)? .{0,40}(ceo|cfo|cto|chief|president|head)|names? .{0,40}(new )?(ceo|cfo|cto|chief executive|president)|succeed(s|ed)? .{0,30} as (ceo|chief)|leadership (change|shake-?up|transition)|gradual departure|successor|reinstat\w+ .{0,40}(as )?(ceo|chief executive)|new leadership|leadership team|returns? as (ceo|chief executive)|back as (ceo|chief executive))\b/i },
  { type: "security-incident", base: 0.62, re: /\b(breach(ed|es)?|hack(ed|ers?)|ransomware|zero-day|0-day|actively exploited|exploited|cyberattacks?|cyber-attacks?|data (leak|theft|stolen)|stole(n)? data|data stolen|malware|spyware|backdoor(ed)?|botnet|ddos|compromised|supply[- ]chain attack|critical (vulnerabilit\w+|flaws?|bugs?|patch\w*|vulns?)|vulnerabilit(y|ies)|security (flaw|bug|hole|incident)|cybersecurity incident|cve-\d+|infostealer|phishing|threat actors?)\b/i },
  { type: "outage", base: 0.6, re: /\b(outages?|went down|goes down|is down|services? (restored|disrupted)|disruption|downtime|knocked offline)\b/i },
  { type: "regulation", base: 0.62, re: /\b(antitrust|lawsuit|sues?|sued|suing|court|judge|ruling|rules? (that|against|in favor)|verdict|settle(s|d|ment)|fine[sd]?\b|penalt(y|ies)|regulators?|ftc|doj|european commission|competition (and markets )?authority|cma|dma|digital markets act|ban on|banned (in|by|from (the )?(us|eu|uk|china))|bans? (sales|imports|exports|the use|use of)|probe|investigation|class action|export (controls?|restrictions?|rules?|licen[cs]es?)|tariffs?|chips act|legislation)\b/i },
  { type: "funding", base: 0.5, re: /\b(raises? \$|raised \$|funding round|series [a-f]\b|seed round|valuation|valued at|ipo\b|goes public|public offering|spac)\b/i },
  { type: "partnership", base: 0.56, re: /\b(partner(s|ship|ing)? with|partnership|teams? up|collaborat\w+|alliance|joint venture|strikes? (a )?deal|signs? (a )?deal|multi-?year (deal|agreement)|agreement with|deal with|invest(s|ing|ment)? \$?[\d.]+ ?(billion|bn|million)|to invest|commits? \$|\$[\d.]+ ?(billion|bn) (deal|investment|contract)|expand(s|ed)? .{0,30} (partnership|collaboration))\b/i },
  { type: "pricing", base: 0.58, re: /\b(price (increase|hike|cut|change)s?|raises? (the )?prices?|prices? (rise|go up|increase|hike)|cuts? (the )?price|more expensive|subscription (price|cost)s?|priced at \$|now costs?)\b/i },
  { type: "delay", base: 0.56, re: /\b(delay(s|ed)?|postpone(s|d)?|pushed back|slips? (to|into)|cancel(s|ed|led|lation)?)\b/i },
  { type: "launch", base: 0.54, re: /\b(launch(es|ed)?(?![- ]day)|announc(es|ed|ement)|unveil(s|ed)?|introduc(es|ed|ing)|debut(s|ed)?|reveal(s|ed)?|release(s|d)?|rolls? out|rolling out|now available|available now|out now|ships?|shipping|coming (to|in)|arrives?|expands?|confirm(s|ed)?|teases?|shows? off|world premiere|release date|goes live|opens to)\b/i },
  { type: "update", base: 0.35, re: /\b(update[sd]?|patch(es|ed)?|version \d|v\d+\.\d+|hotfix|changelog|adds? (support|features?)|new features?)\b/i },
];

const REVIEW =
  /(\breview(s)?\b(?!\s*(board|process|bomb\w*|period|of (the )?(policy|rules|deal|merger)))|\breviewed\b|\bhands-on\b|\bhands on with\b|\bfirst impressions\b|\bi tried\b|\bi played\b|\bi tested\b|\bpreview\b|\btested:)/i;

const OPINION =
  /(\bopinion\b|\bop-ed\b|\bcolumn\b|\banalysis:|\bcommentary\b|\bthe case (for|against)\b|\bwhy (i|we)\b|\bi think\b|\bi'?m (not|so|still|really)\b|\bi love\b|\bi hate\b|\bmy (favorite|take)\b|\bin defense of\b|\bunpopular\b|\bit'?s time (to|for)\b|\bis it (time|worth)\b|\binterview\b|\bq&a\b|\bfeature:)/i;

const RUMOR =
  /\b(reportedly|rumou?r(s|ed)?|leak(s|ed)?|leaker|allegedly|insiders?|could be|might be|tipped|purportedly|unconfirmed|speculat\w+|according to (a )?(new )?(report|sources|insiders|people)|sources say|is said to|in talks|considering|weighs|eyes|mulls|exploring a sale|plans to|is planning)\b/i;

const FLAGSHIP =
  /\b(iphone \d+|pixel \d+|galaxy s\d+|rtx \d{4}|rx \d{4}|ps6|playstation 6|next-gen xbox|switch 2|windows 12|ios \d+|gpt-?\d+(\.\d)?|gemini \d|claude \w+ \d|llama \d|m\d (chip|pro|max|ultra)|ryzen \d|core ultra|blackwell|rubin|snapdragon( x)? \d|gta (6|vi)|grand theft auto vi|steam machine|steam frame|vision pro)\b/i;

function moneyBoost(s: string): number {
  const trillion = /\$\s?[\d.,]+\s?(trillion|tn)\b/i.test(s);
  if (trillion) return 0.2;
  const billions = s.match(/\$\s?([\d.,]+)\s?(billion|bn|b)\b/i);
  if (billions) {
    const n = Number.parseFloat(billions[1].replace(/,/g, ""));
    if (n >= 10) return 0.18;
    return 0.12;
  }
  if (/\$\s?[\d.,]+\s?(million|m)\b/i.test(s)) return 0.03;
  return 0;
}

// ---------------------------------------------------------------------------

export function classify(input: ClassifyInput): Classification {
  const title = input.title.trim();
  const text = input.text || "";
  const head = text.slice(0, 600);
  const feedCats = input.feedCategories.join(" | ");
  const titleAndHead = `${title}\n${head}`;
  const { all: companies, inTitle: titleCompanies } = detectCompanies(title, text);
  if (input.source.company && !companies.includes(input.source.company)) companies.unshift(input.source.company);

  const result = (excludeReason: ExcludeReason | null, extra: Partial<Classification> = {}): Classification => ({
    excluded: excludeReason !== null,
    excludeReason,
    sections: [],
    categories: [],
    companies,
    titleCompanies,
    eventType: "general",
    significance: 0.2,
    rumor: false,
    policy: false,
    clickbaitPenalty: 0,
    ...extra,
  });

  // ---- 1. Hard exclusions (title-driven, explainable)
  if (any(PUZZLES, title)) return result("puzzles");
  if (any(SPONSORED, title) || /\b(sponsored|partner content)\b/i.test(feedCats)) return result("sponsored");
  if (any(DEALS, title)) return result("deals");
  if (any(GUIDES, title)) return result("guides");
  if (any(ROUNDUP, title)) return result("roundup");
  if (any(CLICKBAIT_STRONG, title)) return result("clickbait");

  const gamingAnchor = any(GAMING_ANCHOR, title.replace(/\b(olympic|commonwealth|asian|paralympic) games\b/gi, ""));
  const hasCompanyAnchor = titleCompanies.length > 0;

  if (any(CELEBRITY, title)) return result("celebrity");

  // Sports — but not sports video games (EA Sports FC, Madden, NBA 2K…)
  const securityStory = /\b(hack(ed|ers?)|breach(ed|es)?|data (leak|theft|stolen)|stole|ransomware|cyberattack)\b/i.test(title);
  const sportsHit = any(SPORTS_STRONG, title) || (input.source.section !== "gaming" && any(SPORTS_WEAK, title));
  if (sportsHit && !any(VIDEO_GAME_SPORTS, title) && !gamingAnchor && !securityStory) return result("sports");
  // Esports: keep business developments, drop match results.
  if (any(ESPORTS, title) && any(ESPORTS_RESULTS, title) && !any(ESPORTS_BUSINESS, titleAndHead)) return result("sports");

  // Entertainment (film/TV/music) unless it is about games or a tech product.
  const entertainmentFeedCat =
    input.source.section !== "gaming" && input.feedCategories.some((c) => ENTERTAINMENT_FEED_CATEGORY.test(c.trim()));
  if (STRONG_ENTERTAINMENT.test(title) && !/\b(acquir\w*|merger|earnings|layoffs?|lays off)\b/i.test(title)) return result("entertainment");
  if ((any(ENTERTAINMENT, title) || (entertainmentFeedCat && !gamingAnchor)) && !gamingAnchor) {
    const businessAnchored = hasCompanyAnchor && /\b(acquir|merger|earnings|layoffs?|lays off|revenue|stake)\w*/i.test(title);
    if (!businessAnchored) return result("entertainment");
  }

  // Politics — strict. Hard political topics are always excluded. Soft political
  // context is kept only for tech regulation that directly involves tech/gaming.
  let policy = false;
  if (HARD_POLITICS.some((re) => re.test(title))) return result("politics");
  if (CONFLICT.test(title) && !securityStory && !hasCompanyAnchor) return result("politics");
  const politicianInTitle = any(POLITICIANS, title);
  const softInTitle = any(SOFT_POLITICS, title) || politicianInTitle;
  if (softInTitle) {
    const regulation = any(REGULATION_CONTEXT, title);
    const techTopic = hasCompanyAnchor || any(TECH_POLICY_TOPIC, title);
    if (regulation && techTopic && (!politicianInTitle || hasCompanyAnchor)) policy = true;
    else return result("politics");
  } else if (!hasCompanyAnchor && countDistinct(HARD_POLITICS, head) >= 2) {
    return result("politics");
  }

  // ---- 2. Categories
  const scores = new Map<string, number>();
  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    let score = 0;
    for (const p of patterns) {
      if (p.test(title)) score += 3;
      if (p.test(head)) score += 1;
      if (feedCats && p.test(feedCats)) score += 2;
    }
    if (score > 0) scores.set(cat, score);
  }
  // Gaming-only categories need a gaming context; tech categories are fine anywhere.
  const gamingContext = gamingAnchor || input.source.section === "gaming" || any(GAMING_ANCHOR, head);
  for (const cat of ["pc-gaming", "consoles", "releases", "game-industry", "gaming-hardware", "platforms", "engines", "esports-business"]) {
    if (scores.has(cat) && !gamingContext) scores.delete(cat);
  }
  // "releases" is very generic: only keep it in a gaming context with a title hit.
  if ((scores.get("releases") ?? 0) < 3) scores.delete("releases");

  let categories = [...scores.entries()]
    .filter(([, s]) => s >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, 3);

  // ---- 3. Event type & significance
  const isReview = any(REVIEW, title);
  const isOpinion = !isReview && any(OPINION, title);
  let eventType: EventType = "general";
  let significance = 0.4;
  if (isReview) {
    eventType = "review";
    significance = 0.2;
  } else if (isOpinion) {
    eventType = "opinion";
    significance = 0.25;
  } else {
    for (const rule of EVENT_RULES) {
      if (rule.re.test(title)) {
        eventType = rule.type;
        significance = rule.base;
        break;
      }
    }
  }
  if (policy) {
    eventType = eventType === "general" || eventType === "launch" ? "regulation" : eventType;
    significance = Math.max(significance, 0.6);
  }

  // Severity modifiers
  if (eventType === "security-incident" && /\b(actively exploited|zero-day|0-day|millions|critical|breach of|nation-state|supply[- ]chain)\b/i.test(titleAndHead)) significance += 0.12;
  if (eventType === "delay" && /\bcancel/i.test(title)) significance += 0.08;
  if (eventType === "launch" && any(FLAGSHIP, title)) significance += 0.12;
  if (["acquisition", "partnership", "funding", "earnings", "regulation"].includes(eventType)) significance += moneyBoost(titleAndHead);
  if (/\b(record|largest|biggest|first-ever|historic|all-time)\b/i.test(title) && eventType !== "review") significance += 0.04;

  // Corporate events matter far more when a major company is involved.
  if (["acquisition", "earnings", "layoffs", "leadership", "funding"].includes(eventType) && titleCompanies.length === 0) {
    significance -= any(OTHER_TECH_COMPANIES, title) ? 0.08 : 0.16;
  }

  const tierBoost = titleCompanies.reduce((best, id) => {
    const tier = companyById(id)?.tier ?? 3;
    return Math.max(best, tier === 1 ? 0.08 : tier === 2 ? 0.05 : 0.02);
  }, 0);
  significance += tierBoost;

  const rumor = any(RUMOR, title);
  if (rumor) significance *= 0.82;

  let clickbaitPenalty = 0;
  if (any(CLICKBAIT_SOFT, title)) clickbaitPenalty += 0.5;
  if (/\?\s*$/.test(title)) clickbaitPenalty += 0.3;
  if (/^\d+ (things|reasons|ways|games|apps)\b/i.test(title)) clickbaitPenalty += 0.4;
  if (/\b(best|top) \d+\b/i.test(title)) clickbaitPenalty += 0.4;
  clickbaitPenalty = Math.min(1, clickbaitPenalty);
  significance -= clickbaitPenalty * 0.12;

  significance = Math.max(0.05, Math.min(1, significance));

  // ---- 4. Business categories derived from event type
  const businessEvent = ["acquisition", "earnings", "layoffs", "leadership", "partnership", "funding", "regulation", "pricing"].includes(eventType);
  const businessCat: Partial<Record<EventType, string>> = {
    acquisition: "acquisitions",
    earnings: "earnings",
    layoffs: "layoffs",
    leadership: "leadership",
    partnership: "partnerships",
    funding: "strategy",
    pricing: "strategy",
  };
  if (companies.length > 0) {
    const bc = businessCat[eventType];
    if (bc) categories = [...categories, bc];
    else if (eventType === "launch" && hasCompanyAnchor) categories = [...categories, "products"];
  }

  // ---- 5. Sections
  const sections = new Set<Section>();
  for (const c of categories) {
    const def = CATEGORIES.find((d) => d.id === c);
    if (def) sections.add(def.section);
  }
  if (companies.length > 0 && (businessEvent || hasCompanyAnchor)) sections.add("business");
  if (!sections.has("tech") && !sections.has("gaming")) {
    if (gamingContext && (input.source.section === "gaming" || gamingAnchor)) sections.add("gaming");
    else if (categories.length > 0 || hasCompanyAnchor) {
      for (const d of input.source.defaults) if (d !== "business") sections.add(d);
    }
  }

  // ---- 6. Off-topic: nothing connects the story to tech, gaming or a tracked company.
  const otherTechAnchor = any(OTHER_TECH_COMPANIES, title);
  if (otherTechAnchor && sections.size === 0) sections.add(gamingContext && input.source.section === "gaming" ? "gaming" : "tech");
  if (otherTechAnchor && businessEvent) sections.add("business");
  const onTopic =
    categories.length > 0 ||
    hasCompanyAnchor ||
    otherTechAnchor ||
    (input.source.section === "gaming" && gamingContext) ||
    (input.source.kind === "official" && companies.length > 0 && sections.size > 0);
  if (!onTopic) return result("off-topic", { categories, sections: [...sections] });

  return {
    excluded: false,
    excludeReason: null,
    sections: [...sections],
    categories: [...new Set(categories)],
    companies,
    titleCompanies,
    eventType,
    significance: Math.round(significance * 1000) / 1000,
    rumor,
    policy,
    clickbaitPenalty,
  };
}
