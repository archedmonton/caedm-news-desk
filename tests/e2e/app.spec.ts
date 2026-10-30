import { expect, test } from "@playwright/test";
import { devSignIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors are redirected to sign-in", async ({ page }) => {
  await page.goto("/news");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "News Desk" })).toBeVisible();
});

test("overview shows monitoring summary", async ({ page }) => {
  await devSignIn(page);
  await expect(page.getByRole("main").getByText("High-priority open", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "High-priority alerts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Morning brief" })).toBeVisible();
  // Sample P0 story appears among high-priority alerts.
  await expect(page.getByRole("link", { name: /emergency closure of parish hall/ }).first()).toBeVisible();
});

test("news feed search, filters, detail and original link", async ({ page }) => {
  await devSignIn(page);
  await page.getByRole("link", { name: "News Feed" }).first().click();
  await expect(page.getByTestId("story-row").first()).toBeVisible();

  await page.getByPlaceholder("Search headlines and summaries").fill("Misericordia");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=Misericordia/);
  await expect(page.getByTestId("story-row")).toHaveCount(1);

  await page.goto("/news?priority=P3");
  for (const badge of await page.getByTestId("story-row").locator("span", { hasText: /^P\d/ }).allTextContents()) {
    expect(badge.startsWith("P3")).toBeTruthy();
  }

  await page.goto("/news?q=Misericordia");
  await page
    .getByRole("heading", { name: /Misericordia hospital introduces/ })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Misericordia hospital");
  await expect(page.getByRole("heading", { name: "Why this priority" })).toBeVisible();
  const original = page.getByRole("link", { name: "Open original source" });
  await expect(original).toHaveAttribute("href", "https://example.org/caedm-news-desk-sample/hospital-safety");
  await expect(original).toHaveAttribute("target", "_blank");
});

test("review workflow: mark reviewed, override priority, assign follow-up, add note, cover", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/news?q=Advent+concert");
  const row = page.getByTestId("story-row").first();
  await row.getByRole("button", { name: /Mark reviewed/ }).click();
  await expect(row.getByText("Reviewing")).toBeVisible();

  await row.getByRole("heading").getByRole("link").click();
  await page.waitForLoadState("networkidle"); // let React hydrate before editing form fields
  await page.getByLabel("Priority", { exact: true }).selectOption("P1");
  await page.getByLabel("Reason").fill("Archbishop attending; media interest expected");
  await page.getByRole("button", { name: "Save priority" }).click();
  await expect(page.getByText(/Priority set to P1/)).toBeVisible();
  await expect(page.getByText(/Manual override: Archbishop attending/)).toBeVisible();

  await page.getByLabel("Assignee").selectOption({ label: "Dev Member" });
  await page.getByLabel("Due date").fill("2030-01-15");
  await page.getByLabel("Note (optional)").fill("Prepare a social post");
  await page.getByRole("button", { name: "Assign follow-up" }).click();
  await expect(page.getByText(/Follow-up assigned\. The assignee was notified by email\./)).toBeVisible();
  await expect(page.getByText("Prepare a social post")).toBeVisible();

  await page.getByLabel("New note").fill("Photographer confirmed");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Photographer confirmed")).toBeVisible();

  await page.getByRole("link", { name: "Follow-ups" }).first().click();
  const fu = page.getByTestId("follow-up-row").filter({ hasText: "Advent concert" });
  await expect(fu).toContainText("Dev Member");
  await expect(fu).toContainText("Jan 15, 2030");
  await fu.getByRole("button", { name: "Mark covered" }).click();
  await expect(page.getByTestId("follow-up-row").filter({ hasText: "Advent concert" })).toHaveCount(0);
  await page.getByRole("link", { name: "Covered" }).click();
  await expect(page.getByTestId("follow-up-row").filter({ hasText: "Advent concert" })).toBeVisible();
});

test("archive removes a story from the active feed", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/news?q=Monthly+newsletter");
  await page
    .getByTestId("story-row")
    .first()
    .getByRole("button", { name: /Archive/ })
    .click();
  await expect(page.getByText("No stories match these filters")).toBeVisible();
  await page.goto("/news?q=Monthly+newsletter&status=archived");
  await expect(page.getByTestId("story-row")).toHaveCount(1);
});

test("sources show health and admins can toggle monitoring", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/sources");
  for (const name of ["Edmonton Catholic Schools", "Covenant Health", "Vatican News", "Government of Alberta"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Expansion registry" })).toBeVisible();
  const card = page.getByTestId("source-card").filter({ has: page.getByRole("heading", { name: "Vatican News", exact: true }) });
  await card.getByRole("button", { name: "Disable monitoring" }).click();
  await expect(card.getByText("Disabled")).toBeVisible();
  await card.getByRole("button", { name: "Enable monitoring" }).click();
  await expect(card.getByRole("button", { name: "Disable monitoring" })).toBeVisible();
});

test("digest preview and simulated alert delivery", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/outbox/preview");
  await expect(page.getByTestId("digest-subject")).toContainText("CAEDM Morning News Brief |");
  const frame = page.frameLocator("iframe");
  await expect(frame.getByText("Top stories requiring attention")).toBeVisible();
  await expect(frame.getByText("Outstanding Communications follow-ups")).toBeVisible();

  await page.goto("/outbox");
  await expect(page.getByText(/Simulated delivery/)).toBeVisible();
  await page.getByRole("button", { name: "Run alert check now" }).click();
  await expect(page.getByText(/Alert created for|No stories currently qualify|suppressed/)).toBeVisible();
  await page.goto("/outbox?kind=alert");
  const alertRow = page.getByTestId("outbox-row").first();
  await expect(alertRow).toContainText("simulated");
  await alertRow.getByRole("link").click();
  await expect(page.frameLocator("iframe").getByText(/High-Priority News Alert|Internal Review Alert/)).toBeVisible();

  // Running again must not create a duplicate alert for the same stories.
  await page.goto("/outbox");
  await page.getByRole("button", { name: "Run alert check now" }).click();
  await expect(page.getByText("No stories currently qualify for an alert.")).toBeVisible();

  await page.getByRole("button", { name: "Save preview to outbox" }).click();
  await expect(page.getByText(/Preview saved to the outbox/)).toBeVisible();
});

test("settings save and staff invitation flow with password sign-in", async ({ page, context }) => {
  test.setTimeout(180_000); // visits many routes; dev server compiles each on first use
  await devSignIn(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Send time").fill("07:45");
  await page.getByRole("button", { name: "Save briefing" }).click();
  await expect(page.getByText("Settings saved.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Send time")).toHaveValue("07:45");

  // Domain restriction
  await page.getByLabel("Email", { exact: true }).fill("someone@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Only @caedm.ca addresses can be invited/)).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill("new.staff@caedm.ca");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation created for new.staff@caedm.ca/)).toBeVisible();

  await page.goto("/outbox?kind=invite");
  await page.getByTestId("outbox-row").first().getByRole("link").click();
  const href = await page.frameLocator("iframe").getByRole("link", { name: "Accept invitation" }).getAttribute("href");
  expect(href).toMatch(/\/invite\//);

  await context.clearCookies();
  await page.goto(new URL(href!).pathname);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your name").fill("New Staff");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Confirm password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Invitation is single-use.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.goto(new URL(href!).pathname);
  await expect(page.getByText(/invalid, expired or already used/)).toBeVisible();

  await page.goto("/login");
  await page.locator("#email").fill("new.staff@caedm.ca");
  await page.getByLabel("Password").fill("wrong password!!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("members can review but not manage; viewers are read-only", async ({ page }) => {
  await devSignIn(page, "Dev Member");
  await page.goto("/settings");
  await expect(page.getByText("Only administrators can change settings.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff access" })).toHaveCount(0);
  await page.goto("/sources");
  await expect(page.getByRole("button", { name: /monitoring|Check now/ })).toHaveCount(0);
  await page.goto("/news?q=Misericordia");
  await expect(
    page
      .getByTestId("story-row")
      .first()
      .getByRole("button", { name: /Mark reviewed/ }),
  ).toBeVisible();
  await page.getByTestId("story-row").first().getByRole("heading").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Workflow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change priority" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await devSignIn(page, "Dev Viewer");
  await page.goto("/news?q=Misericordia");
  const row = page.getByTestId("story-row").first();
  await expect(row.getByRole("link", { name: /Open original source/ })).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Submit a link" })).toHaveCount(0);
  await row.getByRole("heading").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Why this priority" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workflow" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Assign follow-up|Add note/ })).toHaveCount(0);
});

test("personal brief: choose a time, send one now, and find help beside each feature", async ({ page }) => {
  await devSignIn(page);
  await page.goto("/account");
  await page.getByRole("checkbox", { name: /My news brief/ }).check();
  await page.getByLabel("Time (Edmonton)").selectOption("07:30");
  await page.getByLabel("Days").selectOption("weekdays");
  await page.getByRole("radio", { name: /All monitored news/ }).check();
  await page.getByRole("button", { name: "Save my settings" }).click();
  await expect(page.getByText("Your settings were saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Currently: Weekdays at 7:30/)).toBeVisible();
  await expect(page.getByLabel("Time (Edmonton)")).toHaveValue("07:30");

  await page.getByRole("button", { name: "Help: My news brief" }).click();
  const help = page.getByRole("dialog");
  await expect(help.getByRole("heading", { name: "Your personal news brief" })).toBeVisible();
  await help.getByRole("button", { name: "Close help" }).click();

  await page.goto("/outbox");
  await page.getByRole("button", { name: "Send me a brief now", exact: true }).click();
  await expect(page.getByText(/Your brief \(\d+ stor(y|ies)\) was saved to the outbox/)).toBeVisible();
  await page.getByRole("link", { name: "Personal briefs" }).click();
  await expect(page.getByTestId("outbox-row").first()).toContainText("Your CAEDM News Brief");
  await expect(page.getByTestId("outbox-row").first()).toContainText("Personal brief");
});

test("user guide renders from the docs with a contents list", async ({ page }) => {
  await devSignIn(page);
  await page.getByRole("link", { name: "User guide" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "User guide" })).toBeVisible();
  await page.getByRole("navigation", { name: "Guide contents" }).getByRole("link", { name: "Your personal news brief" }).click();
  await expect(page).toHaveURL(/#your-personal-news-brief$/);
  await expect(page.getByRole("heading", { level: 2, name: "Your personal news brief" })).toBeInViewport();
});
