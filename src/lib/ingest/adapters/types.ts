import type { SafeFetchResult } from "../safe-fetch";

export type DescriptionSource = "feed" | "listing" | "page_meta" | "none";

export type RawItem = {
  title: string;
  url: string;
  publishedAt: number | null;
  updatedAt: number | null;
  description: string | null;
  descriptionSource: DescriptionSource;
  categories: string[];
};

export type AdapterContext = {
  /** Robots-checked, SSRF-safe fetch. */
  fetch: (url: string) => Promise<SafeFetchResult>;
  /** Returns which of the given canonical URLs are already stored. */
  knownUrls: (urls: string[]) => Promise<Set<string>>;
  /** True on the first successful check of a source (historical backlog). */
  isBaseline: boolean;
  now: number;
  log: (msg: string) => void;
};

export type AdapterResult = { items: RawItem[]; httpStatus: number; warnings: string[] };

export type SourceAdapter = {
  id: string;
  collect(source: { feedUrl: string; websiteUrl: string }, ctx: AdapterContext): Promise<AdapterResult>;
};
