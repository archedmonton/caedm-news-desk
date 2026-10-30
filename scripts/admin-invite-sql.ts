import "./_bootstrap";
import { isAllowedEmail } from "../src/lib/auth/access";
import { randomToken } from "../src/lib/auth/password";
import { env } from "../src/lib/env";
import { sha256 } from "../src/lib/ingest/url";

// Bootstrap invite for networks that block Postgres ports (the CAEDM office blocks 5432/6543).
// Prints SQL to paste into the Supabase SQL editor (HTTPS). Only the token's hash goes into the SQL;
// the token itself stays in the printed link. Mirrors createInvitation, without sending an email.
const [rawEmail, role = "admin"] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!email || !["admin", "manager", "member", "viewer"].includes(role)) {
  console.error("Usage: npm run admin:invite:sql -- name@caedm.ca [admin|manager|member|viewer]");
  process.exit(1);
}
if (!isAllowedEmail(email)) {
  console.error(`✗ Only @${env().ALLOWED_EMAIL_DOMAIN} addresses can be invited.`);
  process.exit(1);
}

const token = randomToken();
const INVITE_TTL_MS = 72 * 3600_000;

console.log(`-- 1. Paste everything below into Supabase > SQL Editor and click Run. It should say "Success. No rows returned".
do $$
declare
  v_email text := '${email}';
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_user int;
begin
  if exists (select 1 from users where email = v_email and status = 'active') then
    raise exception 'That account is already active. Sign in at /login instead.';
  end if;
  insert into users (email, role, status, created_at, updated_at) values (v_email, '${role}', 'invited', v_now, v_now)
    on conflict (email) do update
      set status = 'invited', updated_at = v_now, role = case when users.is_developer then 'admin' else excluded.role end
    returning id into v_user;
  update invitations set revoked_at = v_now where email = v_email and accepted_at is null and revoked_at is null;
  insert into invitations (email, role, token_hash, expires_at, created_at)
    values (v_email, (select role from users where id = v_user), '${sha256(token)}', v_now + ${INVITE_TTL_MS}, v_now);
  insert into audit_logs (user_id, action, entity_type, entity_id, details, created_at)
    values (null, 'user.invited', 'user', v_user::text, jsonb_build_object('email', v_email, 'via', 'sql'), v_now);
end $$;
-- End of SQL.

`);
console.log("2. After it succeeds, open this one-time link (valid 72 hours). Keep it private; don't paste it anywhere:");
console.log(`${env().APP_URL}/invite/${token}`);
