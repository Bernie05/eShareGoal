import "server-only";
import { and, asc, count, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goalMembers, goals, groupInvites, groupMembers, groups, users } from "@/lib/db/schema";
import { assertOwner, Forbidden, roleInGroup, type GroupRole, type Viewer } from "./dal";
import { appUrl, audit, email, parse, sendMail, UserError, uuid } from "./core";
import { INVITE_DAYS, MAX_MEMBERS } from "@/lib/constants";

// Groups, who is in them, and invitations. Every function takes the signed-in viewer and checks what they may do.
// Rules: the creator is always an Owner and cannot leave or be removed; only the creator changes roles; Owners invite,
// remove Members and choose which goals a member is in; System Admins view every group but change nothing here.
const DAY = 86_400_000;
const expired = (sentAt: Date, now = Date.now()) => now - sentAt.getTime() > INVITE_DAYS * DAY;
const maskEmail = (e: string) => { const [n, d] = e.split("@"); return `${n.slice(0, 2)}•••@${d}`; };

const groupInput = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(40, "Use 40 characters or fewer."),
  description: z.string().trim().max(120, "Use 120 characters or fewer.").default(""),
});

async function creatorOf(groupId: string) {
  const [g] = await db.select({ createdBy: groups.createdBy, name: groups.name, archivedAt: groups.archivedAt }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!g) throw new UserError("This group no longer exists.");
  return g;
}

// ---------- Reading ----------
export type GroupSummary = { id: string; name: string; description: string; role: GroupRole; members: number; goals: number };
/** The groups the viewer is in (System Admin: every active group), newest first. */
export async function listMyGroups(viewer: Viewer): Promise<GroupSummary[]> {
  const rows = viewer.siteRole === "admin"
    ? (await db.select({ id: groups.id, name: groups.name, description: groups.description }).from(groups).where(isNull(groups.archivedAt)).orderBy(asc(groups.name))).map((g) => ({ ...g, role: "admin" as const }))
    : await db.select({ id: groups.id, name: groups.name, description: groups.description, role: groupMembers.role }).from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(and(eq(groupMembers.userId, viewer.id), isNull(groups.archivedAt))).orderBy(asc(groups.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const memberCounts = await db.select({ groupId: groupMembers.groupId, n: count() }).from(groupMembers).where(inArray(groupMembers.groupId, ids)).groupBy(groupMembers.groupId);
  const goalCounts = await db.select({ groupId: goals.groupId, n: count() }).from(goals).where(and(inArray(goals.groupId, ids), ne(goals.status, "archived"))).groupBy(goals.groupId);
  const n = (list: { groupId: string; n: number }[], id: string) => list.find((x) => x.groupId === id)?.n ?? 0;
  return rows.map((r) => ({ ...r, members: n(memberCounts, r.id), goals: n(goalCounts, r.id) }));
}

export type GroupDetail = {
  id: string; name: string; description: string; createdBy: string; role: GroupRole; isCreator: boolean;
  members: { userId: string; name: string; email: string | null; role: "owner" | "member"; allGoals: boolean; goalIds: string[]; you: boolean }[];
  invites: { id: string; email: string; goalIds: string[] | null; status: "pending" | "declined"; expired: boolean; sentAt: string }[]; // Owners and System Admin only
  goals: { id: string; name: string; kind: string; measure: string; status: string; mine: boolean }[]; // mine: the viewer takes part
};
/** One group as the viewer may see it, or null when they are not in it. Members do not see others' emails or invitations. */
export async function getGroup(viewer: Viewer, groupId: string): Promise<GroupDetail | null> {
  if (!z.string().uuid().safeParse(groupId).success) return null;
  const role = await roleInGroup(viewer, groupId);
  if (!role) return null;
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!g) return null;
  const seesPrivate = role !== "member";
  const memberRows = await db.select({ userId: groupMembers.userId, role: groupMembers.role, allGoals: groupMembers.allGoals, name: users.name, email: users.email })
    .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId)).where(eq(groupMembers.groupId, groupId)).orderBy(asc(users.name));
  const goalRows = await db.select({ id: goals.id, name: goals.name, kind: goals.kind, measure: goals.measure, status: goals.status }).from(goals).where(eq(goals.groupId, groupId)).orderBy(asc(goals.createdAt));
  const links = goalRows.length ? await db.select({ goalId: goalMembers.goalId, userId: goalMembers.userId }).from(goalMembers).where(inArray(goalMembers.goalId, goalRows.map((x) => x.id))) : [];
  const members = memberRows.map((m) => ({
    userId: m.userId, name: m.name ?? m.email?.split("@")[0] ?? "Member", email: seesPrivate || m.userId === viewer.id ? m.email : null, role: m.role, allGoals: m.allGoals,
    goalIds: m.allGoals ? goalRows.map((x) => x.id) : links.filter((l) => l.userId === m.userId).map((l) => l.goalId), you: m.userId === viewer.id,
  }));
  const me = members.find((m) => m.you);
  const invites = seesPrivate
    ? (await db.select().from(groupInvites).where(and(eq(groupInvites.groupId, groupId), inArray(groupInvites.status, ["pending", "declined"]))).orderBy(asc(groupInvites.sentAt)))
      .map((i) => ({ id: i.id, email: i.email, goalIds: i.goalIds, status: i.status as "pending" | "declined", expired: i.status === "pending" && expired(i.sentAt), sentAt: i.sentAt.toISOString() }))
    : [];
  return {
    id: g.id, name: g.name, description: g.description, createdBy: g.createdBy, role, isCreator: g.createdBy === viewer.id, members, invites,
    goals: goalRows.filter((x) => role !== "member" || me?.goalIds.includes(x.id)).map((x) => ({ ...x, mine: role === "owner" || !!me?.goalIds.includes(x.id) })),
  };
}

// ---------- Groups ----------
/** Users (not the System Admin) create groups; the creator becomes its Owner. */
export async function createGroup(viewer: Viewer, input: unknown) {
  if (viewer.siteRole === "admin") throw new Forbidden("System Admins do not create groups.");
  const { name, description } = parse(groupInput, input);
  const mine = await db.select({ name: groups.name }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(and(eq(groupMembers.userId, viewer.id), isNull(groups.archivedAt)));
  if (mine.some((g) => g.name.toLowerCase() === name.toLowerCase())) throw new UserError("You already have a group with this name.");
  return db.transaction(async (tx) => {
    const [g] = await tx.insert(groups).values({ name, description, createdBy: viewer.id }).returning({ id: groups.id });
    await tx.insert(groupMembers).values({ groupId: g.id, userId: viewer.id, role: "owner" });
    await audit({ actorId: viewer.id, action: "group.create", groupId: g.id, detail: { name } }, tx);
    return g.id;
  });
}
export async function updateGroup(viewer: Viewer, groupId: string, input: unknown) {
  await assertOwner(viewer, parse(uuid, groupId));
  const { name, description } = parse(groupInput, input);
  await db.update(groups).set({ name, description }).where(eq(groups.id, groupId));
  await audit({ actorId: viewer.id, action: "group.update", groupId, detail: { name } });
}
/** Archive (Owners): hidden from lists, kept with its history. Delete (creator only): removes the group and everything in it. */
export async function archiveGroup(viewer: Viewer, groupId: string) {
  await assertOwner(viewer, parse(uuid, groupId));
  await db.update(groups).set({ archivedAt: new Date() }).where(eq(groups.id, groupId));
  await audit({ actorId: viewer.id, action: "group.archive", groupId });
}
export async function deleteGroup(viewer: Viewer, groupId: string) {
  const g = await creatorOf(parse(uuid, groupId));
  if (g.createdBy !== viewer.id) throw new Forbidden("Only the person who created this group can delete it.");
  await audit({ actorId: viewer.id, action: "group.delete", detail: { groupId, name: g.name } });
  await db.delete(groups).where(eq(groups.id, groupId));
}

// ---------- Invitations ----------
const inviteInput = z.object({
  groupId: uuid,
  userIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  emails: z.array(email).max(20, "Invite up to 20 people at a time.").default([]),
  goalIds: z.array(uuid).max(50).nullable().default(null), // null = the whole group
});
/** Owners invite people already on eShareGoal (userIds) or any email, to the whole group or only some goals. */
export async function inviteToGroup(viewer: Viewer, input: unknown) {
  const { groupId, userIds, emails, goalIds } = parse(inviteInput, input);
  await assertOwner(viewer, groupId);
  const g = await creatorOf(groupId);
  if (goalIds) {
    if (!goalIds.length) throw new UserError("Tick at least one goal, or invite them to the whole group.");
    const found = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.groupId, groupId), inArray(goals.id, goalIds)));
    if (found.length !== new Set(goalIds).size) throw new UserError("One of those goals is not in this group.");
  }
  const picked = userIds.length ? await db.select({ email: users.email }).from(users).where(and(inArray(users.id, userIds), eq(users.status, "active"), eq(users.siteRole, "user"))) : [];
  const targets = [...new Set([...emails, ...picked.map((p) => p.email!.toLowerCase())])];
  if (!targets.length) throw new UserError("Pick someone to invite.");
  const members = await db.select({ email: users.email }).from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId)).where(eq(groupMembers.groupId, groupId));
  const memberEmails = new Set(members.map((m) => m.email?.toLowerCase()));
  const open = await db.select({ id: groupInvites.id, email: groupInvites.email }).from(groupInvites).where(and(eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending")));
  const fresh = targets.filter((e) => !memberEmails.has(e) && !open.some((o) => o.email === e));
  if (members.length + open.length + fresh.length > MAX_MEMBERS) throw new UserError(`A group can have up to ${MAX_MEMBERS} people, invitations included.`);
  const invited: string[] = [], skipped: { email: string; why: string }[] = [];
  await db.transaction(async (tx) => {
    for (const e of targets) {
      if (memberEmails.has(e)) { skipped.push({ email: e, why: "already a member" }); continue; }
      const existing = open.find((o) => o.email === e);
      if (existing) await tx.update(groupInvites).set({ sentAt: new Date(), goalIds, invitedBy: viewer.id }).where(eq(groupInvites.id, existing.id));
      else await tx.insert(groupInvites).values({ groupId, email: e, goalIds, invitedBy: viewer.id });
      invited.push(e);
    }
    await audit({ actorId: viewer.id, action: "invite.send", groupId, detail: { emails: invited, goalIds } }, tx);
  });
  for (const e of invited) await sendMail(e, `You are invited to ${g.name} on eShareGoal`, `${viewer.name} invited you to ${g.name}. Sign in to accept within ${INVITE_DAYS} days: ${appUrl()}/`);
  return { invited, skipped };
}
async function inviteForOwner(viewer: Viewer, inviteId: string) {
  const [i] = await db.select().from(groupInvites).where(eq(groupInvites.id, parse(uuid, inviteId))).limit(1);
  if (!i) throw new UserError("This invitation no longer exists.");
  await assertOwner(viewer, i.groupId);
  return i;
}
/** Sends it again: 7 more days. Someone who declined gets a new chance. */
export async function resendInvite(viewer: Viewer, inviteId: string) {
  const i = await inviteForOwner(viewer, inviteId);
  if (i.status !== "pending" && i.status !== "declined") throw new UserError("This invitation is already closed.");
  await db.update(groupInvites).set({ status: "pending", sentAt: new Date(), respondedAt: null }).where(eq(groupInvites.id, i.id));
  const g = await creatorOf(i.groupId);
  await sendMail(i.email, `Reminder: you are invited to ${g.name}`, `Sign in to accept within ${INVITE_DAYS} days: ${appUrl()}/`);
  await audit({ actorId: viewer.id, action: "invite.resend", groupId: i.groupId, detail: { email: i.email } });
}
export async function cancelInvite(viewer: Viewer, inviteId: string) {
  const i = await inviteForOwner(viewer, inviteId);
  await db.update(groupInvites).set({ status: "cancelled", respondedAt: new Date() }).where(eq(groupInvites.id, i.id));
  await audit({ actorId: viewer.id, action: "invite.cancel", groupId: i.groupId, detail: { email: i.email } });
}

export type MyInvitation = { id: string; groupId: string; groupName: string; from: string; goalNames: string[] | null; expired: boolean; daysLeft: number };
/** Open invitations for the signed-in person's email. */
export async function myInvitations(viewer: Viewer): Promise<MyInvitation[]> {
  const rows = await db.select({ id: groupInvites.id, groupId: groupInvites.groupId, goalIds: groupInvites.goalIds, sentAt: groupInvites.sentAt, groupName: groups.name, from: users.name })
    .from(groupInvites).innerJoin(groups, eq(groups.id, groupInvites.groupId)).innerJoin(users, eq(users.id, groupInvites.invitedBy))
    .where(and(eq(groupInvites.email, viewer.email), eq(groupInvites.status, "pending"), isNull(groups.archivedAt)));
  const ids = rows.flatMap((r) => r.goalIds ?? []);
  const names = ids.length ? await db.select({ id: goals.id, name: goals.name }).from(goals).where(inArray(goals.id, ids)) : [];
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, groupId: r.groupId, groupName: r.groupName, from: r.from ?? "An Owner", expired: expired(r.sentAt, now),
    goalNames: r.goalIds ? r.goalIds.map((id) => names.find((n) => n.id === id)?.name).filter((n): n is string => !!n) : null,
    daysLeft: Math.max(0, Math.ceil((r.sentAt.getTime() + INVITE_DAYS * DAY - now) / DAY)),
  }));
}
/** The invited person accepts (joins as a Member: the whole group, or only the invited goals) or declines. */
export async function respondToInvite(viewer: Viewer, inviteId: string, accept: boolean) {
  if (viewer.siteRole === "admin") throw new Forbidden("System Admins are not group members.");
  const [i] = await db.select().from(groupInvites).where(and(eq(groupInvites.id, parse(uuid, inviteId)), eq(groupInvites.email, viewer.email), eq(groupInvites.status, "pending"))).limit(1);
  if (!i) throw new UserError("This invitation is no longer open.");
  if (!accept) {
    await db.update(groupInvites).set({ status: "declined", respondedAt: new Date() }).where(eq(groupInvites.id, i.id));
    await audit({ actorId: viewer.id, action: "invite.decline", groupId: i.groupId });
    return;
  }
  if (expired(i.sentAt)) throw new UserError("This invitation expired. Ask the Owner to send it again.");
  await db.transaction(async (tx) => {
    const kept = i.goalIds?.length ? await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.groupId, i.groupId), inArray(goals.id, i.goalIds))) : [];
    await tx.insert(groupMembers).values({ groupId: i.groupId, userId: viewer.id, role: "member", allGoals: !i.goalIds }).onConflictDoNothing();
    if (kept.length) await tx.insert(goalMembers).values(kept.map((g) => ({ goalId: g.id, userId: viewer.id }))).onConflictDoNothing();
    await tx.update(groupInvites).set({ status: "accepted", respondedAt: new Date() }).where(eq(groupInvites.id, i.id));
    await audit({ actorId: viewer.id, action: "invite.accept", groupId: i.groupId, detail: { goalIds: i.goalIds } }, tx);
  });
}

// ---------- Members ----------
async function memberOf(groupId: string, userId: string) {
  const [m] = await db.select({ role: groupMembers.role }).from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1);
  if (!m) throw new UserError("That person is not in this group.");
  return m;
}
async function dropMember(groupId: string, userId: string, actorId: string, action: string) {
  await db.transaction(async (tx) => {
    const ids = (await tx.select({ id: goals.id }).from(goals).where(eq(goals.groupId, groupId))).map((g) => g.id);
    if (ids.length) await tx.delete(goalMembers).where(and(eq(goalMembers.userId, userId), inArray(goalMembers.goalId, ids)));
    await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    await audit({ actorId, action, groupId, detail: { userId } }, tx); // their records stay in each goal's history
  });
}
export async function leaveGroup(viewer: Viewer, groupId: string) {
  const g = await creatorOf(parse(uuid, groupId));
  await memberOf(groupId, viewer.id);
  if (g.createdBy === viewer.id) throw new UserError("You created this group, so you cannot leave it. Delete or archive it instead.");
  await dropMember(groupId, viewer.id, viewer.id, "member.leave");
}
/** Owners remove Members; only the creator removes other Owners; nobody removes the creator. */
export async function removeMember(viewer: Viewer, groupId: string, userId: string) {
  await assertOwner(viewer, parse(uuid, groupId));
  const g = await creatorOf(groupId);
  const m = await memberOf(groupId, userId);
  if (userId === g.createdBy) throw new UserError("The person who created the group cannot be removed.");
  if (userId === viewer.id) throw new UserError("Use Leave group instead.");
  if (m.role === "owner" && g.createdBy !== viewer.id) throw new Forbidden("Only the creator of the group can remove another Owner.");
  await dropMember(groupId, userId, viewer.id, "member.remove");
}
/** Only the creator makes a Member an Owner or back. */
export async function setMemberRole(viewer: Viewer, groupId: string, userId: string, role: "owner" | "member") {
  const g = await creatorOf(parse(uuid, groupId));
  if (g.createdBy !== viewer.id) throw new Forbidden("Only the creator of the group can change roles.");
  if (userId === g.createdBy) throw new UserError("The creator is always an Owner.");
  await memberOf(groupId, userId);
  await db.update(groupMembers).set({ role: parse(z.enum(["owner", "member"]), role) }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  await audit({ actorId: viewer.id, action: "member.role", groupId, detail: { userId, role } });
}
/** Which goals a member is in: null = every goal (and new ones), or only the listed ones. Shares on kept goals stay. */
export async function setMemberGoals(viewer: Viewer, groupId: string, userId: string, goalIds: string[] | null) {
  await assertOwner(viewer, parse(uuid, groupId));
  await memberOf(groupId, userId);
  const ids = parse(z.array(uuid).max(50).nullable(), goalIds);
  if (ids && !ids.length) throw new UserError("Tick at least one goal, or choose the whole group.");
  await db.transaction(async (tx) => {
    const all = (await tx.select({ id: goals.id }).from(goals).where(eq(goals.groupId, groupId))).map((g) => g.id);
    if (ids?.some((id) => !all.includes(id))) throw new UserError("One of those goals is not in this group.");
    await tx.update(groupMembers).set({ allGoals: !ids }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    if (ids) {
      const drop = all.filter((id) => !ids.includes(id));
      if (drop.length) await tx.delete(goalMembers).where(and(eq(goalMembers.userId, userId), inArray(goalMembers.goalId, drop)));
      await tx.insert(goalMembers).values(ids.map((goalId) => ({ goalId, userId }))).onConflictDoNothing();
    }
    await audit({ actorId: viewer.id, action: "member.goals", groupId, detail: { userId, goalIds: ids } }, tx);
  });
}

// ---------- Finding people to invite ----------
/** People on eShareGoal an Owner can invite: searched (2+ characters), never listed in full; emails partly hidden. */
export async function searchPeople(viewer: Viewer, groupId: string, q: string) {
  await assertOwner(viewer, parse(uuid, groupId));
  const term = parse(z.string().trim().min(2, "Type at least 2 characters.").max(60), q).replace(/[%_\\]/g, "");
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
    .where(and(eq(users.status, "active"), eq(users.siteRole, "user"), or(ilike(users.name, `%${term}%`), ilike(users.email, `${term}%`)))).orderBy(asc(users.name)).limit(10);
  const inGroup = new Set((await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId))).map((m) => m.userId));
  const invited = new Set((await db.select({ email: groupInvites.email }).from(groupInvites).where(and(eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending")))).map((i) => i.email));
  return rows.map((r) => ({ id: r.id, name: r.name ?? "Unnamed", email: maskEmail(r.email ?? "?@?"), state: inGroup.has(r.id) ? "member" as const : invited.has(r.email?.toLowerCase() ?? "") ? "invited" as const : null }));
}
