import { cookies } from "next/headers";
import { parseCreatedGoals, withTemplate } from "./created-goals";
import { builtInsWith, parseRetired, parseTemplates } from "./goal-templates";
import { parseGoalRequests } from "./goal-requests";
import { parseGroupSettings, settingsFor } from "./group-settings";
import { ensureDb } from "./db";
import { savedGoalImports } from "./server/import-setup";
import { parseCreatedGroups, parseEmailMode } from "./view-as";
import { navRole, parseAccount, type Account } from "./accounts";
import { SEED_GROUPS } from "./db/seed";
import { getViewer, roleInGroup, TIMER_GOALS } from "./server/dal";
import { devBypass } from "./server/dev";
import { parseGoalJoins } from "./memberships";
import { ACCOUNT_COOKIE, CREATED_GOALS_COOKIE, CREATED_GROUPS_COOKIE, EMAIL_MODE_COOKIE, GOAL_JOINS_COOKIE, GOAL_REQUESTS_COOKIE, GROUP_SETTINGS_COOKIE, RETIRED_COOKIE, TEMPLATES_COOKIE } from "./constants";

/** Who the screens show. With the development toggle on: the View as switch. Otherwise the signed-in person; the cookie is never trusted,
 *  and nobody falls back to System Admin. Screens still built on sample data need one of the sample accounts, by the person's real role. */
export async function getAccount(): Promise<Account> {
  if (devBypass) return parseAccount((await cookies()).get(ACCOUNT_COOKIE)?.value);
  const viewer = await getViewer();
  if (!viewer) return "guest";
  if (viewer.siteRole === "admin") return "admin";
  const role = await roleInGroup(viewer, SEED_GROUPS.family);
  return role === "owner" ? "user1" : role === "member" ? "user2" : "guest";
}

/** The real name and email for the account menu; null while the development toggle is on (the switch decides). */
export async function getIdentity() {
  if (devBypass) return null;
  const viewer = await getViewer();
  return viewer && { name: viewer.name, email: viewer.email, initials: viewer.name.slice(0, 2).toUpperCase() };
}

/** Site-wide role for navigation: admin, owner (owns at least one group) or member. Pages use the role in each group. */
export async function getViewAs() {
  return navRole(await getAccount(), await getCreatedGroups());
}

export async function getEmailMode() {
  return parseEmailMode((await cookies()).get(EMAIL_MODE_COOKIE)?.value);
}

export async function getCreatedGroups() {
  return parseCreatedGroups((await cookies()).get(CREATED_GROUPS_COOKIE)?.value);
}

/** Templates the System Admin made (Draft, Published or Retired). */
export async function getTemplates() {
  return parseTemplates((await cookies()).get(TEMPLATES_COOKIE)?.value);
}

/** Built-in templates, with the ones the System Admin retired marked "Retired". */
export async function getBuiltIns() {
  return builtInsWith(parseRetired((await cookies()).get(RETIRED_COOKIE)?.value));
}

/** Created goals, with dashboard sections taken from their template's current version. */
export async function getCreatedGoals() {
  const templates = [...(await getBuiltIns()), ...(await getTemplates())];
  return parseCreatedGoals((await cookies()).get(CREATED_GOALS_COOKIE)?.value).map((g) => withTemplate(g, templates));
}

export async function getGoalRequests() {
  return parseGoalRequests((await cookies()).get(GOAL_REQUESTS_COOKIE)?.value);
}

export async function getGroupSettings() {
  const all = parseGroupSettings((await cookies()).get(GROUP_SETTINGS_COOKIE)?.value);
  await ensureDb();
  for (const entry of Object.keys(TIMER_GOALS)) { // what the scheduler runs is what every screen shows
    const saved = await savedGoalImports(entry);
    if (saved) all[entry] = { ...settingsFor(all, entry), imports: saved.jobs, serverImports: true };
  }
  return all;
}

/** Goal join requests and the ones an Owner approved or declined (lib/memberships.ts). */
export async function getGoalJoins() {
  return parseGoalJoins((await cookies()).get(GOAL_JOINS_COOKIE)?.value);
}
