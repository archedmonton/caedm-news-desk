import { expect, test } from "@playwright/test";
import { devSignIn } from "./helpers";

test("mobile navigation and feed layout", async ({ page }) => {
  await devSignIn(page);
  const menu = page.getByRole("button", { name: "Open menu" });
  await expect(menu).toBeVisible();
  await menu.click();
  await page.locator("#mobile-nav").getByRole("link", { name: "News Feed" }).click();
  await expect(page.getByRole("heading", { name: "News Feed" })).toBeVisible();
  await expect(page.getByTestId("story-row").first()).toBeVisible();
  // No horizontal overflow on the page body.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
