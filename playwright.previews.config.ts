import { devices } from "@playwright/test";
import base from "./playwright.config";

/** npm run previews:ui: captures app screens into artifacts/ui-previews (same isolated e2e server and data). */
const config = {
  ...base,
  testDir: "./tests/previews",
  projects: [{ name: "previews", use: { ...devices["Desktop Chrome"] } }],
};

export default config;
