import type { Role } from "../db/schema";

export const PERMISSIONS = {
  read_news: ["admin", "communications"],
  review_news: ["admin", "communications"],
  manage_follow_ups: ["admin", "communications"],
  change_priority: ["admin", "communications"],
  submit_links: ["admin", "communications"],
  manage_sources: ["admin"],
  manage_staff: ["admin"],
  manage_settings: ["admin"],
  view_system_health: ["admin"],
  send_test_notifications: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
