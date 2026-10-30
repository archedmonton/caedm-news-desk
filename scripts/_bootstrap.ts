// Loads .env.local / .env for CLI scripts and the worker (Next.js loads them itself for the web app).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file absent */
  }
}

/** Drizzle wraps driver errors as "Failed query: …"; the cause holds the reason an operator can act on. */
export function describeError(err: unknown): string {
  const e = err as Error & { cause?: Error & { code?: string } };
  const cause = e.cause?.message ? `\n  cause: ${e.cause.message}${e.cause.code ? ` (${e.cause.code})` : ""}` : "";
  return `${e.message}${cause}`;
}
