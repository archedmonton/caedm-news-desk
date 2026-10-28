import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const E2E_DB = "./data/e2e-pglite";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile.spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      // Fresh, isolated database with labelled sample data, then the dev server.
      command: `npx tsx tests/e2e/prepare-db.ts && npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PGLITE_DIR: E2E_DB,
        DATABASE_URL: "",
        APP_URL: `http://localhost:${PORT}`,
        DEV_LOGIN_ENABLED: "true",
        EMAIL_TRANSPORT: "outbox",
        EMAIL_LIVE_SEND: "false",
        FETCH_ALLOW_PRIVATE_HOSTS: "true",
        NEXT_DIST_DIR: ".next-e2e",
      },
    },
    {
      command: "npx tsx tests/e2e/fixture-server.ts",
      url: "http://127.0.0.1:3299/robots.txt",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
