import type { Goal, GoalType } from "./demo-data";
import type { ViewAs } from "./view-as";

// Preview screen registry: slug -> label and breadcrumb. Also drives the preview index, sidebar links and breadcrumbs.
// `only`: the roles that may open the screen; anyone else is sent to the Dashboard. No `only` = every role.
const OWNER = ["owner"] as const;
export const screens = [
  { slug: "dashboard", label: "Dashboard", crumbs: ["Dashboard"] },
  { slug: "activity", label: "Activity history", crumbs: ["Activity History"] },
  { slug: "goals", label: "All goals", crumbs: ["All Goals"] },
  { slug: "goal-info", label: "Goal info (not joined)", crumbs: ["All Goals", "Goal info"] },
  { slug: "groups", label: "Group list", crumbs: ["My Groups"], only: ["owner", "member"] },
  { slug: "group", label: "Group overview", crumbs: ["My Groups", "Family"] },
  { slug: "shared-money", label: "Shared Money goal", crumbs: ["Family", "Emergency Fund"] },
  { slug: "loan", label: "Loan goal (Car Credit)", crumbs: ["Family", "Car Credit"] },
  { slug: "generic", label: "Generic goal (fitness)", crumbs: ["Friends", "30-Day Fitness Challenge"] },
  { slug: "new-goal", label: "Create goal", crumbs: ["Family", "New goal"] },
  { slug: "transactions", label: "Transactions", crumbs: ["Family", "Car Credit", "Transactions"] },
  { slug: "add-transaction", label: "Add transaction form", crumbs: ["Family", "Car Credit", "Add transaction"] },
  { slug: "import", label: "Import review queue", crumbs: ["Integrations", "Import review"], only: OWNER },
  { slug: "integrations", label: "Integrations", crumbs: ["Integrations"], only: OWNER },
  { slug: "jobs", label: "Scheduled jobs", crumbs: ["Scheduled Jobs"], only: OWNER },
  { slug: "notifications", label: "Notifications", crumbs: ["Notifications"], only: OWNER },
  { slug: "users", label: "Users", crumbs: ["Users"], only: ["admin"] },
  { slug: "reports", label: "Reports", crumbs: ["Reports"], only: ["admin"] },
  { slug: "settings", label: "Settings", crumbs: ["Settings"] },
] as const;
export type ScreenSlug = (typeof screens)[number]["slug"];
export const canOpen = (slug: string, viewAs: ViewAs) => {
  const s = screens.find((x) => x.slug === slug);
  return !!s && (!("only" in s) || (s.only as readonly ViewAs[]).includes(viewAs));
};

// Where a goal link goes: the full page for Owners and System Admins, and for Members who joined it; otherwise the limited info page.
const goalScreen: Record<GoalType, ScreenSlug> = { loan: "loan", shared_money: "shared-money", fitness: "generic", tasks: "generic", custom: "generic" };
export const goalPath = (g: Pick<Goal, "id" | "type" | "joined">, viewAs: ViewAs) =>
  g.joined || viewAs !== "member" ? `/design-preview/${goalScreen[g.type]}` : `/design-preview/goal-info?goal=${g.id}`;
