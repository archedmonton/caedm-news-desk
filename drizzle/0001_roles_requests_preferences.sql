CREATE TABLE `access_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`requested_role` text DEFAULT 'member' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` integer,
	`granted_role` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `access_requests_status_idx` ON `access_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_requests_email_idx` ON `access_requests` (`email`);--> statement-breakpoint
CREATE TABLE `feature_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'feature' NOT NULL,
	`importance` text DEFAULT 'important' NOT NULL,
	`requester_id` integer,
	`requester_email` text NOT NULL,
	`page` text,
	`status` text DEFAULT 'new' NOT NULL,
	`notification_id` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feature_requests_created_idx` ON `feature_requests` (`created_at`);--> statement-breakpoint
-- Hand-written: additive columns instead of drizzle-kit's table rebuild (a rebuild inside the migration
-- transaction cannot disable foreign keys and would cascade-delete sessions). The users.role SQL default stays
-- 'communications' from 0000; the application always supplies a role (schema $defaultFn).
ALTER TABLE `users` ADD `is_developer` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_digest` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_alerts` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_assignments` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_access_requests` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- MVP "communications" role had change-priority rights; map it to "manager".
UPDATE `users` SET `role` = 'manager' WHERE `role` = 'communications';--> statement-breakpoint
UPDATE `invitations` SET `role` = 'manager' WHERE `role` = 'communications';
