import { expect, test, type Page } from "@playwright/test";
import { devSignIn } from "./helpers";

test.describe.configure({ mode: "serial" });

// Fictional tokens seeded into the isolated e2e database by seed-fixtures.ts.
const EXPIRED = "e2e-expired-invitation-token-0001";
const USED = "e2e-used-invitation-token-0002";

const outboxRows = async (page: Page, text: string) => {
  await page.goto("/outbox?kind=invite");
  return page.getByTestId("outbox-row").filter({ hasText: text }).count();
};

/** Lets the server-action request through, then drops the response, as a proxy timeout (504) would. */
async function dropNextActionResponse(page: Page, path: string) {
  let dropped = false;
  await page.route(`**${path}`, async (route) => {
    const req = route.request();
    if (!dropped && req.method() === "POST" && req.headers()["next-action"]) {
      dropped = true;
      await route.fetch(); // the server completes the action
      return route.abort("connectionreset");
    }
    return route.continue();
  });
}

test("a double click sends one invitation, and the button settles", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/team");
  await page.locator("#invite-name").fill("Jordan Twice");
  await page.locator("#invite-email").fill("jordan.twice@caedm.ca");
  await page.getByRole("button", { name: "Send invitation" }).dblclick();
  await expect(page.getByText("Invitation created for Jordan Twice (jordan.twice@caedm.ca).")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invitation" })).toBeEnabled();
  await expect(page.getByText(/less than 2 minutes ago/)).toHaveCount(0);
  expect(await outboxRows(page, "jordan.twice@caedm.ca")).toBe(1);
});

test("a lost response shows a clear message, and retrying doesn't send a second invitation", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/team");
  await page.waitForLoadState("networkidle");
  await dropNextActionResponse(page, "/team");
  await page.locator("#invite-name").fill("Riley Retry");
  await page.locator("#invite-email").fill("riley.retry@caedm.ca");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/We couldn't confirm whether this finished/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team management" })).toBeVisible(); // no error page
  await expect(page.getByRole("button", { name: "Send invitation" })).toBeEnabled();

  // The retry carries the same operation id, so the server returns the first result.
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation created for Riley Retry (riley.retry@caedm.ca).")).toBeVisible();
  expect(await outboxRows(page, "riley.retry@caedm.ca")).toBe(1);
});

test("Send me a brief now: a double click sends one brief", async ({ page }) => {
  await devSignIn(page, "Dev Member");
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Send me a brief now", exact: true }).dblclick();
  await expect(page.getByText(/is on its way to dev.member@caedm.ca/)).toBeVisible();
  await expect(page.getByTestId("delivery-status")).toHaveAttribute("data-status", "simulated");
  await expect(page.getByText(/just sent to you/)).toHaveCount(0);
  await page.goto("/outbox?kind=brief");
  await expect(page.getByTestId("outbox-row").filter({ hasText: "dev.member@caedm.ca" })).toHaveCount(1);
});

test("invitation links explain why they can't be used", async ({ page }) => {
  await page.goto("/invite/this-link-was-copied-wrong");
  await expect(page.getByRole("heading", { name: "This invitation link isn't valid" })).toBeVisible();

  await page.goto(`/invite/${EXPIRED}`);
  await expect(page.getByRole("heading", { level: 1, name: "This invitation has expired" })).toBeVisible();
  await expect(page.getByText("expired.invite@caedm.ca")).toBeVisible();

  await page.goto(`/invite/${USED}`);
  await expect(page.getByRole("heading", { level: 1, name: "You're already set up" })).toBeVisible();
  await page.getByRole("link", { name: "Go to sign-in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("delivery status of invitations is for administrators only", async ({ page, browser }) => {
  test.setTimeout(120_000); // first request to the status route compiles it in dev mode
  await devSignIn(page);
  await page.goto("/team");
  await page.locator("#invite-name").fill("Morgan Private");
  await page.locator("#invite-email").fill("morgan.private@caedm.ca");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByTestId("delivery-status")).toHaveAttribute("data-status", "simulated");
  const href = await page.getByTestId("delivery-status").getByRole("link", { name: "View in outbox" }).getAttribute("href");
  const id = href!.split("/").pop();
  expect((await page.request.get(`/api/notifications/${id}`)).status()).toBe(200);

  const member = await (await browser.newContext()).newPage();
  await devSignIn(member, "Dev Member");
  expect((await member.request.get(`/api/notifications/${id}`)).status()).toBe(404);
  expect((await (await browser.newContext()).request.get(`${new URL(page.url()).origin}/api/notifications/${id}`)).status()).toBe(401);
  await member.goto("/team");
  await expect(member.getByRole("heading", { name: "Team management" })).toHaveCount(0);
});
