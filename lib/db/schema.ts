// eShareGoal database (Neon Postgres, Drizzle). Phase 1: accounts and sign-in, groups, memberships and invitations,
// goals with their members, records, and an audit log. Phase 2 adds templates, workflows, import jobs and reports.
//
// Rules the server enforces (lib/server/dal.ts), not the database alone:
// - Two account types: System Admin (site_role "admin", views everything, changes no group data) and User.
// - Owner / Member are roles inside one group (group_member.role). The creator is always an Owner.
// - A member is in every goal of the group (all_goals) or only the goals listed in goal_member.
// - Money is integer centavos (bigint). Records are never hard-deleted: deleted_at keeps the history and the audit trail.
import { relations, sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

// ---------- Accounts and sign-in (Auth.js tables, with eShareGoal's own columns on user) ----------
export const siteRole = pgEnum("site_role", ["admin", "user"]);
// New accounts wait for a System Admin's review (ID check) before they can use groups; revoked accounts cannot sign in.
export const userStatus = pgEnum("user_status", ["pending_review", "active", "rejected", "revoked"]);

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  phone: text("phone"),
  passwordHash: text("password_hash"), // salted scrypt; null for accounts that sign in with Google or an email link
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
  siteRole: siteRole("site_role").notNull().default("user"),
  status: userStatus("status").notNull().default("pending_review"),
  reviewNote: text("review_note"), // why it was rejected or revoked (shown to the user)
  createdAt: createdAt(),
});

export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verificationToken", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

// ---------- Groups and who is in them ----------
export const groupRole = pgEnum("group_role", ["owner", "member"]);

export const groups = pgTable("group", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
});

export const groupMembers = pgTable("group_member", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: groupRole("role").notNull().default("member"),
  allGoals: boolean("all_goals").notNull().default(true), // false: only the goals in goal_member
  joinedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("group_member_user_idx").on(t.userId)]);

// An invitation by email. goalIds null = the whole group. Expires 7 days after sent_at (resend renews it).
export const inviteStatus = pgEnum("invite_status", ["pending", "accepted", "declined", "cancelled"]);
export const groupInvites = pgTable("group_invite", {
  id: id(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  email: text("email").notNull(), // lower case
  goalIds: uuid("goal_ids").array(),
  status: inviteStatus("status").notNull().default("pending"),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  // One open invitation per email and group.
  uniqueIndex("group_invite_open_idx").on(t.groupId, t.email).where(sql`${t.status} = 'pending'`),
  index("group_invite_email_idx").on(t.email),
]);

// ---------- Goals (sub goals of a group) ----------
export const goalMeasure = pgEnum("goal_measure", ["money", "count", "checklist"]);
export const goalScope = pgEnum("goal_scope", ["single", "each"]); // one shared target, or the same target for each member
export const goalStatus = pgEnum("goal_status", ["active", "paused", "completed", "archived"]);

export const goals = pgTable("goal", {
  id: id(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // loan, savings, fitness, tasks, custom… (the template it came from in phase 2)
  measure: goalMeasure("measure").notNull(),
  scope: goalScope("scope").notNull().default("single"),
  status: goalStatus("status").notNull().default("active"),
  target: bigint("target", { mode: "number" }), // centavos for money, a count otherwise; null = no target
  details: jsonb("details").$type<Record<string, string>>().notNull().default({}), // the fields the Owner filled in
  about: text("about").notNull().default(""),
  startsOn: date("starts_on", { mode: "string" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("goal_group_idx").on(t.groupId)]);

// Who takes part in a goal when their group membership is not all_goals, and each member's share (money goals).
export const goalMembers = pgTable("goal_member", {
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  share: bigint("share", { mode: "number" }), // monthly share in centavos (loan and savings goals)
  joinedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.goalId, t.userId] })]);

// A member asking to join a goal; an Owner approves (adds goal_member) or declines.
export const requestStatus = pgEnum("request_status", ["pending", "approved", "declined", "cancelled"]);
export const goalJoinRequests = pgTable("goal_join_request", {
  id: id(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: requestStatus("status").notNull().default("pending"),
  createdAt: createdAt(),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
}, (t) => [uniqueIndex("goal_join_open_idx").on(t.goalId, t.userId).where(sql`${t.status} = 'pending'`)]);

// ---------- Records: deposits, payments, logged progress, tasks ----------
export const recordDirection = pgEnum("record_direction", ["in", "out"]);
export const records = pgTable("record", {
  id: id(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => users.id), // who it is about; null for goal-level records
  day: date("day", { mode: "string" }).notNull(), // the day it happened
  amount: bigint("amount", { mode: "number" }).notNull().default(0), // centavos (money) or the value logged (count)
  direction: recordDirection("direction"), // money only
  kind: text("kind"), // deposit, loan_payment, expense, withdrawal…
  method: text("method"), // Bank transfer, GCash…
  ref: text("ref"), // bank reference: used to skip duplicate imports
  messageId: text("message_id"), // the Gmail message it came from: the same email is never added twice, even if two jobs read a different reference
  note: text("note").notNull().default(""),
  title: text("title"), // checklist tasks
  done: boolean("done"),
  source: text("source").notNull().default("manual"), // manual, import, submission
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("record_goal_idx").on(t.goalId, t.day), index("record_ref_idx").on(t.goalId, t.ref),
  // The last line against duplicates: two runs at the same moment cannot both add one payment. Deleted records free their reference.
  uniqueIndex("record_goal_ref_unique").on(t.goalId, t.ref).where(sql`${t.ref} is not null and ${t.deletedAt} is null`),
  uniqueIndex("record_goal_message_unique").on(t.goalId, t.messageId).where(sql`${t.messageId} is not null and ${t.deletedAt} is null`)]);

// ---------- Audit log: who changed what (records, members, goals, groups, reviews) ----------
export const auditLog = pgTable("audit_log", {
  id: id(),
  at: createdAt(),
  actorId: text("actor_id").references(() => users.id),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. record.create, member.remove, invite.accept, user.approve
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("audit_group_idx").on(t.groupId, t.at)]);

// ---------- Gmail connections ----------
// One inbox per goal. entry: the goal's setup key ("family~car-credit") while the screens run on sample goals.
// refresh_token lets scheduled jobs read mail while the Owner is offline; it is always encrypted (lib/server/gmail.ts).
export const gmailConnections = pgTable("gmail_connection", {
  entry: text("entry").primaryKey(),
  email: text("email").notNull(),
  refreshToken: text("refresh_token").notNull(),
  connectedBy: text("connected_by").references(() => users.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---------- Gmail import setup ----------
// What the scheduler runs. key: "common" for the common workflows, or a goal's setup key for its jobs (lib/server/import-setup.ts).
export const importSetups = pgTable("import_setup", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<object>().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---------- Gmail payments waiting for an Owner ----------
// One row per payment found. status: pending, confirmed or rejected. A rejected row keeps the payment out of later runs.
export const importReviews = pgTable("import_review", {
  id: id(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  ref: text("ref").notNull(),
  messageId: text("message_id"),
  amount: bigint("amount", { mode: "number" }).notNull(), // centavos
  day: date("day", { mode: "string" }).notNull(),
  payer: text("payer").notNull().default(""),
  memberId: text("member_id").references(() => users.id), // null until a payer rule or an Owner says who it is
  job: text("job").notNull().default(""),
  status: text("status").notNull().default("pending"),
  foundBy: text("found_by").references(() => users.id, { onDelete: "set null" }), // null when the timer found it
  foundAt: timestamp("found_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
}, (t) => [uniqueIndex("import_review_goal_ref_unique").on(t.goalId, t.ref), uniqueIndex("import_review_goal_message_unique").on(t.goalId, t.messageId).where(sql`${t.messageId} is not null`)]);

// ---------- Relations (for db.query) ----------
export const usersRelations = relations(users, ({ many }) => ({ memberships: many(groupMembers) }));
export const groupsRelations = relations(groups, ({ many, one }) => ({ members: many(groupMembers), goals: many(goals), invites: many(groupInvites), creator: one(users, { fields: [groups.createdBy], references: [users.id] }) }));
export const groupMembersRelations = relations(groupMembers, ({ one }) => ({ group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }), user: one(users, { fields: [groupMembers.userId], references: [users.id] }) }));
export const groupInvitesRelations = relations(groupInvites, ({ one }) => ({ group: one(groups, { fields: [groupInvites.groupId], references: [groups.id] }) }));
export const goalsRelations = relations(goals, ({ one, many }) => ({ group: one(groups, { fields: [goals.groupId], references: [groups.id] }), members: many(goalMembers), records: many(records) }));
export const goalMembersRelations = relations(goalMembers, ({ one }) => ({ goal: one(goals, { fields: [goalMembers.goalId], references: [goals.id] }), user: one(users, { fields: [goalMembers.userId], references: [users.id] }) }));
export const recordsRelations = relations(records, ({ one }) => ({ goal: one(goals, { fields: [records.goalId], references: [goals.id] }), member: one(users, { fields: [records.memberId], references: [users.id] }) }));
