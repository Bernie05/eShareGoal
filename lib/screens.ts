import type { Goal } from "./demo-data";
import type { ViewAs } from "./view-as";
import { BASE_PATH } from "./constants";

// Preview screen registry: slug -> label and breadcrumb. Also drives the preview index, sidebar links and breadcrumbs.
// `only`: the roles that may open the screen; anyone else is sent to the Dashboard. No `only` = every role.
const OWNER = ["owner"] as const;
export const screens = [
  { slug: "dashboard", label: "Dashboard", crumbs: ["Dashboard"] },
  { slug: "activity", label: "Activity history", crumbs: ["Activity History"] },
  { slug: "goals", label: "All goals", crumbs: ["All Goals"] },
  { slug: "goal-info", label: "Goal info (not joined)", crumbs: ["All Goals", "Goal info"] },
  { slug: "my-goal", label: "Goal created from a template", crumbs: ["All Goals", "Goal"] },
  { slug: "groups", label: "Group list", crumbs: ["My Groups"], only: ["owner", "member"] },
  { slug: "group", label: "Group overview", crumbs: ["My Groups", "Family"] },
  { slug: "loan", label: "Loan goal (Car Credit)", crumbs: ["Family", "Car Credit"] },
  { slug: "new-goal", label: "Create goal", crumbs: ["Family", "New goal"] },
  { slug: "transactions", label: "Transactions", crumbs: ["Family", "Car Credit", "Transactions"] },
  { slug: "add-transaction", label: "Add transaction form", crumbs: ["Family", "Car Credit", "Add transaction"] },
  // Integrations, scheduled jobs and notification settings are on each group page (Group setup), not separate screens.
  { slug: "import", label: "Import review queue", crumbs: ["Family", "Import review"], only: OWNER },
  { slug: "notifications", label: "Notifications", crumbs: ["Notifications"], only: OWNER },
  { slug: "users", label: "Users", crumbs: ["Users"], only: ["admin"] },
  { slug: "reports", label: "Reports", crumbs: ["Reports"], only: ["admin"] },
  { slug: "templates", label: "Goal templates", crumbs: ["Goal Templates"], only: ["admin"] },
  { slug: "email-templates", label: "Email templates", crumbs: ["Email Templates"], only: ["admin"] },
  { slug: "settings", label: "Settings", crumbs: ["Settings"] },
] as const;
export type ScreenSlug = (typeof screens)[number]["slug"];
/** The sections of Settings, by what people come to do. The same list drives the page and the account menu. */
export const SETTINGS_SECTIONS = [
  { tab: "profile", label: "Profile", group: "Account" },
  { tab: "cards", label: "Payment cards", group: "Account", only: ["owner", "member"] },
  { tab: "region", label: "Region and format", group: "Preferences" },
  { tab: "appearance", label: "Appearance", group: "Preferences" },
  { tab: "privacy", label: "Data and privacy", group: "Privacy" },
  { tab: "email", label: "Email delivery", group: "Administration", only: ["admin"] },
] as const;
export type SettingsTab = (typeof SETTINGS_SECTIONS)[number]["tab"];
export const settingsFor = (viewAs: ViewAs) => SETTINGS_SECTIONS.filter((s) => !("only" in s) || (s.only as readonly ViewAs[]).includes(viewAs));
/** Sections side by side under their group, in list order. */
export const settingsGroups = (viewAs: ViewAs) => [...new Set(settingsFor(viewAs).map((s) => s.group as string))].map((label) => ({ label, items: settingsFor(viewAs).filter((s) => s.group === label) }));
export const settingsHref = (tab: SettingsTab) => `${BASE_PATH}/settings?tab=${tab}`;
export const canOpen = (slug: string, viewAs: ViewAs) => {
  const s = screens.find((x) => x.slug === slug);
  return !!s && (!("only" in s) || (s.only as readonly ViewAs[]).includes(viewAs));
};

// Where a goal link goes: the full page for Owners and System Admins, and for Members who joined it; otherwise the limited info page.
export const goalPath = (g: Pick<Goal, "id" | "joined">, viewAs: ViewAs) =>
  g.joined || viewAs !== "member" ? `${BASE_PATH}/loan?goal=${g.id}` : `${BASE_PATH}/goal-info?goal=${g.id}`;
