CREATE TABLE `application_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `follow_up_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`follow_up_id` integer NOT NULL,
	`author_id` integer,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`follow_up_id`) REFERENCES `follow_ups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `follow_up_notes_fu_idx` ON `follow_up_notes` (`follow_up_id`);--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`assignee_id` integer,
	`due_at` integer,
	`created_by` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follow_ups_story_id_unique` ON `follow_ups` (`story_id`);--> statement-breakpoint
CREATE INDEX `follow_ups_assignee_idx` ON `follow_ups` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `follow_ups_due_idx` ON `follow_ups` (`due_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` integer,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_email_idx` ON `invitations` (`email`);--> statement-breakpoint
CREATE TABLE `notification_stories` (
	`notification_id` integer NOT NULL,
	`story_id` integer NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`notification_id`, `story_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_stories_story_idx` ON `notification_stories` (`story_id`,`kind`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transport` text DEFAULT 'outbox' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_kind_idx` ON `notifications` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `source_check_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`http_status` integer,
	`items_found` integer DEFAULT 0 NOT NULL,
	`items_new` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`error` text,
	`trigger` text DEFAULT 'schedule' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `check_logs_source_idx` ON `source_check_logs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`website_url` text NOT NULL,
	`feed_url` text,
	`method` text NOT NULL,
	`adapter` text NOT NULL,
	`org_type` text NOT NULL,
	`region` text NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`default_category` text DEFAULT 'other' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`check_interval_minutes` integer,
	`notes` text,
	`last_checked_at` integer,
	`last_success_at` integer,
	`last_article_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`next_check_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_slug_unique` ON `sources` (`slug`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title_fingerprint` text NOT NULL,
	`group_key` text NOT NULL,
	`description` text,
	`description_source` text DEFAULT 'none' NOT NULL,
	`source_id` integer NOT NULL,
	`published_at` integer,
	`first_detected_at` integer NOT NULL,
	`source_updated_at` integer,
	`category` text DEFAULT 'other' NOT NULL,
	`geo_relevance` text DEFAULT 'international' NOT NULL,
	`priority` text DEFAULT 'P3' NOT NULL,
	`priority_score` integer DEFAULT 0 NOT NULL,
	`priority_reason` text DEFAULT '' NOT NULL,
	`priority_overridden` integer DEFAULT false NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`sensitive` integer DEFAULT false NOT NULL,
	`review_status` text DEFAULT 'new' NOT NULL,
	`alert_suppressed` integer DEFAULT false NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_canonical_url_unique` ON `stories` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `stories_published_idx` ON `stories` (`published_at`);--> statement-breakpoint
CREATE INDEX `stories_detected_idx` ON `stories` (`first_detected_at`);--> statement-breakpoint
CREATE INDEX `stories_priority_idx` ON `stories` (`priority`);--> statement-breakpoint
CREATE INDEX `stories_review_idx` ON `stories` (`review_status`);--> statement-breakpoint
CREATE INDEX `stories_source_idx` ON `stories` (`source_id`);--> statement-breakpoint
CREATE INDEX `stories_group_idx` ON `stories` (`group_key`);--> statement-breakpoint
CREATE TABLE `story_priority_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`from_priority` text,
	`to_priority` text NOT NULL,
	`reason` text NOT NULL,
	`changed_by` integer,
	`changed_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `priority_history_story_idx` ON `story_priority_history` (`story_id`);--> statement-breakpoint
CREATE TABLE `story_sources` (
	`story_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`url` text NOT NULL,
	`detected_at` integer NOT NULL,
	PRIMARY KEY(`story_id`, `source_id`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'communications' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`password_hash` text,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);