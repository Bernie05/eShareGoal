import { BABYLYN_EMAIL, BILLY_EMAIL, MAX_CREATED_GROUPS, RETIRED_DEMO_GROUP } from "./constants";
// The role on the current page: "owner" (changes anything in this group), "member" (view only) or "admin" (System Admin:
// auto-joined to every group as a viewer and never counted in members, totals or charts). Roles are per group; see lib/accounts.ts.
export type ViewAs = "owner" | "member" | "admin";
export const viewAsLabel: Record<ViewAs, string> = { owner: "Owner", member: "Member", admin: "System Admin" };
// Email delivery: "prod" hands emails to the email provider; "dev" sends nothing and only shows that an email would have gone out.
export type EmailMode = "dev" | "prod";
export const parseEmailMode = (v?: string): EmailMode => (v === "prod" ? "prod" : "dev");

// Groups created in the preview. The creator (`by`) is always the Owner, whatever their role elsewhere.
// Kept in a cookie (no backend yet), so it is parsed defensively and capped.
// invites: everyone invited by email; joined: those who accepted; owners: joined people the creator made Owner (the creator always is).
// invites: every email invited (joined ones included); sent: when each invitation was last sent (it expires, see
// lib/memberships.ts); declined: invitees who said no; goals: the goals an invitee or member is in, by email (none = the whole
// group, every goal including new ones).
export type CreatedGroup = {
  id: string; name: string; description: string; created: string; by?: string; invites: string[]; joined?: string[]; owners?: string[];
  sent?: Record<string, string>; declined?: string[]; goals?: Record<string, string[]>;
};
export function parseCreatedGroups(raw?: string): CreatedGroup[] {
  try {
    const list: unknown = JSON.parse(decodeURIComponent(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list.filter((g): g is CreatedGroup =>
      typeof g?.id === "string" && /^my-[a-z0-9-]{1,60}$/.test(g.id) && typeof g.name === "string" && typeof g.description === "string"
      && typeof g.created === "string" && Array.isArray(g.invites) && g.id !== RETIRED_DEMO_GROUP).slice(0, MAX_CREATED_GROUPS) // the retired demo, still saved in some browsers
      .map((g) => ({ ...g, by: typeof g.by === "string" ? g.by.slice(0, 40) : undefined, name: g.name.slice(0, 40), description: g.description.slice(0, 120), invites: g.invites.filter((e) => typeof e === "string").slice(0, 10), joined: (Array.isArray(g.joined) ? g.joined : []).filter((e) => g.invites.includes(e)), owners: (Array.isArray(g.owners) ? g.owners : []).filter((e) => Array.isArray(g.joined) && g.joined.includes(e)),
        sent: Object.fromEntries(Object.entries(g.sent && typeof g.sent === "object" ? g.sent : {}).filter(([e, d]) => g.invites.includes(e) && typeof d === "string" && !Number.isNaN(Date.parse(d)))),
        declined: (Array.isArray(g.declined) ? g.declined : []).filter((e) => g.invites.includes(e)),
        goals: Object.fromEntries(Object.entries(g.goals && typeof g.goals === "object" ? g.goals : {}).filter(([e, ids]) => g.invites.includes(e) && Array.isArray(ids))
          .map(([e, ids]) => [e, (ids as unknown[]).filter((id): id is string => typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id)).slice(0, 20)])) }));
  } catch { return []; }
}

// People whose address does not spell their name.
const KNOWN_NAMES: Record<string, string> = { [BABYLYN_EMAIL]: "Babylyn", [BILLY_EMAIL]: "Billy" };
/** Display name for someone invited by email, until they set their own: "ana.cruz@x.com" -> "Ana Cruz". */
export const nameFromEmail = (e: string) => KNOWN_NAMES[e.toLowerCase()] ?? (e.split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || e);
