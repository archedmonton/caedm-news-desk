import { expect, test, type Page } from "@playwright/test";
import { devSignIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const EXPIRED = "e2e-expired-invitation-token-0001";

async function openPageHelp(page: Page, heading: string) {
  await page.getByRole("main").getByRole("button", { name: "Help", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Help: ${heading}` })).toBeVisible();
  await dialog.getByRole("button", { name: "Close help" }).click();
  await expect(dialog).toBeHidden();
}

test("every page has a Help button that explains that page", async ({ page }) => {
  test.setTimeout(180_000); // first visit to each route compiles it in dev mode
  await devSignIn(page);
  const pages: [string, string][] = [
    ["/news", "News Feed"],
    ["/follow-ups", "Follow-ups"],
    ["/sources", "Sources"],
    ["/sources/new", "Adding a source"],
    ["/notifications", "Notifications & alerts"],
    ["/team", "Team management"],
    ["/settings", "Settings"],
    ["/outbox", "Email outbox"],
    ["/outbox/preview", "Brief preview"],
    ["/account", "My account"],
    ["/guide", "User guide"],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await openPageHelp(page, heading);
  }

  await page.goto("/news");
  await page.getByTestId("story-row").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/news\/\d+/);
  await page.waitForLoadState("networkidle");
  await openPageHelp(page, "Story");
});

test("a ? beside a feature opens Help at that feature, ahead of the page's other help", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/news");
  await page.getByTestId("story-row").first().getByRole("link").first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help: Why a story got its priority" }).click();
  const dialog = page.getByRole("dialog");
  const focused = dialog.locator("section[aria-current='true']");
  await expect(focused.getByRole("heading", { name: "Why a story got its priority" })).toBeVisible();
  await expect(dialog.locator("section").first()).toHaveAttribute("aria-current", "true");
  await dialog.getByRole("button", { name: "Close help" }).click();

  await page.goto("/team");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help: Changing someone's access" }).click();
  await expect(focused.getByRole("heading", { name: "Changing someone's access" })).toBeVisible();
  await expect(focused).toContainText("Disable, then send them a new invitation");
});

test("members see help for what they can do, without admin-only hints", async ({ page }) => {
  await devSignIn(page, "Dev Member");
  await page.goto("/news");
  await page.getByTestId("story-row").first().getByRole("link").first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Help: Assigning a follow-up" })).toBeVisible();
  // Members can't change priorities, so the panel and its hint aren't shown.
  await expect(page.getByRole("button", { name: "Help: Changing a story's priority" })).toHaveCount(0);
});

test("sign-in explains what to do about a forgotten password", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("section[aria-current='true']").getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await expect(dialog).toContainText("Ask a News Desk administrator");
});

test("the invitation page has its own help, even when the link can't be used", async ({ page }) => {
  await page.goto(`/invite/${EXPIRED}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Help: Accepting your invitation" })).toBeVisible();
});
