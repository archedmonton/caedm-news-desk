import { expect, test } from "@playwright/test";
import { devSignIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("login help shows the developer contact", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Help: Signing in" })).toBeVisible();
  await expect(dialog.getByText("Ruban Peppin")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "ruban.peppin@caedm.ca" })).toHaveAttribute("href", /^mailto:ruban\.peppin@caedm\.ca/);
  await dialog.getByRole("button", { name: "Close help" }).click();
  await expect(dialog).toBeHidden();
});

test("sign-in requires a work email", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const email = page.locator("#email");
  await email.evaluate((el) => el.removeAttribute("pattern")); // bypass browser validation to test the server check
  await email.fill("someone@gmail.com");
  await page.getByLabel("Password").fill("whatever password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Sign in with your @caedm.ca work email.")).toBeVisible();
});

test("access request reaches the administrator's dashboard and approval sends an invitation", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByText("Don't have an account? Request access").click();
  await page.getByLabel("Full name").fill("Pat Newcomer");
  await page.locator("#ra-email").fill("pat.newcomer@caedm.ca");
  await page.getByLabel("Department or position").fill("Office of Catholic Education");
  await page.getByLabel("Access needed").selectOption("viewer");
  await page.getByLabel(/Why do you need access/).fill("To follow education news.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Your request has been sent to the News Desk administrators/)).toBeVisible();

  await devSignIn(page, "Dev Administrator");
  const card = page.getByTestId("access-requests");
  await expect(card.getByRole("heading", { name: "People asking to join" })).toBeVisible();
  const req = card.getByTestId("access-request").filter({ hasText: "pat.newcomer@caedm.ca" });
  await expect(req).toContainText("Office of Catholic Education");
  await expect(req).toContainText("To follow education news.");
  await req.getByLabel(/Role for/).selectOption("member");
  await req.getByRole("button", { name: "Approve" }).click();
  // The row switches to its decided state, which is the admin's confirmation.
  await expect(req).toContainText(/approved as Member by Dev Administrator/i);

  await page.goto("/outbox?kind=invite");
  await expect(page.getByTestId("outbox-row").first()).toContainText("pat.newcomer@caedm.ca");
  await page.goto("/outbox?kind=access_request");
  await expect(page.getByTestId("outbox-row").first()).toContainText("Access request: Pat Newcomer");
});

test("dashboard help, and a feature request emailed to the developer", async ({ page }) => {
  await devSignIn(page, "Dev Member");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help: about this dashboard" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Help: Overview" })).toBeVisible();
  await expect(dialog.getByText("What the priorities mean")).toBeVisible();
  await dialog.getByRole("button", { name: "Request a feature" }).click();
  await dialog.getByLabel("Title").fill("Weekly summary email");
  await dialog.getByLabel("Type").selectOption("feature");
  await dialog.getByLabel("Details").fill("A Friday summary of the week's covered stories would help reporting.");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByText(/Request #\d+ was saved and queued for ruban\.peppin@caedm\.ca/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close help" }).click();

  await page.goto("/outbox?kind=feature_request");
  const row = page.getByTestId("outbox-row").first();
  await expect(row).toContainText("Feature request #");
  await expect(row).toContainText("to ruban.peppin@caedm.ca");
  await expect(row).toContainText("simulated");
});

test("each account manages its own email notifications", async ({ page }) => {
  await devSignIn(page, "Dev Manager");
  await page.getByRole("link", { name: "My account" }).first().click();
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Morning News Brief/).check();
  await page.getByLabel("P0 Critical only").check();
  await page.getByRole("button", { name: "Save my settings" }).click();
  await expect(page.getByText("Your settings were saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Morning News Brief/)).toBeChecked();
  await expect(page.getByLabel("P0 Critical only")).toBeChecked();
  await expect(page.getByLabel(/Access requests/)).toHaveCount(0); // administrators only
});

test("developer admin is listed, protected, and sees feature requests", async ({ page }) => {
  await devSignIn(page, "Ruban Peppin");
  await page.goto("/settings");
  const row = page.getByRole("row").filter({ hasText: "ruban.peppin@caedm.ca" });
  await expect(row.getByText("Developer")).toBeVisible();
  await expect(row.getByRole("combobox")).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Feature requests" })).toBeVisible();
  await expect(page.getByText("Weekly summary email")).toBeVisible();
});
