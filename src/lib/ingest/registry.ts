import type { Category, Geo } from "../db/schema";

export type AdapterId = "rss" | "alberta-newsroom" | "covenant-newsroom" | "ecsd-newsroom" | "manual" | "none";

export type SourceDefinition = {
  slug: string;
  name: string;
  websiteUrl: string;
  /** Feed or newsroom listing URL actually fetched. Only set when verified. */
  feedUrl: string | null;
  method: "rss" | "html" | "manual";
  adapter: AdapterId;
  orgType: "archdiocese" | "catholic_partner" | "catholic_national" | "vatican" | "government" | "media" | "manual";
  region: Geo;
  importance: number;
  defaultCategory: Category;
  /** True only after the URL, robots.txt and content were checked by a person. */
  verified: boolean;
  /** Initial enabled state when first seeded. Admins can toggle verified sources afterwards. */
  enabledByDefault: boolean;
  notes: string;
};

/**
 * Source registry. Pilot sources were verified on 2026-10-28 (see docs/SOURCES.md). Expansion entries are
 * inactive: unverified entries cannot be enabled until a person verifies a feed/listing and an adapter.
 */
export const SOURCE_REGISTRY: SourceDefinition[] = [
  // ---- Pilot sources (active) ----
  {
    slug: "ecsd",
    name: "Edmonton Catholic Schools",
    websiteUrl: "https://www.ecsd.net",
    feedUrl: "https://www.ecsd.net/news",
    method: "html",
    adapter: "ecsd-newsroom",
    orgType: "catholic_partner",
    region: "edmonton",
    importance: 5,
    defaultCategory: "catholic_education",
    verified: true,
    enabledByDefault: true,
    notes:
      "No RSS/Atom feed published (/rss, /feed, /news/rss return 404). robots.txt allows all. Listing page gives headline + URL; publication date and description come from each new article page's JSON-LD / meta tags (max 8 article fetches per check).",
  },
  {
    slug: "covenant-health",
    name: "Covenant Health",
    websiteUrl: "https://covenanthealth.ca",
    feedUrl: "https://covenanthealth.ca/news-and-events/news",
    method: "html",
    adapter: "covenant-newsroom",
    orgType: "catholic_partner",
    region: "alberta",
    importance: 4,
    defaultCategory: "healthcare",
    verified: true,
    enabledByDefault: true,
    notes:
      "Site /rss.xml exists but carries general page updates, not news. Newsroom listing (allowed by robots.txt) provides headline, publisher lede, categories and date.",
  },
  {
    slug: "vatican-news",
    name: "Vatican News",
    websiteUrl: "https://www.vaticannews.va/en.html",
    feedUrl: "https://www.vaticannews.va/en.rss.xml",
    method: "rss",
    adapter: "rss",
    orgType: "vatican",
    region: "international",
    importance: 3,
    defaultCategory: "vatican",
    verified: true,
    enabledByDefault: true,
    notes:
      "Official English RSS. robots.txt allows general crawlers; Content-Signal: search=yes, ai-train=no, use=reference — we store headline, feed description and link only (reference use).",
  },
  {
    slug: "alberta-news",
    name: "Government of Alberta",
    websiteUrl: "https://www.alberta.ca/news",
    feedUrl: "https://www.alberta.ca/news",
    method: "html",
    adapter: "alberta-newsroom",
    orgType: "government",
    region: "alberta",
    importance: 4,
    defaultCategory: "government_policy",
    verified: true,
    enabledByDefault: true,
    notes:
      "Site /rss.xml carries only a site-level item, not releases. The /news page (allowed by robots.txt) lists releases with date, headline and lede (#block-newsfeedblock).",
  },
  {
    slug: "manual",
    name: "Manual submission",
    websiteUrl: "https://caedm.ca",
    feedUrl: null,
    method: "manual",
    adapter: "manual",
    orgType: "manual",
    region: "edmonton",
    importance: 2,
    defaultCategory: "other",
    verified: true,
    enabledByDefault: true,
    notes: "Links submitted by staff (fallback for sources that cannot be monitored automatically). Marked unverified.",
  },

  // ---- Expansion registry (inactive) ----
  {
    slug: "caedm",
    name: "Catholic Archdiocese of Edmonton",
    websiteUrl: "https://caedm.ca",
    feedUrl: "https://caedm.ca/feed/",
    method: "rss",
    adapter: "rss",
    orgType: "archdiocese",
    region: "edmonton",
    importance: 5,
    defaultCategory: "archdiocese",
    verified: true,
    enabledByDefault: false,
    notes:
      "WordPress RSS advertised in page head and checked 2026-10-28 (10 items). robots.txt allows. Not part of the pilot — an administrator can enable it.",
  },
  ...(
    [
      ["catholic-social-services", "Catholic Social Services", "https://www.cssalberta.ca", "catholic_partner", "edmonton", 4, "community"],
      ["acsta", "Alberta Catholic School Trustees' Association", "https://acsta.ab.ca", "catholic_partner", "alberta", 4, "catholic_education"],
      ["newman-theological-college", "Newman Theological College", "https://www.newman.edu", "catholic_partner", "edmonton", 4, "catholic_education"],
      ["st-josephs-college", "St. Joseph's College (U of A)", "https://www.ualberta.ca/st-josephs", "catholic_partner", "edmonton", 3, "catholic_education"],
      ["st-joseph-seminary", "St. Joseph Seminary", "https://www.stjoseph-seminary.com", "catholic_partner", "edmonton", 4, "archdiocese"],
      ["ssvp-edmonton", "Society of Saint Vincent de Paul (Edmonton)", "https://www.ssvp.ca", "catholic_partner", "edmonton", 3, "community"],
      ["edmonton-journal", "Edmonton Journal", "https://edmontonjournal.com", "media", "edmonton", 3, "other"],
      ["epsb", "Edmonton Public Schools", "https://www.epsb.ca", "government", "edmonton", 3, "catholic_education"],
      ["cbc-edmonton", "CBC Edmonton", "https://www.cbc.ca/news/canada/edmonton", "media", "edmonton", 3, "other"],
      ["ctv-edmonton", "CTV News Edmonton", "https://edmonton.ctvnews.ca", "media", "edmonton", 3, "other"],
      ["cccb", "Canadian Conference of Catholic Bishops", "https://www.cccb.ca", "catholic_national", "canada", 4, "canadian_catholic"],
      ["canadian-catholic-news", "Canadian Catholic News", "https://www.canadiancatholicnews.ca", "catholic_national", "canada", 3, "canadian_catholic"],
      ["holy-see-press-office", "Holy See Press Office", "https://press.vatican.va", "vatican", "international", 3, "vatican"],
      ["gsacrd", "Greater St. Albert Catholic Schools", "https://www.gsacrd.ab.ca", "catholic_partner", "edmonton", 3, "catholic_education"],
      ["eics", "Elk Island Catholic Schools", "https://www.eics.ab.ca", "catholic_partner", "edmonton", 3, "catholic_education"],
      ["evergreen-catholic", "Evergreen Catholic Schools", "https://www.ecsrd.ca", "catholic_partner", "edmonton", 3, "catholic_education"],
      ["living-waters", "Living Waters Catholic Schools", "https://www.livingwaters.ab.ca", "catholic_partner", "alberta", 3, "catholic_education"],
      ["ecacs", "East Central Alberta Catholic Schools", "https://www.ecacs.ca", "catholic_partner", "alberta", 3, "catholic_education"],
      ["star-catholic", "St. Thomas Aquinas Catholic Schools", "https://www.starcatholic.ab.ca", "catholic_partner", "alberta", 3, "catholic_education"],
      ["centre-nord", "Conseil scolaire Centre-Nord", "https://centrenord.ab.ca", "catholic_partner", "edmonton", 3, "catholic_education"],
      ["grace-alberta", "GRACE (Grade 12 Retreat, Alberta Catholic Education)", "https://www.gracealberta.org/home", "catholic_partner", "alberta", 2, "catholic_education"],
    ] as const
  ).map(
    ([slug, name, websiteUrl, orgType, region, importance, defaultCategory]): SourceDefinition => ({
      slug,
      name,
      websiteUrl,
      feedUrl: null,
      method: "rss",
      adapter: "none",
      orgType,
      region,
      importance,
      defaultCategory,
      verified: false,
      enabledByDefault: false,
      notes:
        "Expansion candidate. Feed/listing not yet verified — cannot be enabled until a person verifies an official feed, robots.txt and publisher terms. Website URL from the CAEDM Schools & Colleges page or the organization's public site.",
    }),
  ),
];
