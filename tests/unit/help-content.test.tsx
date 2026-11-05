import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contextFor, HELP_CONTEXTS, HELP_TOPICS, type HelpTopic } from "@/components/help-content";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { INVITE_TTL_MS, LOCK_MS, MAX_FAILED } from "@/lib/auth/users";
import { MAX_BACKOFF_MINUTES } from "@/lib/ingest/collector";
import { BRIEF_NOW_GUARD_MS } from "@/lib/notify/digest";

const text = (topic: HelpTopic) => renderToStaticMarkup(<>{HELP_TOPICS[topic].body}</>).replace(/<[^>]+>/g, "");
const contextText = (key: string) =>
  HELP_CONTEXTS[key].sections.map((s) => renderToStaticMarkup(<>{s.body}</>).replace(/<[^>]+>/g, "")).join(" ");

/** Every authenticated page route, from the file system, with dynamic segments filled in. */
function appRoutes() {
  const root = path.resolve("src/app/(app)");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") {
        const rel = path.relative(root, dir).split(path.sep).filter(Boolean);
        out.push(`/${rel.map((seg) => (seg.startsWith("[") ? "42" : seg)).join("/")}`);
      }
    }
  };
  walk(root);
  return out;
}

describe("contextual help", () => {
  it("gives every page its own help, so new pages can't silently fall back to the Overview help", () => {
    const routes = appRoutes();
    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes) {
      const ctx = contextFor(route);
      expect(ctx, route).toBeDefined();
      if (route !== "/") expect(ctx, route).not.toBe(HELP_CONTEXTS["/"]);
    }
  });

  it("matches exact pages before patterns, and patterns before sections", () => {
    expect(contextFor("/sources/new").heading).toBe("Adding a source");
    expect(contextFor("/sources/7").heading).toBe("Editing a source");
    expect(contextFor("/outbox/preview").heading).toBe("Brief preview");
    expect(contextFor("/outbox/12").heading).toBe("Email message");
    expect(contextFor("/news/3").heading).toBe("Story");
    expect(contextFor("/news").heading).toBe("News Feed");
    expect(contextFor("/").heading).toBe("Overview");
    expect(contextFor("/anything", "invite").heading).toBe("Accepting your invitation");
    expect(contextFor("/unknown-page").heading).toBe("Overview");
  });

  it("states the same limits the code enforces", () => {
    expect(text("password")).toContain(`at least ${MIN_PASSWORD_LENGTH} characters`);
    expect(text("password")).toContain(`After ${MAX_FAILED} incorrect sign-in attempts, the account is locked for ${LOCK_MS / 60_000} minutes`);
    expect(contextText("login")).toContain(`After ${MAX_FAILED} incorrect attempts the account is locked for ${LOCK_MS / 60_000} minutes`);
    expect(text("forgot-password")).toContain(`Wait ${LOCK_MS / 60_000} minutes`);
    expect(text("inviting")).toContain(`works for ${INVITE_TTL_MS / 3600_000} hours`);
    expect(contextText("invite")).toContain(`expires after ${INVITE_TTL_MS / 3600_000} hours`);
    expect(contextText("invite")).toContain(`at least ${MIN_PASSWORD_LENGTH} characters`);
    expect(text("source-health")).toContain(`up to every ${MAX_BACKOFF_MINUTES / 60} hours`);
    expect(BRIEF_NOW_GUARD_MS).toBe(60_000);
    expect(text("send-now")).toContain("one per minute");
  });

  it("explains how to recover a forgotten password in a way the app allows", () => {
    // Inviting an active account is refused, so administrators must disable it first.
    expect(text("staff-actions")).toMatch(/Disable.*then send them a new invitation/);
    expect(text("forgot-password")).toContain("Ask a News Desk administrator");
  });
});
