import "server-only";
import { and, asc, count, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, groupMembers, groups, records, sessions, users } from "@/lib/db/schema";
import { Forbidden, type Viewer } from "./dal";
import { audit, parse, sendMail, UserError } from "./core";

// System Admin: review new accounts, revoke and restore access, and the site-wide numbers on the dashboard.
const assertAdmin = (v: Viewer) => { if (v.siteRole !== "admin") throw new Forbidden("Only a System Admin can do that."); };
type Status = "pending_review" | "active" | "rejected" | "revoked";

interface ListUsersInput {
  status?: Status;
  q?: string;
}
export async function listUsers(viewer: Viewer, filter: ListUsersInput = {}) {
  assertAdmin(viewer);
  const q = filter.q?.trim().replace(/[%_\\]/g, "");
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, siteRole: users.siteRole, status: users.status, reviewNote: users.reviewNote, createdAt: users.createdAt })
    .from(users).where(and(filter.status ? eq(users.status, filter.status) : undefined, q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined))
    .orderBy(asc(users.createdAt)).limit(500);
  const memberships = await db.select({ userId: groupMembers.userId, n: count() }).from(groupMembers).groupBy(groupMembers.userId);
  return rows.map((r) => ({ ...r, groups: memberships.find((m) => m.userId === r.id)?.n ?? 0 }));
}

async function target(viewer: Viewer, userId: string) {
  assertAdmin(viewer);
  const [u] = await db.select().from(users).where(eq(users.id, parse(z.string().min(1).max(80), userId))).limit(1);
  if (!u) throw new UserError("This account no longer exists.");
  if (u.id === viewer.id) throw new UserError("You cannot change your own account here.");
  return u;
}
const note = z.string().trim().max(300);

/** A new account: approve it (active) or reject it (a reason is required, and shown to them). */
export async function reviewUser(viewer: Viewer, userId: string, approve: boolean, reason = "") {
  const u = await target(viewer, userId);
  if (u.status !== "pending_review") throw new UserError("This account is not waiting for review.");
  const why = parse(note, reason);
  if (!approve && !why) throw new UserError("Say why it is rejected: the person sees it.");
  await db.update(users).set({ status: approve ? "active" : "rejected", reviewNote: approve ? null : why }).where(eq(users.id, u.id));
  await audit({ actorId: viewer.id, action: approve ? "user.approve" : "user.reject", detail: { userId: u.id, reason: why || undefined } });
  if (u.email) await sendMail(u.email, approve ? "Your eShareGoal account is approved" : "Your eShareGoal account was not approved", approve ? "You can sign in and use eShareGoal now." : `Reason: ${why}`);
}

/** Revoke access: signs them out everywhere. Not while they are the only Owner of a group (make someone else Owner first). */
export async function revokeUser(viewer: Viewer, userId: string, reason: string) {
  const u = await target(viewer, userId);
  if (u.siteRole === "admin") throw new UserError("Remove System Admin rights first.");
  const why = parse(note.min(1, "Say why access is revoked."), reason);
  const owned = await db.select({ groupId: groupMembers.groupId, name: groups.name }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, u.id), eq(groupMembers.role, "owner"), isNull(groups.archivedAt)));
  const alone = [];
  for (const g of owned) {
    const [{ n }] = await db.select({ n: count() }).from(groupMembers).where(and(eq(groupMembers.groupId, g.groupId), eq(groupMembers.role, "owner"), ne(groupMembers.userId, u.id)));
    if (!n) alone.push(g.name);
  }
  if (alone.length) throw new UserError(`They are the only Owner of ${alone.join(", ")}. Make another member an Owner there first.`);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "revoked", reviewNote: why }).where(eq(users.id, u.id));
    await tx.delete(sessions).where(eq(sessions.userId, u.id)); // signed out everywhere, at once
    await audit({ actorId: viewer.id, action: "user.revoke", detail: { userId: u.id, reason: why } }, tx);
  });
}
export async function restoreUser(viewer: Viewer, userId: string) {
  const u = await target(viewer, userId);
  if (u.status !== "revoked" && u.status !== "rejected") throw new UserError("This account is not revoked or rejected.");
  await db.update(users).set({ status: "active", reviewNote: null }).where(eq(users.id, u.id));
  await audit({ actorId: viewer.id, action: "user.restore", detail: { userId: u.id } });
}

/** Site-wide numbers for the System Admin dashboard. */
export async function adminMetrics(viewer: Viewer) {
  assertAdmin(viewer);
  const byStatus = await db.select({ status: users.status, n: count() }).from(users).where(eq(users.siteRole, "user")).groupBy(users.status);
  const [groupCount] = await db.select({ n: count() }).from(groups).where(isNull(groups.archivedAt));
  const goalRows = await db.select({ status: goals.status, n: count() }).from(goals).innerJoin(groups, eq(groups.id, goals.groupId)).where(isNull(groups.archivedAt)).groupBy(goals.status);
  const [recordCount] = await db.select({ n: count(), sum: sql<number>`coalesce(sum(case when ${records.direction} = 'in' then ${records.amount} else 0 end), 0)::bigint` }).from(records).where(isNull(records.deletedAt));
  const n = <T extends string>(list: { status: T; n: number }[], s: T) => list.find((x) => x.status === s)?.n ?? 0;
  return {
    users: { active: n(byStatus, "active"), pending: n(byStatus, "pending_review"), rejected: n(byStatus, "rejected"), revoked: n(byStatus, "revoked"), total: byStatus.reduce((t, x) => t + x.n, 0) },
    groups: groupCount.n,
    goals: { active: n(goalRows, "active"), paused: n(goalRows, "paused"), completed: n(goalRows, "completed"), total: goalRows.filter((x) => x.status !== "archived").reduce((t, x) => t + x.n, 0) },
    records: { count: recordCount.n, moneyIn: Number(recordCount.sum) },
  };
}
