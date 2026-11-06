import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { devUserId } from "./dev";
import { db, ensureDb } from "@/lib/db";
import { goalMembers, goals, groupMembers, users } from "@/lib/db/schema";
import { SEED_GOALS } from "@/lib/db/seed";
import { AUTH_PROVIDER, CAR_CREDIT_ENTRY, PENDING_PATH, SIGN_IN_PATH } from "@/lib/constants";

// Data access layer: the only place that decides who may read or change what. Pages, Server Actions and Route Handlers
// call these before touching data; Server Actions must check again (a page check does not cover the actions on it).
// Roles: System Admin (site role) views every group and goal but changes no group data. In a group: Owner or Member.

export type Viewer = { id: string; name: string; email: string; siteRole: "admin" | "user"; status: "pending_review" | "active" | "rejected" | "revoked" };
export class Forbidden extends Error { constructor(msg = "You do not have access to this.") { super(msg); this.name = "Forbidden"; } }

/** A session opened with a password ends when that password is gone: the inbox's real holder took the account over (lib/server/accounts.ts). */
export const passwordSessionEnded = (method: string | undefined, passwordHash: string | null) => method === AUTH_PROVIDER.password && !passwordHash;

/** The signed-in user as the database has them now (status and site role are never taken from the session), or null.
 *  Also opens the database for the request. Memoized for one render. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  await connection(); // who is looking is only known per request: never prerender at build time
  await ensureDb();
  // Development bypass (lib/server/dev.ts): the View as choice wins over any real session. Off in production.
  const devId = await devUserId();
  const session = devId ? null : await auth();
  const id = devId ?? session?.user?.id;
  if (!id) return null;
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, siteRole: users.siteRole, status: users.status, passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)).limit(1);
  if (!u?.email || passwordSessionEnded(session?.method, u.passwordHash)) return null;
  return { id: u.id, name: u.name ?? u.email.split("@")[0], email: u.email.toLowerCase(), siteRole: u.siteRole, status: u.status };
});

/** Pages: sends people who are not signed in to sign-in, and accounts still under review to the review screen. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(SIGN_IN_PATH);
  if (v.status !== "active") redirect(PENDING_PATH);
  return v;
}
/** Server Actions: same check, but throws (an action cannot redirect mid-way safely). */
export async function viewerForAction(): Promise<Viewer> {
  const v = await getViewer();
  if (!v || v.status !== "active") throw new Forbidden("Sign in with an approved account first.");
  return v;
}
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (v.siteRole !== "admin") redirect("/");
  return v;
}

export type GroupRole = "admin" | "owner" | "member";
/** The viewer's role in one group: "admin" for System Admins (view only), "owner"/"member", or null when not in it. */
export const roleInGroup = cache(async (viewer: Viewer, groupId: string): Promise<GroupRole | null> => {
  if (viewer.siteRole === "admin") return "admin";
  const [m] = await db.select({ role: groupMembers.role }).from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id))).limit(1);
  return m?.role ?? null;
});

/** Reading a group: any member, or the System Admin. */
export async function canViewGroup(viewer: Viewer, groupId: string) { return (await roleInGroup(viewer, groupId)) !== null; }
/** Changing a group, its goals, members or records: its Owners only (never the System Admin). */
export async function assertOwner(viewer: Viewer, groupId: string) {
  if ((await roleInGroup(viewer, groupId)) !== "owner") throw new Forbidden("Only an Owner of this group can do that.");
}

/** Whether the viewer takes part in a goal: Owners and the System Admin always; Members when in every goal or listed. */
export const canViewGoal = cache(async (viewer: Viewer, goalId: string): Promise<{ groupId: string; role: GroupRole } | null> => {
  const [g] = await db.select({ groupId: goals.groupId }).from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!g) return null;
  const role = await roleInGroup(viewer, g.groupId);
  if (!role) return null;
  if (role !== "member") return { groupId: g.groupId, role };
  const [m] = await db.select({ all: groupMembers.allGoals }).from(groupMembers).where(and(eq(groupMembers.groupId, g.groupId), eq(groupMembers.userId, viewer.id))).limit(1);
  if (m?.all) return { groupId: g.groupId, role };
  const [gm] = await db.select({ userId: goalMembers.userId }).from(goalMembers).where(and(eq(goalMembers.goalId, goalId), eq(goalMembers.userId, viewer.id))).limit(1);
  return gm ? { groupId: g.groupId, role } : null;
});

/** The goals with real records. Other goals are preview-only: their jobs stay in the browser and never run on the timer. */
export const TIMER_GOALS: Record<string, string> = { [CAR_CREDIT_ENTRY]: SEED_GOALS.carCredit };

export interface TimerGoalAccess { goalId: string; groupId: string; name: string; role: GroupRole | null }
/** A goal that runs on the timer, with this viewer's role in it (canViewGoal: a Member outside the goal has none). null: no such goal. */
export async function timerGoalAccess(viewer: Viewer, entry: string): Promise<TimerGoalAccess | null> {
  const goalId = TIMER_GOALS[entry];
  if (!goalId) return null;
  const [goal] = await db.select({ groupId: goals.groupId, name: goals.name }).from(goals).where(eq(goals.id, goalId)).limit(1);
  return goal ? { goalId, ...goal, role: (await canViewGoal(viewer, goalId))?.role ?? null } : null;
}
