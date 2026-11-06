import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goalJoinRequests, goalMembers, goals, groupMembers, groups, records, users } from "@/lib/db/schema";
import { assertOwner, canViewGoal, Forbidden, roleInGroup, type GroupRole, type Viewer } from "./dal";
import { audit, day, parse, pesos, sendMail, UserError, uuid } from "./core";

// Goals (sub goals of a group), who takes part, join requests, and records. Owners change everything; Members read the
// goals they are in and can ask to join others; System Admins read everything and change nothing.
const KINDS = ["loan", "savings", "fitness", "tasks", "custom"] as const;

const goalInput = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(60, "Use 60 characters or fewer."),
  kind: z.enum(KINDS),
  measure: z.enum(["money", "count", "checklist"]),
  scope: z.enum(["single", "each"]).default("single"),
  target: z.coerce.number().finite().nonnegative().max(1_000_000_000).nullable().default(null), // pesos for money, a count otherwise
  about: z.string().trim().max(300, "Use 300 characters or fewer.").default(""),
  startsOn: day.nullable().default(null),
  details: z.record(z.string().max(40), z.string().max(200)).default({}).refine((d) => Object.keys(d).length <= 20, "Up to 20 details."),
});
const toTarget = (measure: string, target: number | null) => (target === null ? null : measure === "money" ? Math.round(target * 100) : Math.round(target));

async function goalRow(goalId: string) {
  const [g] = await db.select().from(goals).where(eq(goals.id, parse(uuid, goalId))).limit(1);
  if (!g) throw new UserError("This goal no longer exists.");
  return g;
}

// ---------- Goals ----------
export async function createGoal(viewer: Viewer, groupId: string, input: unknown) {
  await assertOwner(viewer, parse(uuid, groupId));
  const v = parse(goalInput, input);
  const [g] = await db.insert(goals).values({ groupId, name: v.name, kind: v.kind, measure: v.measure, scope: v.scope, target: toTarget(v.measure, v.target), about: v.about, startsOn: v.startsOn, details: v.details, createdBy: viewer.id }).returning({ id: goals.id });
  await audit({ actorId: viewer.id, action: "goal.create", groupId, goalId: g.id, detail: { name: v.name } });
  return g.id;
}
export async function updateGoal(viewer: Viewer, goalId: string, input: unknown) {
  const g = await goalRow(goalId);
  await assertOwner(viewer, g.groupId);
  const v = parse(goalInput.partial(), input);
  await db.update(goals).set({
    ...(v.name !== undefined && { name: v.name }), ...(v.scope !== undefined && { scope: v.scope }), ...(v.about !== undefined && { about: v.about }),
    ...(v.startsOn !== undefined && { startsOn: v.startsOn }), ...(v.details !== undefined && { details: v.details }), ...(v.target !== undefined && { target: toTarget(g.measure, v.target) }),
  }).where(eq(goals.id, g.id));
  await audit({ actorId: viewer.id, action: "goal.update", groupId: g.groupId, goalId: g.id, detail: v });
}
export async function setGoalStatus(viewer: Viewer, goalId: string, status: "active" | "paused" | "completed" | "archived") {
  const g = await goalRow(goalId);
  await assertOwner(viewer, g.groupId);
  await db.update(goals).set({ status: parse(z.enum(["active", "paused", "completed", "archived"]), status) }).where(eq(goals.id, g.id));
  await audit({ actorId: viewer.id, action: "goal.status", groupId: g.groupId, goalId: g.id, detail: { status } });
}
/** Deletes the goal with its records. Archiving (setGoalStatus) keeps them instead. */
export async function deleteGoal(viewer: Viewer, goalId: string) {
  const g = await goalRow(goalId);
  await assertOwner(viewer, g.groupId);
  await audit({ actorId: viewer.id, action: "goal.delete", groupId: g.groupId, detail: { goalId: g.id, name: g.name } });
  await db.delete(goals).where(eq(goals.id, g.id));
}

/** Everyone taking part in a goal: group members in every goal, plus those listed for it; with their share. */
async function participants(goalId: string, groupId: string) {
  const rows = await db.select({ userId: groupMembers.userId, role: groupMembers.role, allGoals: groupMembers.allGoals, name: users.name, email: users.email })
    .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId)).where(eq(groupMembers.groupId, groupId)).orderBy(asc(users.name));
  const links = await db.select({ userId: goalMembers.userId, share: goalMembers.share }).from(goalMembers).where(eq(goalMembers.goalId, goalId));
  return rows.filter((r) => r.allGoals || r.role === "owner" || links.some((l) => l.userId === r.userId))
    .map((r) => ({ userId: r.userId, name: r.name ?? r.email?.split("@")[0] ?? "Member", role: r.role, share: links.find((l) => l.userId === r.userId)?.share ?? null }));
}

export type GoalDetail = {
  id: string; groupId: string; groupName: string; name: string; kind: string; measure: "money" | "count" | "checklist"; scope: "single" | "each"; status: string;
  target: number | null; about: string; startsOn: string | null; details: Record<string, string>; role: GroupRole;
  participants: { userId: string; name: string; role: "owner" | "member"; share: number | null; total: number }[];
  records: { id: string; memberId: string | null; memberName: string | null; day: string; amount: number; direction: "in" | "out" | null; kind: string | null; method: string | null; ref: string | null; note: string; title: string | null; done: boolean | null; source: string }[];
  totals: { in: number; out: number; net: number; progress: number | null }; // progress 0-100 when there is a target
};
/** A goal with its records and totals, for those who take part (and Owners and the System Admin). Null otherwise. */
export async function getGoal(viewer: Viewer, goalId: string): Promise<GoalDetail | null> {
  if (!z.string().uuid().safeParse(goalId).success) return null;
  const access = await canViewGoal(viewer, goalId);
  if (!access) return null;
  const [g] = await db.select({ goal: goals, groupName: groups.name }).from(goals).innerJoin(groups, eq(groups.id, goals.groupId)).where(eq(goals.id, goalId)).limit(1);
  const people = await participants(goalId, g.goal.groupId);
  const rows = await db.select().from(records).where(and(eq(records.goalId, goalId), isNull(records.deletedAt))).orderBy(desc(records.day), desc(records.createdAt)).limit(1000);
  const signed = (r: (typeof rows)[number]) => (g.goal.measure === "money" ? (r.direction === "out" ? -r.amount : r.amount) : g.goal.measure === "checklist" ? (r.done ? 1 : 0) : r.amount);
  const totalOf = (userId: string) => rows.filter((r) => r.memberId === userId).reduce((t, r) => t + signed(r), 0);
  const inSum = rows.filter((r) => r.direction !== "out").reduce((t, r) => t + (g.goal.measure === "checklist" ? (r.done ? 1 : 0) : r.amount), 0);
  const outSum = rows.filter((r) => r.direction === "out").reduce((t, r) => t + r.amount, 0);
  const net = inSum - outSum;
  const target = g.goal.target;
  // "each" goals: everyone has the same target; overall progress is the average of the members' progress.
  const progress = !target ? null : g.goal.scope === "each" && people.length
    ? Math.round(people.reduce((t, p) => t + Math.min(100, (totalOf(p.userId) / target) * 100), 0) / people.length)
    : Math.min(100, Math.round((net / target) * 100));
  const names = new Map(people.map((p) => [p.userId, p.name]));
  return {
    id: g.goal.id, groupId: g.goal.groupId, groupName: g.groupName, name: g.goal.name, kind: g.goal.kind, measure: g.goal.measure, scope: g.goal.scope, status: g.goal.status,
    target, about: g.goal.about, startsOn: g.goal.startsOn, details: g.goal.details, role: access.role,
    participants: people.map((p) => ({ ...p, total: totalOf(p.userId) })),
    records: rows.map((r) => ({ id: r.id, memberId: r.memberId, memberName: r.memberId ? names.get(r.memberId) ?? "Former member" : null, day: r.day, amount: r.amount, direction: r.direction, kind: r.kind, method: r.method, ref: r.ref, note: r.note, title: r.title, done: r.done, source: r.source })),
    totals: { in: inSum, out: outSum, net, progress },
  };
}

/** What a group member who has not joined a goal may see: its purpose, who takes part, and their own join request. */
export async function getGoalPreview(viewer: Viewer, goalId: string) {
  if (!z.string().uuid().safeParse(goalId).success) return null;
  const g = await goalRow(goalId);
  const role = await roleInGroup(viewer, g.groupId);
  if (!role) return null;
  const people = await participants(goalId, g.groupId);
  const [req] = await db.select({ id: goalJoinRequests.id, status: goalJoinRequests.status, createdAt: goalJoinRequests.createdAt, decidedAt: goalJoinRequests.decidedAt })
    .from(goalJoinRequests).where(and(eq(goalJoinRequests.goalId, goalId), eq(goalJoinRequests.userId, viewer.id))).orderBy(desc(goalJoinRequests.createdAt)).limit(1);
  return { id: g.id, groupId: g.groupId, name: g.name, kind: g.kind, about: g.about, status: g.status, startsOn: g.startsOn, joined: people.some((p) => p.userId === viewer.id), people: people.map((p) => p.name), request: req ?? null };
}

/** An Owner sets a member's monthly share (pesos) in a money goal; null clears it. */
export async function setShare(viewer: Viewer, goalId: string, userId: string, share: number | null) {
  const g = await goalRow(goalId);
  await assertOwner(viewer, g.groupId);
  if (!(await participants(g.id, g.groupId)).some((p) => p.userId === userId)) throw new UserError("That person does not take part in this goal.");
  const centavos = share === null ? null : parse(pesos, share);
  await db.insert(goalMembers).values({ goalId: g.id, userId, share: centavos }).onConflictDoUpdate({ target: [goalMembers.goalId, goalMembers.userId], set: { share: centavos } });
  await audit({ actorId: viewer.id, action: "goal.share", groupId: g.groupId, goalId: g.id, detail: { userId, share: centavos } });
}

// ---------- Join requests ----------
export async function requestToJoinGoal(viewer: Viewer, goalId: string) {
  const g = await goalRow(goalId);
  if ((await roleInGroup(viewer, g.groupId)) !== "member") throw new Forbidden("Only members of this group can ask to join its goals.");
  if ((await participants(g.id, g.groupId)).some((p) => p.userId === viewer.id)) throw new UserError("You already take part in this goal.");
  const [open] = await db.select({ id: goalJoinRequests.id }).from(goalJoinRequests).where(and(eq(goalJoinRequests.goalId, g.id), eq(goalJoinRequests.userId, viewer.id), eq(goalJoinRequests.status, "pending"))).limit(1);
  if (open) throw new UserError("You already asked. The Owner has not answered yet.");
  await db.insert(goalJoinRequests).values({ goalId: g.id, userId: viewer.id });
  await audit({ actorId: viewer.id, action: "goal.join_request", groupId: g.groupId, goalId: g.id });
}
export async function cancelJoinRequest(viewer: Viewer, requestId: string) {
  const res = await db.update(goalJoinRequests).set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(goalJoinRequests.id, parse(uuid, requestId)), eq(goalJoinRequests.userId, viewer.id), eq(goalJoinRequests.status, "pending"))).returning({ id: goalJoinRequests.id });
  if (!res.length) throw new UserError("This request is no longer open.");
}
/** Open requests to join the goals of a group, for its Owners. */
export async function listJoinRequests(viewer: Viewer, groupId: string) {
  await assertOwner(viewer, parse(uuid, groupId));
  return db.select({ id: goalJoinRequests.id, goalId: goals.id, goalName: goals.name, measure: goals.measure, userId: users.id, name: users.name, at: goalJoinRequests.createdAt })
    .from(goalJoinRequests).innerJoin(goals, eq(goals.id, goalJoinRequests.goalId)).innerJoin(users, eq(users.id, goalJoinRequests.userId))
    .where(and(eq(goals.groupId, groupId), eq(goalJoinRequests.status, "pending"))).orderBy(asc(goalJoinRequests.createdAt));
}
/** Approve (adds them to the goal, with a share for money goals if given) or decline. */
export async function decideJoinRequest(viewer: Viewer, requestId: string, approve: boolean, share: number | null = null) {
  const [r] = await db.select({ req: goalJoinRequests, goal: goals, email: users.email }).from(goalJoinRequests).innerJoin(goals, eq(goals.id, goalJoinRequests.goalId)).innerJoin(users, eq(users.id, goalJoinRequests.userId))
    .where(and(eq(goalJoinRequests.id, parse(uuid, requestId)), eq(goalJoinRequests.status, "pending"))).limit(1);
  if (!r) throw new UserError("This request is no longer open.");
  await assertOwner(viewer, r.goal.groupId);
  const centavos = share === null ? null : parse(pesos, share);
  await db.transaction(async (tx) => {
    await tx.update(goalJoinRequests).set({ status: approve ? "approved" : "declined", decidedBy: viewer.id, decidedAt: new Date() }).where(eq(goalJoinRequests.id, r.req.id));
    if (approve) await tx.insert(goalMembers).values({ goalId: r.goal.id, userId: r.req.userId, share: centavos }).onConflictDoUpdate({ target: [goalMembers.goalId, goalMembers.userId], set: { share: centavos } });
    await audit({ actorId: viewer.id, action: approve ? "goal.join_approve" : "goal.join_decline", groupId: r.goal.groupId, goalId: r.goal.id, detail: { userId: r.req.userId } }, tx);
  });
  if (r.email) await sendMail(r.email, approve ? `You joined ${r.goal.name}` : `Your request to join ${r.goal.name} was declined`, approve ? "Open eShareGoal to see it." : "Ask the Owner if you think this is a mistake.");
}

// ---------- Records ----------
const recordInput = z.object({
  memberId: z.string().min(1).max(80).nullable().default(null),
  day,
  amount: z.coerce.number().finite().nonnegative().max(1_000_000_000).default(0), // pesos for money, the value for count goals
  direction: z.enum(["in", "out"]).nullable().default(null),
  kind: z.string().trim().max(40).nullable().default(null),
  method: z.string().trim().max(40).nullable().default(null),
  ref: z.string().trim().max(80).nullable().default(null),
  note: z.string().trim().max(300).default(""),
  title: z.string().trim().max(120).nullable().default(null),
  done: z.boolean().nullable().default(null),
});
type RecordInput = z.infer<typeof recordInput>;
async function checkRecord(g: typeof goals.$inferSelect, v: RecordInput, exceptId?: string) {
  if (v.memberId && !(await participants(g.id, g.groupId)).some((p) => p.userId === v.memberId)) throw new UserError("That person does not take part in this goal.");
  if (g.measure === "money") {
    if (!v.direction) throw new UserError("Choose money in or money out.");
    if (v.amount <= 0) throw new UserError("Enter an amount above 0.");
    if (v.ref) {
      const dup = await db.select({ id: records.id }).from(records).where(and(eq(records.goalId, g.id), eq(records.ref, v.ref), isNull(records.deletedAt))).limit(2);
      if (dup.some((d) => d.id !== exceptId)) throw new UserError(`A record with reference ${v.ref} is already in this goal.`);
    }
  }
  if (g.measure === "checklist" && !v.title) throw new UserError("Give the task a title.");
  return { ...v, amount: g.measure === "money" ? Math.round(v.amount * 100) : g.measure === "checklist" ? 0 : Math.round(v.amount), direction: g.measure === "money" ? v.direction : null };
}
export async function addRecord(viewer: Viewer, goalId: string, input: unknown, source: "manual" | "import" | "submission" = "manual") {
  const g = await goalRow(goalId);
  await assertOwner(viewer, g.groupId);
  const v = await checkRecord(g, parse(recordInput, input));
  const [r] = await db.insert(records).values({ goalId: g.id, ...v, source, createdBy: viewer.id }).returning({ id: records.id });
  await audit({ actorId: viewer.id, action: "record.create", groupId: g.groupId, goalId: g.id, detail: { recordId: r.id, amount: v.amount, memberId: v.memberId } });
  return r.id;
}
async function recordRow(recordId: string) {
  const [r] = await db.select({ rec: records, goal: goals }).from(records).innerJoin(goals, eq(goals.id, records.goalId)).where(and(eq(records.id, parse(uuid, recordId)), isNull(records.deletedAt))).limit(1);
  if (!r) throw new UserError("This record no longer exists.");
  return r;
}
/** Edits keep the old values in the audit log, so nothing is silently overwritten. */
export async function updateRecord(viewer: Viewer, recordId: string, input: unknown) {
  const { rec, goal } = await recordRow(recordId);
  await assertOwner(viewer, goal.groupId);
  const v = await checkRecord(goal, parse(recordInput, { ...rec, ...(input as object) }), rec.id);
  await db.update(records).set({ ...v, updatedAt: new Date() }).where(eq(records.id, rec.id));
  await audit({ actorId: viewer.id, action: "record.update", groupId: goal.groupId, goalId: goal.id, detail: { recordId: rec.id, before: { amount: rec.amount, day: rec.day, memberId: rec.memberId, ref: rec.ref }, after: { amount: v.amount, day: v.day, memberId: v.memberId, ref: v.ref } } });
}
/** Soft delete: hidden from totals, kept for the history. */
export async function deleteRecord(viewer: Viewer, recordId: string) {
  const { rec, goal } = await recordRow(recordId);
  await assertOwner(viewer, goal.groupId);
  await db.update(records).set({ deletedAt: new Date() }).where(eq(records.id, rec.id));
  await audit({ actorId: viewer.id, action: "record.delete", groupId: goal.groupId, goalId: goal.id, detail: { recordId: rec.id, amount: rec.amount, memberId: rec.memberId } });
}

/** Goals across the viewer's groups (System Admin: all), with whether they take part, for lists and the dashboard. */
export async function listMyGoals(viewer: Viewer) {
  const rows = await db.select({ id: goals.id, name: goals.name, kind: goals.kind, measure: goals.measure, status: goals.status, groupId: goals.groupId, groupName: groups.name })
    .from(goals).innerJoin(groups, eq(groups.id, goals.groupId)).where(isNull(groups.archivedAt)).orderBy(asc(groups.name), asc(goals.createdAt));
  if (viewer.siteRole === "admin") return rows.map((r) => ({ ...r, joined: true }));
  const mine = await db.select({ groupId: groupMembers.groupId, all: groupMembers.allGoals, role: groupMembers.role }).from(groupMembers).where(eq(groupMembers.userId, viewer.id));
  const ids = rows.filter((r) => mine.some((m) => m.groupId === r.groupId)).map((r) => r.id);
  const links = ids.length ? await db.select({ goalId: goalMembers.goalId }).from(goalMembers).where(and(eq(goalMembers.userId, viewer.id), inArray(goalMembers.goalId, ids))) : [];
  return rows.flatMap((r) => {
    const m = mine.find((x) => x.groupId === r.groupId);
    return m ? [{ ...r, joined: m.all || m.role === "owner" || links.some((l) => l.goalId === r.id) }] : [];
  });
}
