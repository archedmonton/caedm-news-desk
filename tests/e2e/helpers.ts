import { expect, type Page } from "@playwright/test";

export async function devSignIn(page: Page, who: "Dev Administrator" | "Dev Manager" | "Dev Member" | "Dev Viewer" | "Ruban Peppin" = "Dev Administrator") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${who}`) }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}
