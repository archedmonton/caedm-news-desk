import { execSync } from "node:child_process";
import fs from "node:fs";

const dir = process.env.PGLITE_DIR ?? "./data/e2e-pglite";
if (!dir.includes("e2e")) throw new Error(`Refusing to reset non-e2e database ${dir}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(`${dir}.lock`, { force: true });
execSync("npx tsx scripts/db-setup.ts --sample --defer-checks", { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } });
