// How people get into groups and goals.
// Groups (created in the preview): the Owner invites by email (the invitee accepts or declines; an invitation expires after
// INVITE_DAYS and can be resent). The Owner picks people already on eShareGoal (Invite people) or types any email.
// Goals: a group member asks to join a goal ("Join this goal"); an Owner of the group approves or declines. Approved
// joins are kept in a cookie so the server opens the goal for them.
import { nameFromEmail, type CreatedGroup } from "./view-as";
import { INVITE_DAYS } from "./constants";

const DAY = 86_400_000;

export type InviteState = "joined" | "pending" | "expired" | "declined";
/** Where one invited email stands. sent: when the invitation was (re)sent; groups saved before this have none (never expire). */
export function inviteState(g: CreatedGroup, email: string, now = Date.now()): InviteState {
  if (g.joined?.includes(email)) return "joined";
  if (g.declined?.includes(email)) return "declined";
  const sent = g.sent?.[email];
  return sent && now - Date.parse(sent) > INVITE_DAYS * DAY ? "expired" : "pending";
}
/** Whole days left on a pending invitation (0 = expires today), or null when it has no date. */
export const daysLeft = (g: CreatedGroup, email: string, now = Date.now()) => {
  const sent = g.sent?.[email];
  return sent ? Math.max(0, Math.ceil((Date.parse(sent) + INVITE_DAYS * DAY - now) / DAY)) : null;
};

// ---------- Which goals someone is in (groups created in the preview) ----------
// An invitation is for the whole group (every goal, new ones too) or only some goals; the Owner can change it later.
/** The goal ids an invited or joined email is limited to, or null for the whole group. */
export const goalsOf = (g: CreatedGroup, email: string): string[] | null => g.goals?.[email] ?? null;
export const inGoalOf = (g: CreatedGroup, email: string, goalId: string) => { const ids = goalsOf(g, email); return !ids || ids.includes(goalId); };
/** The email of the member with this display name (the creator has none: they are in every goal). */
export const emailOfMember = (g: CreatedGroup, name: string) => g.joined?.find((e) => nameFromEmail(e).toLowerCase() === name.toLowerCase());
/** Who takes part in one goal: the creator, then every joined member whose goals include it. */
export const goalMembers = (g: CreatedGroup, goalId: string, creator: string) =>
  [creator, ...(g.joined ?? []).filter((e) => inGoalOf(g, e, goalId)).map(nameFromEmail).filter((n) => n !== creator)];
/** Sets an email's goals: null (or every goal picked) = the whole group. */
export function withGoals(g: CreatedGroup, email: string, ids: string[] | null): Record<string, string[]> {
  const rest = Object.fromEntries(Object.entries(g.goals ?? {}).filter(([e]) => e !== email));
  return ids ? { ...rest, [email]: ids } : rest;
}

// ---------- Goal join requests (sample goals) ----------
export type GoalJoinRequest = { goal: string; group: string; name: string; at: string };
export type GoalJoins = { requests: GoalJoinRequest[]; approved: { goal: string; name: string }[]; declined: { goal: string; name: string; at: string }[] };
export const NO_JOINS: GoalJoins = { requests: [], approved: [], declined: [] };
const ID = /^[a-z0-9-]{1,80}$/;
const okName = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40;
export function parseGoalJoins(raw?: string): GoalJoins {
  try {
    const v = JSON.parse(decodeURIComponent(raw ?? "{}")) as Partial<GoalJoins>;
    const list = <T,>(x: unknown, ok: (y: T) => boolean) => (Array.isArray(x) ? (x as T[]).filter(ok).slice(0, 40) : []);
    return {
      requests: list<GoalJoinRequest>(v.requests, (r) => ID.test(r?.goal) && ID.test(r.group) && okName(r.name) && typeof r.at === "string"),
      approved: list<{ goal: string; name: string }>(v.approved, (r) => ID.test(r?.goal) && okName(r.name)),
      declined: list<{ goal: string; name: string; at: string }>(v.declined, (r) => ID.test(r?.goal) && okName(r.name) && typeof r.at === "string"),
    };
  } catch { return NO_JOINS; }
}
export const approvedIn = (j: GoalJoins, goal: string, name: string) => j.approved.some((a) => a.goal === goal && a.name === name);
