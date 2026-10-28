import { FetchError, safeFetch } from "./safe-fetch";

type Rule = { allow: boolean; pattern: string };
type Group = { agents: string[]; rules: Rule[] };

const AGENT_TOKEN = "caedm-newsdesk";

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (current && (value || field === "allow")) current.rules.push({ allow: field === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** RFC 9309 evaluation: most specific (longest) matching rule wins; ties favour allow. */
export function isAllowedByRobots(text: string, pathWithQuery: string, agent = AGENT_TOKEN): boolean {
  const groups = parseRobots(text);
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: Rule | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!rule.pattern) continue;
    if (patternToRegex(rule.pattern).test(pathWithQuery)) {
      if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
        best = rule;
      }
    }
  }
  return best ? best.allow : true;
}

const cache = new Map<string, { text: string | null; fetchedAt: number }>();
const TTL = 24 * 3600_000;

/** Throws FetchError("blocked_url") if robots.txt disallows the URL. Missing robots.txt (4xx) = allowed. */
export async function assertRobotsAllowed(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  const origin = url.origin;
  let entry = cache.get(origin);
  if (!entry || Date.now() - entry.fetchedAt > TTL) {
    try {
      const res = await safeFetch(`${origin}/robots.txt`, { maxBytes: 512 * 1024, accept: "text/plain" });
      entry = { text: res.body, fetchedAt: Date.now() };
    } catch (e) {
      if (e instanceof FetchError && e.code === "http_status" && e.status && e.status >= 400 && e.status < 500) {
        entry = { text: null, fetchedAt: Date.now() };
      } else {
        throw new FetchError(`Could not read robots.txt for ${origin}: ${(e as Error).message}`, "network");
      }
    }
    cache.set(origin, entry);
  }
  if (entry.text && !isAllowedByRobots(entry.text, url.pathname + url.search)) {
    throw new FetchError(`robots.txt disallows ${url.pathname}`, "blocked_url");
  }
}

export function clearRobotsCache() {
  cache.clear();
}
