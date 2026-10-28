import { expect, test } from "@playwright/test";
import { devSignIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const FIXTURE = "http://127.0.0.1:3299";

test("an administrator adds a source: find feed, test, save", async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, "Dev Administrator");
  await page.goto("/sources");
  await page.getByRole("link", { name: "Add source" }).click();
  await expect(page.getByRole("heading", { name: "Add a news source" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Organization name").fill("Fixture Partner");
  await page.getByLabel("Website").fill(`${FIXTURE}/`);
  await page.getByRole("button", { name: "Find feed" }).click();
  await expect(page.getByLabel(/News feed/)).toHaveValue(`${FIXTURE}/feed/`);
  await page.getByRole("button", { name: "Test" }).click();
  await expect(page.getByText(/Works: 2 items found/)).toBeVisible();
  await expect(page.getByText("Fixture partner opens new Edmonton family centre")).toBeVisible();
  await page.getByRole("button", { name: "Add source" }).click();

  await expect(page).toHaveURL(/\/sources\?saved=1/);
  await expect(page.getByText(/Source saved and verified/)).toBeVisible();
  const card = page.getByTestId("source-card").filter({ has: page.getByRole("heading", { name: "Fixture Partner", exact: true }) });
  await expect(card).toContainText("Added by an administrator");
});

test("an administrator edits a source; a broken feed is rejected", async ({ page }) => {
  await devSignIn(page, "Dev Administrator");
  await page.goto("/sources");
  const card = page.getByTestId("source-card").filter({ has: page.getByRole("heading", { name: "Fixture Partner", exact: true }) });
  await card.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Fixture Partner" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByLabel(/News feed/).fill(`${FIXTURE}/missing-feed`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/The feed could not be verified/)).toBeVisible();

  await page.getByLabel(/News feed/).fill(`${FIXTURE}/feed/`);
  await page.getByLabel("Organization name").fill("Fixture Partner Society");
  await page.getByLabel("Importance").selectOption("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/sources\?saved=1/);
  await expect(page.getByRole("heading", { name: "Fixture Partner Society", exact: true })).toBeVisible();
});

test("only administrators can manage sources", async ({ page }) => {
  await devSignIn(page, "Dev Manager");
  await page.goto("/sources");
  await expect(page.getByRole("link", { name: "Add source" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check now" }).first()).toBeVisible(); // managers may still trigger checks
  await page.goto("/sources/new");
  await expect(page.getByRole("heading", { name: "Add a news source" })).toHaveCount(0);
});

test("signed-in users see live updates when new stories arrive", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devSignIn(page, "Dev Viewer");
  const live = page.getByTestId("live-updates");
  await expect(live).toContainText(/Live · sources checked|Checking sources/);

  // A colleague adds a story in another session.
  const other = await (await browser.newContext()).newPage();
  await devSignIn(other, "Dev Member");
  await other.goto("/news");
  await other.waitForLoadState("networkidle");
  await other.getByLabel("Article URL").fill(`${FIXTURE}/news/live-test`);
  await other.getByRole("button", { name: "Add to News Feed" }).click();
  await expect(other.getByText(/Link added as an unverified story/)).toBeVisible();

  // The viewer's open dashboard is told about it (poll triggered by returning to the tab).
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const banner = live.getByRole("status").filter({ hasText: /new stor/ });
  await expect(banner).toContainText(/\d+ new stor/);
  await banner.click();
  await expect(banner).toHaveCount(0);
  await page.goto("/news?q=Fixture+live+update");
  await expect(page.getByTestId("story-row")).toHaveCount(1);
});
