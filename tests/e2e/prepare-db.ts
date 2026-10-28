import { execSync } from "node:child_process";
import fs from "node:fs";

const file = process.env.DATABASE_PATH ?? "./data/e2e.db";
if (!file.includes("e2e")) throw new Error(`Refusing to reset non-e2e database ${file}`);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${file}${suffix}`, { force: true });
execSync("npx tsx scripts/db-setup.ts --sample", { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } });
