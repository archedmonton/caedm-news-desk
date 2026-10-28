import { parseAlbertaNewsroom, parseArticleMeta, parseCovenantNewsroom, parseEcsdListing, parseFeed } from "./parsers";
import type { AdapterContext, AdapterResult, RawItem, SourceAdapter } from "./types";

const rssAdapter: SourceAdapter = {
  id: "rss",
  async collect(source, ctx) {
    const res = await ctx.fetch(source.feedUrl);
    return { items: await parseFeed(res.body, res.url, ctx.now), httpStatus: res.status, warnings: [] };
  },
};

function htmlListingAdapter(id: string, parse: (html: string, base: string) => RawItem[]): SourceAdapter {
  return {
    id,
    async collect(source, ctx) {
      const res = await ctx.fetch(source.feedUrl);
      const items = parse(res.body, res.url);
      const warnings = items.length ? [] : ["Listing parsed but no items found — page structure may have changed"];
      return { items, httpStatus: res.status, warnings };
    },
  };
}

/**
 * ECSD publishes no feed. The listing provides headlines + URLs; for *new* items only, we read the article
 * page's publisher metadata (JSON-LD datePublished, meta description). Bounded per check.
 */
const ecsdAdapter: SourceAdapter = {
  id: "ecsd-newsroom",
  async collect(source, ctx): Promise<AdapterResult> {
    const res = await ctx.fetch(source.feedUrl);
    const listing = parseEcsdListing(res.body, res.url).slice(0, 24);
    const warnings: string[] = [];
    if (!listing.length) warnings.push("Listing parsed but no items found — page structure may have changed");
    const known = ctx.knownUrls(listing.map((i) => i.url));
    const budget = ctx.isBaseline ? 24 : 8;
    let fetched = 0;
    for (const item of listing) {
      if (known.has(item.url)) continue;
      if (fetched >= budget) {
        warnings.push(`Metadata budget reached; ${item.url} will be enriched on a later check`);
        continue;
      }
      fetched++;
      try {
        const page = await ctx.fetch(item.url);
        const meta = parseArticleMeta(page.body, page.url, ctx.now);
        item.publishedAt = meta.publishedAt;
        item.updatedAt = meta.updatedAt;
        if (meta.description) {
          item.description = meta.description;
          item.descriptionSource = "page_meta";
        }
      } catch (e) {
        warnings.push(`Could not read metadata for ${item.url}: ${(e as Error).message}`);
      }
    }
    // Items we could not enrich (budget) are deferred, so they are not stored without a date.
    const items = listing.filter((i) => known.has(i.url) || i.publishedAt !== null || i.descriptionSource !== "none");
    return { items, httpStatus: res.status, warnings };
  },
};

export const ADAPTERS: Record<string, SourceAdapter> = {
  rss: rssAdapter,
  "alberta-newsroom": htmlListingAdapter("alberta-newsroom", parseAlbertaNewsroom),
  "covenant-newsroom": htmlListingAdapter("covenant-newsroom", parseCovenantNewsroom),
  "ecsd-newsroom": ecsdAdapter,
};

export type { AdapterContext, RawItem };
