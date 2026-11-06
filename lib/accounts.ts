import { groups, type Group, type GroupRole } from "./demo-data";
import { nameFromEmail, type CreatedGroup, type ViewAs } from "./view-as";
import { approvedIn, NO_JOINS, type GoalJoins } from "./memberships";
import { ADMIN_EMAIL, BABYLYN_EMAIL } from "./constants";

// Preview accounts for the "View as" switch. There are only two kinds of account: System Admin and User.
// Owner and Member are roles in a group, not account types: a user is Owner of the groups they own and a Member elsewhere.
// guest: a signed-in person outside the sample groups. Their name comes from their real account.
export type Account = "admin" | "user1" | "user2" | "guest";
export const ACCOUNTS: Record<Account, { label: string; name: string; email: string; initials: string }> = {
  admin: { label: "Admin", name: "System Admin", email: ADMIN_EMAIL, initials: "SA" },
  user1: { label: "User 1 · Bernz", name: "Bernz", email: "bernz@example.com", initials: "BS" },
  user2: { label: "User 2 · Babylyn", name: "Babylyn", email: BABYLYN_EMAIL, initials: "BY" },
  guest: { label: "New user", name: "", email: "", initials: "" },
};
/** Who the View as switch offers. */
export const VIEW_AS_ACCOUNTS: Account[] = ["admin", "user1", "user2"];
// Default is System Admin: the admin side is designed first.
export const parseAccount = (v?: string): Account => (v === "user1" || v === "user2" ? v : "admin");

// Sample groups: who owns them and who is in them (owner first).
export const SAMPLE_ROSTER: Record<string, { owner: string; members: string[] }> = {
  family: { owner: "Bernz", members: ["Bernz", "Babylyn", "Billy"] },
};

// Created groups: the creator is always Owner; people they invite join as Members and can be made Owner.
export const creatorOf = (g: CreatedGroup) => g.by ?? "Bernz"; // groups made before `by` existed were made by Bernz
const isPerson = (email: string, name: string) => nameFromEmail(email).toLowerCase() === name.toLowerCase();
export const createdMembers = (g: CreatedGroup) => [creatorOf(g), ...(g.joined ?? []).map(nameFromEmail).filter((n) => n !== creatorOf(g))];

/** Everyone in a group, owner first. The System Admin is never in this list. */
export const membersOf = (groupId: string, created: CreatedGroup[]) => {
  const g = created.find((x) => x.id === groupId);
  return SAMPLE_ROSTER[groupId]?.members ?? (g ? createdMembers(g) : []);
};

/** A group's Owners by name: the sample group's Owner, or a created group's creator then anyone they made Owner. */
export const ownersOf = (groupId: string, created: CreatedGroup[]) => {
  const s = SAMPLE_ROSTER[groupId];
  if (s) return [s.owner];
  const g = created.find((x) => x.id === groupId);
  return g ? [creatorOf(g), ...(g.owners ?? []).filter((e) => (g.joined ?? []).includes(e)).map(nameFromEmail).filter((n) => n !== creatorOf(g))] : [];
};

/** One person's role in one group: "admin" (viewer everywhere), "owner", "member", or null when they are not in it. */
export function roleOf(name: string, groupId: string, created: CreatedGroup[]): ViewAs | null {
  const s = SAMPLE_ROSTER[groupId];
  if (s) return s.owner === name ? "owner" : s.members.includes(name) ? "member" : null;
  const g = created.find((x) => x.id === groupId);
  if (!g) return null;
  if (creatorOf(g) === name) return "owner";
  if (!(g.joined ?? []).some((e) => isPerson(e, name))) return null;
  return (g.owners ?? []).some((e) => isPerson(e, name)) ? "owner" : "member";
}
export const roleIn = (account: Account, groupId: string, created: CreatedGroup[]): ViewAs | null =>
  account === "admin" ? "admin" : roleOf(ACCOUNTS[account].name, groupId, created);

/** Site-wide view for navigation: admin; owner when the user owns at least one group (Notifications, Integrations, Jobs); else member. */
export function navRole(account: Account, created: CreatedGroup[]): ViewAs {
  if (account === "admin") return "admin";
  return [...Object.keys(SAMPLE_ROSTER), ...created.map((g) => g.id)].some((id) => roleIn(account, id, created) === "owner") ? "owner" : "member";
}

/** Sample groups this account is in (the System Admin: all), with each goal's `joined` set for this person.
 *  joins: goal join requests an Owner approved (lib/memberships.ts). */
export function sampleGroupsFor(account: Account, joins: GoalJoins = NO_JOINS): Group[] {
  const live = groups.filter((g) => !g.archived);
  if (account === "admin") return live;
  const me = ACCOUNTS[account].name;
  return live.filter((g) => SAMPLE_ROSTER[g.id]?.members.includes(me))
    .map((g) => ({ ...g, goals: g.goals.map((x) => ({ ...x, joined: (x.info?.joinedBy ?? SAMPLE_ROSTER[g.id].members).includes(me) || approvedIn(joins, x.id, me) })) }));
}
/** Created groups this account can see: all for the System Admin, otherwise the ones they created or joined. */
export const createdGroupsFor = (account: Account, created: CreatedGroup[]) =>
  account === "admin" ? created : created.filter((g) => roleIn(account, g.id, created) !== null);

/** Members of a sample group with their roles, as this account sees them. */
export const rosterFor = (groupId: string, account: Account): { name: string; role: GroupRole; you: boolean }[] => {
  const s = SAMPLE_ROSTER[groupId];
  return s ? s.members.map((name) => ({ name, role: name === s.owner ? "Owner" : "Member", you: account !== "admin" && name === ACCOUNTS[account].name })) : [];
};
