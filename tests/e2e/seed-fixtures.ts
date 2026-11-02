import { closeDb, getDb } from "../../src/lib/db/client";
import { invitations, users } from "../../src/lib/db/schema";
import { sha256 } from "../../src/lib/ingest/url";

// Fictional invitations for the isolated e2e database only, so the expired and already-used link pages can be
// tested and captured. These tokens are meaningless anywhere else.
export const E2E_TOKENS = { expired: "e2e-expired-invitation-token-0001", used: "e2e-used-invitation-token-0002" };

async function main() {
  if (!(process.env.PGLITE_DIR ?? "").includes("e2e")) throw new Error("Refusing to seed fixtures outside the e2e database.");
  const db = getDb();
  const now = Date.now();
  await db.insert(users).values([
    { email: "expired.invite@caedm.ca", name: "Sam Example", role: "member", status: "invited" },
    { email: "used.invite@caedm.ca", name: "Alex Example", role: "member", status: "active" },
  ]);
  await db.insert(invitations).values([
    { email: "expired.invite@caedm.ca", role: "member", tokenHash: sha256(E2E_TOKENS.expired), expiresAt: now - 3600_000, createdAt: now - 80 * 3600_000 },
    { email: "used.invite@caedm.ca", role: "member", tokenHash: sha256(E2E_TOKENS.used), expiresAt: now + 3600_000, acceptedAt: now - 60_000, createdAt: now - 3600_000 },
  ]);
  await closeDb();
  console.log("✓ e2e invitation fixtures");
}

void main();
