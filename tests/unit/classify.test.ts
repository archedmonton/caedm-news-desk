import { describe, expect, it } from "vitest";
import { classifyStory, findTerms, normalizeText, type SourceProfile } from "@/lib/priority/classify";
import { DEFAULT_PRIORITY_RULES as R } from "@/lib/priority/rules";

const NOW = Date.parse("2026-10-28T18:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3600_000;

const ECSD: SourceProfile = {
  name: "Edmonton Catholic Schools",
  orgType: "catholic_partner",
  region: "edmonton",
  importance: 5,
  defaultCategory: "catholic_education",
};
const COVENANT: SourceProfile = {
  name: "Covenant Health",
  orgType: "catholic_partner",
  region: "alberta",
  importance: 4,
  defaultCategory: "healthcare",
};
const VATICAN: SourceProfile = { name: "Vatican News", orgType: "vatican", region: "international", importance: 3, defaultCategory: "vatican" };
const GOA: SourceProfile = {
  name: "Government of Alberta",
  orgType: "government",
  region: "alberta",
  importance: 4,
  defaultCategory: "government_policy",
};
const CAEDM: SourceProfile = {
  name: "Catholic Archdiocese of Edmonton",
  orgType: "archdiocese",
  region: "edmonton",
  importance: 5,
  defaultCategory: "archdiocese",
};
const MANUAL: SourceProfile = { name: "Manual submission", orgType: "manual", region: "edmonton", importance: 2, defaultCategory: "other" };

const c = (title: string, source: SourceProfile, description = "", publishedAt = hoursAgo(2)) =>
  classifyStory({ title, description, publishedAt, source }, R, NOW);

describe("term matching", () => {
  it("is case/accent-insensitive and respects word boundaries", () => {
    expect(findTerms(normalizeText("Édmonton parish"), ["edmonton", "parish*"])).toEqual(["edmonton", "parish*"]);
    expect(findTerms("ceasefire talks", ["fire"])).toEqual([]);
    expect(findTerms("meet erin kennedy", ["^meet"])).toEqual(["meet"]);
    expect(findTerms("ministers meet today", ["^meet"])).toEqual([]);
  });
});

describe("priority classification", () => {
  it("P0: urgent development involving the Archdiocese", () => {
    const r = c("Archbishop of Edmonton hospitalized; emergency update", CAEDM);
    expect(r.priority).toBe("P0");
    expect(r.category).toBe("archdiocese");
    expect(r.reason).toMatch(/P0 rule/);
  });

  it("P0: papal transition from the Vatican", () => {
    const r = c("Conclave to begin as cardinals gather in Rome", VATICAN);
    expect(r.priority).toBe("P0");
  });

  it("P1: local Catholic institutional development", () => {
    const r = c("Misericordia and Grey Nuns Community Hospitals install weapons detection systems to enhance safety", COVENANT);
    expect(r.priority).toBe("P1");
    expect(r.geoRelevance).toBe("edmonton");
  });

  it("P1: Alberta policy with direct Catholic-education significance", () => {
    const r = c(
      "More student spaces, more school choice",
      GOA,
      "Alberta's government is investing $25.8 million in six independent school projects.",
    );
    expect(r.priority).toBe("P1");
    expect(r.category).toBe("catholic_education");
  });

  it("does not make every article from a high-importance organization urgent", () => {
    const r = c("Bus driver appreciation day", ECSD);
    expect(["P2", "P3"]).toContain(r.priority);
    const profile = c("Meet Erin Kennedy, occupational therapist, Misericordia Community Hospital", COVENANT);
    expect(profile.priority).toBe("P2");
    expect(profile.reason).toMatch(/Routine/);
  });

  it("ignores the publisher's own name and weak description-only urgency", () => {
    const r = c(
      "ECS Foundation Builds Futures Filled with Possibility",
      ECSD,
      "The Edmonton Catholic Schools Foundation provides nutritious meals, mental health supports and emergency assistance.",
    );
    expect(r.priority).toBe("P2");
    expect(r.reason).not.toMatch(/Edmonton-area relevance/);
    const prayer = c("Prayer for Pope Leo", ECSD, "Our Edmonton Catholic Schools community joins Catholics in praying for Pope Leo.");
    expect(prayer.priority).toBe("P2");
  });

  it("P2: Catholic community event", () => {
    const r = c("Grand Opening and Blessing of St. Carlo Acutis Catholic High School", ECSD);
    expect(r.priority).toBe("P2");
    expect(r.category).toBe("event");
  });

  it("P3: routine international Vatican news", () => {
    const r = c("Cameroon: Peace is priceless, Bamenda archbishop reflects", VATICAN, "The archbishop lamented war.");
    expect(r.priority).toBe("P3");
    expect(r.reason).toMatch(/international/);
  });

  it("raises papal items above routine international news but below local items", () => {
    const r = c("Pope Leo meets with youth delegation", VATICAN);
    expect(r.priority).toBe("P2");
  });

  it("P3: unrelated government news", () => {
    const r = c("Highway 2 paving schedule update", GOA, "Crews will resurface lanes.");
    expect(r.priority).toBe("P3");
  });

  it("applies recency caps", () => {
    const old = c("Archbishop of Edmonton hospitalized; emergency update", CAEDM, "", hoursAgo(24 * 10));
    expect(old.priority).toBe("P2");
    const ancient = c("Archbishop of Edmonton announces pastoral plan", CAEDM, "", hoursAgo(24 * 40));
    expect(ancient.priority).toBe("P3");
  });

  it("keeps verification separate and flags sensitive items for review", () => {
    const official = c("Statement regarding investigation at Edmonton parish", CAEDM);
    expect(official.verificationStatus).toBe("official_source");
    expect(official.sensitive).toBe(true);
    expect(official.reason).toMatch(/human review/);

    const manual = c("Allegations reported involving Edmonton Catholic parish", MANUAL);
    expect(manual.verificationStatus).toBe("unverified");
    expect(manual.sensitive).toBe(true);
  });

  it("always explains the classification", () => {
    for (const r of [c("Anything", GOA), c("Prayer for Pope Leo", ECSD)]) {
      expect(r.reasons.length).toBeGreaterThan(1);
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});
