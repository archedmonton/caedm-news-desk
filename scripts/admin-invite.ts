import "./_bootstrap";
import { createInvitation } from "../src/lib/auth/users";

async function main() {
  // Operator bootstrap (requires server shell access):
  //   npm run admin:invite -- someone@caedm.ca [admin|communications]
  const [email, role = "admin"] = process.argv.slice(2);
  if (!email || !["admin", "communications"].includes(role)) {
    console.error("Usage: npm run admin:invite -- name@caedm.ca [admin|communications]");
    process.exit(1);
  }
  const r = await createInvitation({ email, role: role as "admin" | "communications", invitedBy: null });
  console.log(`Invitation created for ${email} (${role}); expires ${new Date(r.expiresAt).toISOString()}.`);
  console.log("One-time link (deliver securely to the invitee):");
  console.log(r.inviteUrl);
}

void main();
