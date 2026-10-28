import { cookies } from "next/headers";
import { CREATED_GOALS_COOKIE, parseCreatedGoals, withTemplate } from "./created-goals";
import { builtInsWith, parseRetired, parseTemplates, RETIRED_COOKIE, TEMPLATES_COOKIE } from "./goal-templates";
import { GOAL_REQUESTS_COOKIE, parseGoalRequests } from "./goal-requests";
import { GROUP_SETTINGS_COOKIE, parseGroupSettings } from "./group-settings";
import { CREATED_GROUPS_COOKIE, EMAIL_MODE_COOKIE, parseCreatedGroups, parseEmailMode } from "./view-as";
import { ACCOUNT_COOKIE, navRole, parseAccount } from "./accounts";

/** Who the preview is viewed as (View as switch): the System Admin, User 1 or User 2. */
export async function getAccount() {
  return parseAccount((await cookies()).get(ACCOUNT_COOKIE)?.value);
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
  return parseGroupSettings((await cookies()).get(GROUP_SETTINGS_COOKIE)?.value);
}
