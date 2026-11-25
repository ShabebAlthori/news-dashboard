// Registry of legitimate, publicly offered RSS/Atom feeds.
//
// Every feed here is published by the outlet itself for syndication. The fetcher
// additionally checks each host's robots.txt, uses conditional requests and
// fetches each feed at most once per refresh interval.
//
// Not included on purpose:
// - Reuters: no public RSS since 2020 and reuters.com robots.txt disallows
//   automated access. Reuters content requires a paid licence (Reuters Connect).
// - Google News RSS as a Reuters proxy: news.google.com/robots.txt disallows /rss.
// - The Register: robots.txt default-denies unlisted crawlers and requires a licence for AI use.
// - Unity Blog: unity.com/robots.txt disallows /blog/rss.
// - Snowflake Blog: snowflake.com/robots.txt disallows /feed/.
// - InfoWorld: infoworld.com/robots.txt disallows the feed for unlisted crawlers.

export type SourceSection = "tech" | "gaming" | "official";

export interface SourceDef {
  id: string;
  name: string;
  /** Sources sharing a publisher are not counted as independent coverage. */
  publisher: string;
  url: string;
  homepage: string;
  section: SourceSection;
  kind: "publisher" | "official";
  /** 0..1 editorial reliability weight used in importance scoring. */
  credibility: number;
  /** Company whose own newsroom this is. */
  company?: string;
  /** Default section(s) for items when keywords are inconclusive. */
  defaults: ("tech" | "gaming" | "business")[];
  /** Language the source publishes in (default English). */
  lang?: "en" | "ar";
}

export const SOURCES: SourceDef[] = [
  // ---- Technology publishers ----
  { id: "ars", name: "Ars Technica", publisher: "condenast-ars", url: "https://feeds.arstechnica.com/arstechnica/index", homepage: "https://arstechnica.com", section: "tech", kind: "publisher", credibility: 0.92, defaults: ["tech"] },
  { id: "verge", name: "The Verge", publisher: "verge", url: "https://www.theverge.com/rss/index.xml", homepage: "https://www.theverge.com", section: "tech", kind: "publisher", credibility: 0.88, defaults: ["tech"] },
  { id: "techcrunch", name: "TechCrunch", publisher: "techcrunch", url: "https://techcrunch.com/feed/", homepage: "https://techcrunch.com", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech"] },
  { id: "wired", name: "WIRED", publisher: "condenast-wired", url: "https://www.wired.com/feed/rss", homepage: "https://www.wired.com", section: "tech", kind: "publisher", credibility: 0.88, defaults: ["tech"] },
  { id: "engadget", name: "Engadget", publisher: "engadget", url: "https://www.engadget.com/rss.xml", homepage: "https://www.engadget.com", section: "tech", kind: "publisher", credibility: 0.82, defaults: ["tech"] },
  { id: "mittr", name: "MIT Technology Review", publisher: "mittr", url: "https://www.technologyreview.com/feed/", homepage: "https://www.technologyreview.com", section: "tech", kind: "publisher", credibility: 0.92, defaults: ["tech"] },
  { id: "tomshardware", name: "Tom's Hardware", publisher: "tomshardware", url: "https://www.tomshardware.com/feeds.xml", homepage: "https://www.tomshardware.com", section: "tech", kind: "publisher", credibility: 0.82, defaults: ["tech"] },
  { id: "bleepingcomputer", name: "BleepingComputer", publisher: "bleepingcomputer", url: "https://www.bleepingcomputer.com/feed/", homepage: "https://www.bleepingcomputer.com", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech"] },
  { id: "therecord", name: "The Record", publisher: "therecord", url: "https://therecord.media/feed", homepage: "https://therecord.media", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech"] },

  // ---- Data science & analytics ----
  { id: "siliconangle-data", name: "SiliconANGLE — Data", publisher: "siliconangle", url: "https://siliconangle.com/category/big-data/feed/", homepage: "https://siliconangle.com/category/big-data/", section: "tech", kind: "publisher", credibility: 0.8, defaults: ["tech"] },
  { id: "kdnuggets", name: "KDnuggets", publisher: "kdnuggets", url: "https://www.kdnuggets.com/feed", homepage: "https://www.kdnuggets.com", section: "tech", kind: "publisher", credibility: 0.7, defaults: ["tech"] },
  { id: "towards-data-science", name: "Towards Data Science", publisher: "tds", url: "https://towardsdatascience.com/feed", homepage: "https://towardsdatascience.com", section: "tech", kind: "publisher", credibility: 0.68, defaults: ["tech"] },

  // ---- Robotics ----
  { id: "robot-report", name: "The Robot Report", publisher: "robotreport", url: "https://www.therobotreport.com/feed/", homepage: "https://www.therobotreport.com", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech"] },
  { id: "ieee-robotics", name: "IEEE Spectrum — Robotics", publisher: "ieee-spectrum", url: "https://spectrum.ieee.org/feeds/topic/robotics.rss", homepage: "https://spectrum.ieee.org/topic/robotics/", section: "tech", kind: "publisher", credibility: 0.92, defaults: ["tech"] },
  { id: "techcrunch-robotics", name: "TechCrunch — Robotics", publisher: "techcrunch", url: "https://techcrunch.com/category/robotics/feed/", homepage: "https://techcrunch.com/category/robotics/", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech"] },

  // ---- Saudi technology & startups ----
  { id: "wamda", name: "Wamda", publisher: "wamda", url: "https://www.wamda.com/feed", homepage: "https://www.wamda.com", section: "tech", kind: "publisher", credibility: 0.8, defaults: ["tech", "business"] },
  { id: "techcrunch-saudi", name: "TechCrunch — Saudi Arabia", publisher: "techcrunch", url: "https://techcrunch.com/tag/saudi-arabia/feed/", homepage: "https://techcrunch.com/tag/saudi-arabia/", section: "tech", kind: "publisher", credibility: 0.85, defaults: ["tech", "business"] },
  { id: "aitnews", name: "البوابة التقنية (AIT News)", publisher: "aitnews", url: "https://aitnews.com/feed/", homepage: "https://aitnews.com", section: "tech", kind: "publisher", credibility: 0.78, defaults: ["tech"], lang: "ar" },
  { id: "tech-wd", name: "عالم التقنية (Tech-WD)", publisher: "tech-wd", url: "https://www.tech-wd.com/wd/feed/", homepage: "https://www.tech-wd.com", section: "tech", kind: "publisher", credibility: 0.72, defaults: ["tech"], lang: "ar" },

  // ---- Gaming publishers ----
  { id: "ign", name: "IGN", publisher: "ign", url: "https://feeds.ign.com/ign/news", homepage: "https://www.ign.com", section: "gaming", kind: "publisher", credibility: 0.8, defaults: ["gaming"] },
  { id: "pcgamer", name: "PC Gamer", publisher: "pcgamer", url: "https://www.pcgamer.com/rss/", homepage: "https://www.pcgamer.com", section: "gaming", kind: "publisher", credibility: 0.82, defaults: ["gaming"] },
  { id: "gamespot", name: "GameSpot", publisher: "gamespot", url: "https://www.gamespot.com/feeds/news/", homepage: "https://www.gamespot.com", section: "gaming", kind: "publisher", credibility: 0.8, defaults: ["gaming"] },
  { id: "eurogamer", name: "Eurogamer", publisher: "eurogamer", url: "https://www.eurogamer.net/feed/news", homepage: "https://www.eurogamer.net", section: "gaming", kind: "publisher", credibility: 0.85, defaults: ["gaming"] },
  { id: "rps", name: "Rock Paper Shotgun", publisher: "rps", url: "https://www.rockpapershotgun.com/feed/news", homepage: "https://www.rockpapershotgun.com", section: "gaming", kind: "publisher", credibility: 0.82, defaults: ["gaming"] },
  { id: "verge-games", name: "The Verge — Gaming", publisher: "verge", url: "https://www.theverge.com/rss/games/index.xml", homepage: "https://www.theverge.com/games", section: "gaming", kind: "publisher", credibility: 0.88, defaults: ["gaming"] },
  { id: "gamesindustry", name: "GamesIndustry.biz", publisher: "gamesindustry", url: "https://www.gamesindustry.biz/feed", homepage: "https://www.gamesindustry.biz", section: "gaming", kind: "publisher", credibility: 0.9, defaults: ["gaming", "business"] },
  { id: "vgc", name: "Video Games Chronicle", publisher: "vgc", url: "https://www.videogameschronicle.com/feed/", homepage: "https://www.videogameschronicle.com", section: "gaming", kind: "publisher", credibility: 0.8, defaults: ["gaming"] },

  // ---- Official newsrooms & developer blogs ----
  { id: "nvidia-news", name: "NVIDIA Newsroom", publisher: "nvidia", url: "https://nvidianews.nvidia.com/releases.xml", homepage: "https://nvidianews.nvidia.com", section: "official", kind: "official", credibility: 0.9, company: "nvidia", defaults: ["tech", "business"] },
  { id: "amd-ir", name: "AMD Press Releases", publisher: "amd", url: "https://ir.amd.com/news-events/press-releases/rss", homepage: "https://ir.amd.com", section: "official", kind: "official", credibility: 0.9, company: "amd", defaults: ["tech", "business"] },
  { id: "microsoft-blog", name: "Official Microsoft Blog", publisher: "microsoft", url: "https://blogs.microsoft.com/feed/", homepage: "https://blogs.microsoft.com", section: "official", kind: "official", credibility: 0.9, company: "microsoft", defaults: ["tech", "business"] },
  { id: "google-blog", name: "Google — The Keyword", publisher: "google", url: "https://blog.google/rss/", homepage: "https://blog.google", section: "official", kind: "official", credibility: 0.9, company: "google", defaults: ["tech"] },
  { id: "apple-newsroom", name: "Apple Newsroom", publisher: "apple", url: "https://www.apple.com/newsroom/rss-feed.rss", homepage: "https://www.apple.com/newsroom/", section: "official", kind: "official", credibility: 0.9, company: "apple", defaults: ["tech"] },
  { id: "openai-news", name: "OpenAI News", publisher: "openai", url: "https://openai.com/news/rss.xml", homepage: "https://openai.com/news/", section: "official", kind: "official", credibility: 0.9, company: "openai", defaults: ["tech"] },
  { id: "meta-newsroom", name: "Meta Newsroom", publisher: "meta", url: "https://about.fb.com/feed/", homepage: "https://about.fb.com/news/", section: "official", kind: "official", credibility: 0.9, company: "meta", defaults: ["tech"] },
  { id: "amazon-news", name: "About Amazon", publisher: "amazon", url: "https://www.aboutamazon.com/rss/feed.rss", homepage: "https://www.aboutamazon.com", section: "official", kind: "official", credibility: 0.9, company: "amazon", defaults: ["tech", "business"] },
  { id: "samsung-newsroom", name: "Samsung Newsroom", publisher: "samsung", url: "https://news.samsung.com/global/feed", homepage: "https://news.samsung.com/global/", section: "official", kind: "official", credibility: 0.9, company: "samsung", defaults: ["tech"] },
  { id: "playstation-blog", name: "PlayStation Blog", publisher: "sony", url: "https://blog.playstation.com/feed/", homepage: "https://blog.playstation.com", section: "official", kind: "official", credibility: 0.88, company: "sony", defaults: ["gaming"] },
  { id: "xbox-wire", name: "Xbox Wire", publisher: "microsoft", url: "https://news.xbox.com/en-us/feed/", homepage: "https://news.xbox.com/en-us/", section: "official", kind: "official", credibility: 0.88, company: "microsoft", defaults: ["gaming"] },
  { id: "steam-news", name: "Steam News", publisher: "valve", url: "https://store.steampowered.com/feeds/news.xml", homepage: "https://store.steampowered.com/news/", section: "official", kind: "official", credibility: 0.88, company: "valve", defaults: ["gaming"] },
  { id: "unreal-engine", name: "Unreal Engine News", publisher: "epic", url: "https://www.unrealengine.com/rss?lang=en-US", homepage: "https://www.unrealengine.com/news", section: "official", kind: "official", credibility: 0.88, company: "epic", defaults: ["gaming"] },
  { id: "github-blog", name: "The GitHub Blog", publisher: "microsoft-github", url: "https://github.blog/feed/", homepage: "https://github.blog", section: "official", kind: "official", credibility: 0.88, company: "microsoft", defaults: ["tech"] },
];

export function sourceById(id: string): SourceDef | undefined {
  return SOURCES.find((s) => s.id === id);
}
