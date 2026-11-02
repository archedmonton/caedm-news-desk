ALTER TABLE "notifications" ADD COLUMN "claimed_at" bigint;--> statement-breakpoint
-- Before this release, email was sent inside the web request. A row left "pending", or "failed" with a timeout,
-- may already have been delivered (the request was cut off after the mail server received the message). Mark
-- those "unknown" so the refresh doesn't send a second copy; staff can resend after checking.
UPDATE "notifications" SET "status" = 'unknown', "next_attempt_at" = NULL,
  "last_error" = 'Delivery unconfirmed: the request ended before the mail server confirmed it (before 2026-10-30 fix).'
WHERE "status" = 'pending' AND "created_at" < (extract(epoch from now()) * 1000)::bigint - 300000;--> statement-breakpoint
UPDATE "notifications" SET "status" = 'unknown', "next_attempt_at" = NULL
WHERE "status" = 'failed' AND "last_error" ILIKE '%timeout%';
