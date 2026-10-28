// Loads .env.local / .env for CLI scripts and the worker (Next.js loads them itself for the web app).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file absent */
  }
}
