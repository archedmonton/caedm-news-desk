import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// All timestamps are UTC epoch milliseconds.
const now = sql`(unixepoch('subsec') * 1000)`;
const ts = (name: string) => integer(name, { mode: "number" });

/** Highest to lowest. "communications" (MVP) was migrated to "manager". */
export const ROLES = ["admin", "manager", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REVIEW_STATUSES = ["new", "reviewing", "assigned", "covered", "archived"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const VERIFICATION_STATUSES = ["official_source", "unverified", "verified_by_staff"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CATEGORIES = [
  "archdiocese",
  "catholic_education",
  "healthcare",
  "government_policy",
  "canadian_catholic",
  "vatican",
  "community",
  "event",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GEO = ["edmonton", "alberta", "canada", "international"] as const;
export type Geo = (typeof GEO)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  role: text("role", { enum: ROLES })
    .notNull()
    .default("member")
    .$defaultFn(() => "member"),
  status: text("status", { enum: ["invited", "active", "disabled"] }).notNull().default("invited"),
  passwordHash: text("password_hash"),
  /** The application's developer (help & support contact). Protected from demotion/disablement. */
  isDeveloper: integer("is_developer", { mode: "boolean" }).notNull().default(false),
  // Personal email notification preferences (in addition to the team mailbox in Settings).
  notifyDigest: integer("notify_digest", { mode: "boolean" }).notNull().default(false),
  notifyAlerts: text("notify_alerts", { enum: ["all", "p0", "none"] }).notNull().default("none"),
  notifyAssignments: integer("notify_assignments", { mode: "boolean" }).notNull().default(true),
  notifyAccessRequests: integer("notify_access_requests", { mode: "boolean" }).notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
});

export const invitations = sqliteTable(
  "invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: integer("invited_by").references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("invitations_email_idx").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull(),
  feedUrl: text("feed_url"),
  method: text("method", { enum: ["rss", "html", "manual"] }).notNull(),
  adapter: text("adapter").notNull(),
  orgType: text("org_type").notNull(),
  region: text("region", { enum: GEO }).notNull(),
  importance: integer("importance").notNull().default(3), // 1–5
  defaultCategory: text("default_category", { enum: CATEGORIES }).notNull().default("other"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  checkIntervalMinutes: integer("check_interval_minutes"), // null → global setting
  notes: text("notes"),
  lastCheckedAt: ts("last_checked_at"),
  lastSuccessAt: ts("last_success_at"),
  lastArticleAt: ts("last_article_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  nextCheckAt: ts("next_check_at"),
  lastError: text("last_error"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
});

export const stories = sqliteTable(
  "stories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    canonicalUrl: text("canonical_url").notNull().unique(),
    titleFingerprint: text("title_fingerprint").notNull(),
    groupKey: text("group_key").notNull(),
    description: text("description"),
    descriptionSource: text("description_source", { enum: ["feed", "page_meta", "listing", "staff", "none"] })
      .notNull()
      .default("none"),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    publishedAt: ts("published_at"),
    firstDetectedAt: ts("first_detected_at").notNull(),
    sourceUpdatedAt: ts("source_updated_at"),
    category: text("category", { enum: CATEGORIES }).notNull().default("other"),
    geoRelevance: text("geo_relevance", { enum: GEO }).notNull().default("international"),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("P3"),
    priorityScore: integer("priority_score").notNull().default(0),
    priorityReason: text("priority_reason").notNull().default(""),
    priorityOverridden: integer("priority_overridden", { mode: "boolean" }).notNull().default(false),
    verificationStatus: text("verification_status", { enum: VERIFICATION_STATUSES })
      .notNull()
      .default("unverified"),
    sensitive: integer("sensitive", { mode: "boolean" }).notNull().default(false),
    reviewStatus: text("review_status", { enum: REVIEW_STATUSES }).notNull().default("new"),
    alertSuppressed: integer("alert_suppressed", { mode: "boolean" }).notNull().default(false),
    isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [
    index("stories_published_idx").on(t.publishedAt),
    index("stories_detected_idx").on(t.firstDetectedAt),
    index("stories_priority_idx").on(t.priority),
    index("stories_review_idx").on(t.reviewStatus),
    index("stories_source_idx").on(t.sourceId),
    index("stories_group_idx").on(t.groupKey),
  ],
);

export const storySources = sqliteTable(
  "story_sources",
  {
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    url: text("url").notNull(),
    detectedAt: ts("detected_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.sourceId] })],
);

export const storyPriorityHistory = sqliteTable(
  "story_priority_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    fromPriority: text("from_priority", { enum: PRIORITIES }),
    toPriority: text("to_priority", { enum: PRIORITIES }).notNull(),
    reason: text("reason").notNull(),
    changedBy: integer("changed_by").references(() => users.id), // null = classifier
    changedAt: ts("changed_at").notNull().default(now),
  },
  (t) => [index("priority_history_story_idx").on(t.storyId)],
);

export const followUps = sqliteTable(
  "follow_ups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storyId: integer("story_id")
      .notNull()
      .unique()
      .references(() => stories.id, { onDelete: "cascade" }),
    assigneeId: integer("assignee_id").references(() => users.id),
    dueAt: ts("due_at"),
    createdBy: integer("created_by").references(() => users.id),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("follow_ups_assignee_idx").on(t.assigneeId), index("follow_ups_due_idx").on(t.dueAt)],
);

export const followUpNotes = sqliteTable(
  "follow_up_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    followUpId: integer("follow_up_id")
      .notNull()
      .references(() => followUps.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => users.id),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("follow_up_notes_fu_idx").on(t.followUpId)],
);

export const NOTIFICATION_KINDS = ["digest", "alert", "invite", "test", "assignment", "access_request", "feature_request"] as const;

export const NOTIFICATION_STATUSES = ["pending", "simulated", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull().default(""),
    text: text("text").notNull().default(""),
    status: text("status", { enum: NOTIFICATION_STATUSES }).notNull().default("pending"),
    transport: text("transport").notNull().default("outbox"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    lastError: text("last_error"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().default(now),
    sentAt: ts("sent_at"),
  },
  (t) => [index("notifications_kind_idx").on(t.kind, t.createdAt), index("notifications_status_idx").on(t.status)],
);

export const notificationStories = sqliteTable(
  "notification_stories",
  {
    notificationId: integer("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    storyId: integer("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["digest", "alert"] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.notificationId, t.storyId] }),
    index("notification_stories_story_idx").on(t.storyId, t.kind),
  ],
);

export const sourceCheckLogs = sqliteTable(
  "source_check_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    status: text("status", { enum: ["success", "error"] }).notNull(),
    httpStatus: integer("http_status"),
    itemsFound: integer("items_found").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    trigger: text("trigger", { enum: ["schedule", "manual"] }).notNull().default("schedule"),
  },
  (t) => [index("check_logs_source_idx").on(t.sourceId, t.startedAt)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const applicationSettings = sqliteTable("application_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: ts("updated_at").notNull().default(now),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const accessRequests = sqliteTable(
  "access_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    department: text("department").notNull().default(""),
    requestedRole: text("requested_role", { enum: ROLES }).notNull().default("member"),
    reason: text("reason").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "declined"] }).notNull().default("pending"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    grantedRole: text("granted_role", { enum: ROLES }),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("access_requests_status_idx").on(t.status, t.createdAt), index("access_requests_email_idx").on(t.email)],
);

export const FEATURE_REQUEST_STATUSES = ["new", "acknowledged", "planned", "done", "declined"] as const;

export const featureRequests = sqliteTable(
  "feature_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category", { enum: ["feature", "improvement", "bug", "source", "other"] }).notNull().default("feature"),
    importance: text("importance", { enum: ["nice_to_have", "important", "urgent"] }).notNull().default("important"),
    requesterId: integer("requester_id").references(() => users.id),
    requesterEmail: text("requester_email").notNull(),
    page: text("page"),
    status: text("status", { enum: FEATURE_REQUEST_STATUSES }).notNull().default("new"),
    notificationId: integer("notification_id").references(() => notifications.id),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("feature_requests_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Story = typeof stories.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

