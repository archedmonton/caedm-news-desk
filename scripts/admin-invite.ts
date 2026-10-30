import { describeError } from "./_bootstrap";
import { createInvitation } from "../src/lib/auth/users";
import { closeDb } from "../src/lib/db/client";

async function main() {
  // Operator bootstrap (requires server shell access):
  //   npm run admin:invite -- someone@caedm.ca [admin|manager|member|viewer]
  const [email, role = "admin"] = process.argv.slice(2);
  if (!email || !["admin", "manager", "member", "viewer"].includes(role)) {
    console.error("Usage: npm run admin:invite -- name@caedm.ca [admin|manager|member|viewer]");
    process.exit(1);
  }
  const r = await createInvitation({ email, role: role as "admin" | "manager" | "member" | "viewer", invitedBy: null });
  console.log(`Invitation created for ${email} (${role}); expires ${new Date(r.expiresAt).toISOString()}.`);
  console.log("One-time link (deliver securely to the invitee):");
  console.log(r.inviteUrl);
}

main()
  .catch((e) => {
    console.error(`✗ ${describeError(e)}`);
    process.exitCode = 1;
  })
  .finally(closeDb);
