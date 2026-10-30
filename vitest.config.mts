import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // tsconfig keeps JSX for Next.js; tests compile it directly.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    environment: "node",
    env: { NODE_ENV: "test", TZ: "UTC" },
  },
});
