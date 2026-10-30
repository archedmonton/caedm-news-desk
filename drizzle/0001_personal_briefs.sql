ALTER TABLE "users" ADD COLUMN "digest_time" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_days" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_scope" text DEFAULT 'catholic' NOT NULL;