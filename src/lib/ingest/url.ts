import crypto from "node:crypto";

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|_hsenc|_hsmi|ref|cmpid|at_medium|at_campaign)$/i;

/** Canonical form used for duplicate detection. Keeps meaningful query params (e.g. alberta.ca ?xID=). */
export function normalizeUrl(raw: string, base?: string): string {
  const url = new URL(raw.trim(), base);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k));
  params.sort(([a], [b]) => a.localeCompare(b));
  url.search = params.length ? new URLSearchParams(params).toString() : "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const STOP = new Set(
  "a an the and or of for to in on at by with from as is are was were be this that its it into new about after over".split(" "),
);

/** Order-insensitive fingerprint of a headline's significant words. Used for related-story grouping. */
export function titleFingerprint(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].sort().join(" ");
}

/** Jaccard similarity of two fingerprints. */
export function fingerprintSimilarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Decode entities, strip tags, collapse whitespace and truncate on a word boundary. */
export function cleanText(input: string | null | undefined, maxLength = 400): string | null {
  if (!input) return null;
  const text = decodeEntities(input.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    // Trailing "read more" link text is navigation, not part of the publisher's summary.
    .replace(/\s*(?:\.{3}|…)?\s*(?:read all|read more|continue reading|learn more)\s*(?:»|›|→)?$/i, "")
    .trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > maxLength * 0.6) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\-–]+$/, "") + "…";
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç", ocirc: "ô",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Parse a date string; returns null for missing/invalid/far-future values. */
export function parseDate(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  let v = value.trim();
  // ECSD JSON-LD style: "2026-10-14 20:28:48.533205 +0000 UTC"
  const goStyle = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? ([+-]\d{4})(?: [A-Z]+)?$/.exec(v);
  if (goStyle) v = `${goStyle[1]}T${goStyle[2]}${goStyle[3].slice(0, 3)}:${goStyle[3].slice(3)}`;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  if (t > now + 2 * 24 * 3600_000) return null;
  return t;
}
