import type { Role } from "../db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  manager: "Manager",
  member: "Member",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including staff access, roles, sources and settings.",
  manager: "Member rights plus priority changes, alert/brief tools and on-demand source checks.",
  member: "Read and review news, manage follow-ups and notes, submit links.",
};

const ALL: readonly Role[] = ["admin", "manager", "member"];
const MANAGERS: readonly Role[] = ["admin", "manager"];
const ADMINS: readonly Role[] = ["admin"];

export const PERMISSIONS = {
  read_news: ALL,
  manage_own_account: ALL,
  request_feature: ALL,
  review_news: ALL,
  manage_follow_ups: ALL,
  submit_links: ALL,
  change_priority: MANAGERS,
  check_sources: MANAGERS,
  send_test_notifications: MANAGERS,
  manage_sources: ADMINS,
  manage_staff: ADMINS,
  manage_settings: ADMINS,
  view_system_health: ADMINS,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
