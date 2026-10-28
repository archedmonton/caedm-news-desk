import { env, isProduction } from "../env";
import { liveEmailStatus } from "../notify/transport";

/**
 * Production sign-in requires (1) explicit enablement and (2) a live, IT-approved mail transport so that
 * invitations actually prove mailbox ownership. Until both exist, production access stays disabled.
 */
export function productionAccess(): { enabled: boolean; reason: string } {
  if (!isProduction()) return { enabled: true, reason: "Development mode" };
  if (!env().PRODUCTION_ACCESS_ENABLED) return { enabled: false, reason: "PRODUCTION_ACCESS_ENABLED is not set." };
  const mail = liveEmailStatus();
  if (!mail.live) return { enabled: false, reason: `Verified email delivery is not configured: ${mail.reason}` };
  return { enabled: true, reason: "Production access enabled" };
}

/** Development sign-in shortcut: never available in a production build, regardless of env flags. */
export function devLoginAllowed(): boolean {
  return !isProduction() && env().DEV_LOGIN_ENABLED;
}

export function isAllowedEmail(email: string): boolean {
  const domain = env().ALLOWED_EMAIL_DOMAIN.toLowerCase();
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.endsWith(`@${domain}`);
}
