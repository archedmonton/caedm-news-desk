import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORY_LABELS: Record<string, string> = {
  archdiocese: "Archdiocese",
  catholic_education: "Catholic education",
  healthcare: "Healthcare",
  government_policy: "Government & policy",
  canadian_catholic: "Canadian Catholic",
  vatican: "Vatican",
  community: "Community",
  event: "Event",
  other: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  assigned: "Assigned",
  covered: "Covered",
  archived: "Archived",
};

export const PRIORITY_LABELS: Record<string, string> = {
  P0: "Critical",
  P1: "High",
  P2: "Standard",
  P3: "Background",
};

export const GEO_LABELS: Record<string, string> = {
  edmonton: "Edmonton area",
  alberta: "Alberta",
  canada: "Canada",
  international: "International",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  official_source: "Official source",
  unverified: "Unverified",
  verified_by_staff: "Verified by staff",
};

/** Read a single string from Next.js searchParams. */
export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
