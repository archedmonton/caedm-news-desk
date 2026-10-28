import type { Category, Geo, Priority, VerificationStatus } from "../db/schema";
import type { PriorityRules } from "./rules";

export type SourceProfile = {
  name: string;
  /** archdiocese | catholic_partner | catholic_national | vatican | government | media | manual */
  orgType: string;
  region: Geo;
  importance: number; // 1–5
  defaultCategory: Category;
};

export type ClassifyInput = {
  title: string;
  description?: string | null;
  publishedAt?: number | null;
  source: SourceProfile;
};

export type Classification = {
  priority: Priority;
  score: number;
  reasons: string[];
  reason: string;
  category: Category;
  geoRelevance: Geo;
  sensitive: boolean;
  verificationStatus: VerificationStatus;
};

const CATHOLIC_ORG_TYPES = new Set(["archdiocese", "catholic_partner", "catholic_national", "vatican"]);
const UNVERIFIED_ORG_TYPES = new Set(["media", "manual"]);

export function normalizeText(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLowerCase().replace(/\s+/g, " ").trim();
}

const regexCache = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let re = regexCache.get(term);
  if (!re) {
    let t = normalizeText(term);
    const anchored = t.startsWith("^");
    if (anchored) t = t.slice(1);
    const prefix = t.endsWith("*");
    if (prefix) t = t.slice(0, -1);
    const body = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`${anchored ? "^" : "(?:^|[^a-z0-9])"}${body}${prefix ? "[a-z0-9'-]*" : ""}(?=$|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re;
}

/** Return the terms from `list` found in `text` (text must already be normalized). */
export function findTerms(text: string, list: string[]): string[] {
  const hits: string[] = [];
  for (const term of list) {
    if (term.trim() && termRegex(term).test(text)) hits.push(term.replace(/^\^/, ""));
  }
  return hits;
}

const RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const capAt = (p: Priority, cap: Priority): Priority => (RANK[p] < RANK[cap] ? cap : p);
const quote = (terms: string[]) =>
  terms
    .slice(0, 3)
    .map((t) => `"${t.replace(/\*$/, "")}"`)
    .join(", ");

export function classifyStory(input: ClassifyInput, rules: PriorityRules, now = Date.now()): Classification {
  const src = input.source;
  // The publisher's own name (e.g. "Edmonton Catholic Schools") must not count as content relevance.
  const ownName = normalizeText(src.name);
  const strip = (s: string) => (ownName.length > 3 ? s.split(ownName).join(" ") : s);
  const title = strip(normalizeText(input.title));
  const description = strip(normalizeText(input.description ?? ""));
  const text = `${title} . ${description}`;
  const reasons: string[] = [];
  let score = 0;

  const catholicSource = CATHOLIC_ORG_TYPES.has(src.orgType);
  const importancePts = Math.max(0, Math.min(5, src.importance)) * 2;
  score += importancePts;
  reasons.push(`Source: ${src.name} (importance ${src.importance}/5, +${importancePts})`);

  // Geography
  const local = findTerms(text, rules.localPlaceTerms);
  const alberta = findTerms(text, rules.albertaTerms);
  const canada = findTerms(text, rules.canadaTerms);
  let geo: Geo = src.region;
  if (local.length) {
    geo = "edmonton";
    score += 20;
    reasons.push(`Edmonton-area relevance: ${quote(local)} (+20)`);
  } else if (src.region === "edmonton") {
    score += 12;
    reasons.push("Edmonton-based source (+12)");
  } else if (alberta.length || src.region === "alberta") {
    geo = "alberta";
    score += 8;
    reasons.push("Alberta relevance (+8)");
  } else if (canada.length) {
    geo = "canada";
    score += 6;
    reasons.push(`Canadian relevance: ${quote(canada)} (+6)`);
  }

  // Church relevance
  const arch = findTerms(text, rules.archdiocesanTerms);
  if (arch.length) {
    score += 35;
    reasons.push(`Archdiocesan reference: ${quote(arch)} (+35)`);
  }
  const catholic = findTerms(text, rules.catholicTerms);
  if (catholic.length) {
    score += 8;
    reasons.push(`Catholic context: ${quote(catholic)} (+8)`);
  }
  const catholicContext = catholicSource || catholic.length > 0 || arch.length > 0;
  const papal = findTerms(text, rules.papalTerms);
  const major = findTerms(text, rules.majorChurchTerms);
  if (major.length) {
    score += 12;
    reasons.push(`Major Church development: ${quote(major)} (+12)`);
  } else if (papal.length) {
    score += 8;
    reasons.push(`Papal reference (+8)`);
  }

  // Sector & policy
  const edu = findTerms(text, rules.educationTerms);
  const health = findTerms(text, rules.healthTerms);
  if (edu.length || health.length) {
    score += 8;
    reasons.push(`${edu.length ? "Education" : "Healthcare"} sector: ${quote(edu.length ? edu : health)} (+8)`);
  }
  const policy = findTerms(text, rules.policyTerms);
  if (policy.length) {
    score += 10;
    reasons.push(`Policy significance: ${quote(policy)} (+10)`);
  }
  const churchPolicy = findTerms(text, rules.churchPolicyTerms);
  if (churchPolicy.length) {
    score += 15;
    reasons.push(`Church-significant policy topic: ${quote(churchPolicy)} (+15)`);
  }

  const institutional = findTerms(text, rules.institutionalTerms);
  if (institutional.length) {
    score += 10;
    reasons.push(`Institutional impact: ${quote(institutional)} (+10)`);
  }

  // Urgency, routine, sensitivity
  // Urgency in the headline is a strong signal; in the description it is weaker (e.g. "emergency assistance").
  const urgent = findTerms(title, rules.urgentTerms);
  const urgentInBody = urgent.length ? [] : findTerms(description, rules.urgentTerms);
  if (urgent.length) {
    score += 20;
    reasons.push(`Urgent/critical headline: ${quote(urgent)} (+20)`);
  } else if (urgentInBody.length) {
    score += 6;
    reasons.push(`Urgent/critical language in description: ${quote(urgentInBody)} (+6)`);
  }
  const routine = findTerms(title, rules.routineTerms);
  if (routine.length) {
    score -= 10;
    reasons.push(`Routine announcement: ${quote(routine)} (−10, capped at P2)`);
  }
  const events = findTerms(title, rules.eventTerms);
  const sensitiveHits = findTerms(text, rules.sensitiveTerms);
  const sensitive = sensitiveHits.length > 0;

  // Category
  let category: Category = src.defaultCategory;
  if (arch.length) category = "archdiocese";
  else if (src.orgType === "vatican") category = "vatican";
  else if (edu.length && catholicContext) category = "catholic_education";
  else if (health.length && (catholicContext || src.defaultCategory === "healthcare")) category = "healthcare";
  else if (src.orgType === "government") category = edu.length ? "catholic_education" : health.length ? "healthcare" : "government_policy";
  if (events.length && !urgent.length && category !== "archdiocese" && category !== "vatican") category = "event";

  // Priority decision
  const ageHours = input.publishedAt ? (now - input.publishedAt) / 3600_000 : 0;
  const localCatholic = arch.length > 0 || (catholicContext && (geo === "edmonton" || geo === "alberta"));
  const sectorRelevant = edu.length > 0 || health.length > 0;
  const relevant = catholicContext || sectorRelevant || policy.length > 0 || local.length > 0;
  // P1 needs a substantive signal; source importance and topic alone never make a story high priority.
  const substantive = arch.length + policy.length + churchPolicy.length + institutional.length + urgent.length + major.length > 0;
  const papalTransition = catholicContext ? findTerms(text, rules.papalTransitionTerms) : [];
  let priority: Priority;

  if (papalTransition.length && ageHours <= rules.criticalWindowHours) {
    priority = "P0";
    reasons.push(`P0 rule: papal transition event (${quote(papalTransition)}) within ${rules.criticalWindowHours} h`);
  } else if (
    urgent.length &&
    (arch.length > 0 || (catholicSource && geo === "edmonton")) &&
    ageHours <= rules.criticalWindowHours &&
    !routine.length
  ) {
    priority = "P0";
    reasons.push(`P0 rule: urgent development directly involving the Archdiocese or a local Catholic institution`);
  } else if (
    score >= rules.highThreshold &&
    substantive &&
    (localCatholic || (sectorRelevant && churchPolicy.length > 0 && geo !== "international"))
  ) {
    priority = "P1";
    reasons.push(
      `Score ${score} ≥ high threshold ${rules.highThreshold} with a substantive development and local Catholic or Church-policy relevance`,
    );
  } else if (geo === "international" && !major.length && !papal.length && !arch.length) {
    priority = "P3";
    reasons.push("Routine international news — background");
  } else if (score >= rules.standardThreshold && relevant) {
    priority = "P2";
    reasons.push(`Score ${score} ≥ standard threshold ${rules.standardThreshold}`);
  } else {
    priority = "P3";
    reasons.push(relevant ? `Score ${score} below standard threshold` : "No Catholic, local or sector relevance detected");
  }

  if (routine.length) priority = capAt(priority, "P2");
  if (priority !== "P0" || papalTransition.length === 0) {
    if (ageHours > 24 * 30 && RANK[priority] < RANK.P3) {
      priority = "P3";
      reasons.push("Older than 30 days — capped at P3");
    } else if (ageHours > 24 * 7 && RANK[priority] < RANK.P2) {
      priority = "P2";
      reasons.push("Older than 7 days — capped at P2");
    }
  }

  const verificationStatus: VerificationStatus = UNVERIFIED_ORG_TYPES.has(src.orgType) ? "unverified" : "official_source";
  if (sensitive) {
    reasons.push(`Sensitive subject (${quote(sensitiveHits)}) — requires human review before any external use`);
  }
  if (verificationStatus === "unverified") reasons.push("Not from an official publisher channel — unverified");

  return {
    priority,
    score,
    reasons,
    reason: reasons.join("; "),
    category,
    geoRelevance: geo,
    sensitive,
    verificationStatus,
  };
}
