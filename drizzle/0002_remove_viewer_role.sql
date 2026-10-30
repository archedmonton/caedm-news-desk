-- The Viewer role was retired: existing viewers become Members. Data-only; no table changes.
UPDATE "users" SET "role" = 'member' WHERE "role" = 'viewer';--> statement-breakpoint
UPDATE "invitations" SET "role" = 'member' WHERE "role" = 'viewer';--> statement-breakpoint
UPDATE "access_requests" SET "requested_role" = 'member' WHERE "requested_role" = 'viewer';--> statement-breakpoint
UPDATE "access_requests" SET "granted_role" = 'member' WHERE "granted_role" = 'viewer';
