import { expect, test, type Page } from "@playwright/test";
import { devSignIn } from "../e2e/helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const OUT = "artifacts/ui-previews";
const DESKTOP = { width: 1366, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test("invitation journey and email actions", async ({ page, browser }) => {
  await page.setViewportSize(DESKTOP);
  await devSignIn(page);

  // Send Invitation form, then its success state with live delivery status.
  await page.goto("/team");
  await page.locator("#invite-name").fill("Maria Santos");
  await page.locator("#invite-email").fill("maria.santos@caedm.ca");
  await shot(page, "send-invitation-form");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByTestId("delivery-status")).toHaveAttribute("data-status", "simulated");
  await shot(page, "invitation-success");

  // The link from the (simulated) email. Screenshots never show the URL, so the token isn't captured.
  await page.goto("/outbox?kind=invite");
  await page.getByTestId("outbox-row").filter({ hasText: "maria.santos@caedm.ca" }).first().getByRole("link").first().click();
  const href = await page.frameLocator("iframe").getByRole("link", { name: "Accept invitation", exact: true }).getAttribute("href");
  const invitePath = new URL(href!).pathname;

  // Send Brief action and its result.
  await page.goto("/notifications");
  await shot(page, "send-brief-action");
  await page.getByRole("button", { name: "Send me a brief now", exact: true }).click();
  await expect(page.getByTestId("delivery-status")).toHaveAttribute("data-status", "simulated");
  await shot(page, "brief-sent-state");

  // Recoverable error: the server finishes but the response is lost, as with a proxy timeout.
  await page.goto("/team");
  await page.waitForLoadState("networkidle");
  let dropped = false;
  await page.route("**/team", async (route) => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true;
      await route.fetch();
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.locator("#invite-name").fill("Riley Example");
  await page.locator("#invite-email").fill("riley.example@caedm.ca");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/We couldn't confirm whether this finished/)).toBeVisible();
  await shot(page, "recoverable-error");

  // Acceptance page as the invitee sees it, desktop and mobile, then the states and success.
  const guest = await (await browser.newContext()).newPage();
  await guest.setViewportSize(DESKTOP);
  await guest.goto(invitePath);
  await expect(guest.getByRole("heading", { name: "Welcome, Maria" })).toBeVisible();
  await shot(guest, "invite-accept-desktop");
  await guest.setViewportSize(MOBILE);
  await shot(guest, "invite-accept-mobile");
  await guest.goto("/invite/this-link-was-copied-wrong");
  await shot(guest, "invite-invalid-mobile");
  await guest.setViewportSize(DESKTOP);
  await guest.goto("/invite/this-link-was-copied-wrong");
  await shot(guest, "invite-invalid");
  await guest.goto("/invite/e2e-expired-invitation-token-0001");
  await shot(guest, "invite-expired");
  await guest.goto("/invite/e2e-used-invitation-token-0002");
  await shot(guest, "invite-already-accepted");

  await guest.goto(invitePath);
  await guest.getByLabel("Create a password").fill("a long example passphrase");
  await guest.getByLabel("Confirm password").fill("a long example passphrase");
  await guest.getByRole("button", { name: "Accept invitation and sign in" }).click();
  await expect(guest.getByText("Welcome to CAEDM News Desk. Your account is ready.")).toBeVisible();
  await shot(guest, "invite-success");
});

test("contextual help", async ({ page, browser }) => {
  await page.setViewportSize(DESKTOP);
  await devSignIn(page);
  const helpShot = async (name: string) => {
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.getByRole("dialog").getByRole("button", { name: "Close help" }).click();
  };

  await page.goto("/news");
  await page.getByTestId("story-row").first().getByRole("link").first().click();
  await page.waitForLoadState("networkidle");
  await shot(page, "help-story-page-hints");
  await page.getByRole("button", { name: "Help: Why a story got its priority" }).click();
  await helpShot("help-priority-reason");

  await page.goto("/team");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help: Changing someone's access" }).click();
  await helpShot("help-staff-actions");

  await page.goto("/sources/new");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Help: Finding and testing a feed" }).click();
  await helpShot("help-find-feed");

  const mobile = await (await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2 })).newPage();
  await mobile.goto("/login");
  await mobile.waitForLoadState("networkidle");
  await mobile.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(mobile.getByRole("dialog")).toBeVisible();
  await mobile.screenshot({ path: `${OUT}/help-forgot-password-mobile.png` });
});
