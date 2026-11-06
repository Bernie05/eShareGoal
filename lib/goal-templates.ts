import { MAX_TEMPLATES } from "./constants";
// Goal templates: what a group Owner picks in "Create goal". Built-in ones ship with the app; System Admins add more.
// Each template says what users fill in and which dashboard sections a goal made from it shows.
export type Measure = "money" | "count" | "checklist";
export type IconKey = "wallet" | "landmark" | "dumbbell" | "list" | "target" | "plane" | "home" | "book";
export type FieldKind = "money" | "number" | "date" | "text";
// mode: who sets the value. owner (default): the Owner types it. suggested: the admin pre-fills it, the Owner can change it.
// locked: the admin's value is used and the Owner cannot change it.
export type FieldMode = "owner" | "suggested" | "locked";
export type TemplateField = { label: string; kind: FieldKind; required: boolean; mode?: FieldMode; value?: string };
// scope: who the goal is for. "choose" lets the Owner pick; single/each is fixed by the System Admin.
export type TemplateScope = "choose" | "single" | "each";
export type TemplateStatus = "Published" | "Draft" | "Retired";
export type WidgetId = "stats" | "progress" | "monthly" | "byMember" | "contributions" | "schedule" | "inout" | "checkins" | "leaderboard" | "milestones" | "tasks" | "records";
export type Template = {
  id: string; name: string; description: string; icon: IconKey; measure: Measure;
  fields: TemplateField[]; widgets: WidgetId[]; status: TemplateStatus; builtIn?: boolean; created?: string;
  scope?: TemplateScope; groups?: string[]; // groups: where Owners can pick it (missing or empty = every group)
};

export const modeOf = (f: TemplateField): FieldMode => f.mode ?? "owner";
/** Ready-made: nothing left to type except optional fields, so the Owner only picks it and chooses who takes part. */
export const isReadyMade = (t: Template) => t.fields.some((f) => modeOf(f) === "locked") && t.fields.every((f) => modeOf(f) === "locked" || !f.required);
/** Templates an Owner can pick for a group: published (not draft or retired) and available there. */
export const availableIn = (t: Template, groupId: string) => t.status === "Published" && (!t.groups?.length || t.groups.includes(groupId));

/** Dashboard sections an admin can switch on. `measures` limits a section to goals where it makes sense. */
export const WIDGETS: { id: WidgetId; label: string; what: string; measures: Measure[]; wide?: boolean }[] = [
  { id: "stats", label: "Key numbers", what: "Saved, remaining, pace or count at the top", measures: ["money", "count", "checklist"], wide: true },
  { id: "progress", label: "Progress bar", what: "How close the goal is to its target", measures: ["money", "count", "checklist"], wide: true },
  { id: "monthly", label: "Per month chart", what: "Amount or count per month, by member", measures: ["money", "count"] },
  { id: "byMember", label: "Share by member", what: "Donut of each member's share", measures: ["money", "count"] },
  { id: "contributions", label: "Contributions table", what: "Total, deposits and pending per member", measures: ["money"], wide: true },
  { id: "schedule", label: "Payment schedule", what: "Due dates, paid and upcoming installments", measures: ["money"] },
  { id: "inout", label: "Money in vs out", what: "Deposits against payments and expenses", measures: ["money"] },
  { id: "checkins", label: "Check-ins per month", what: "How often members log progress", measures: ["count"] },
  { id: "leaderboard", label: "Member leaderboard", what: "Ranking by progress", measures: ["count", "checklist"] },
  { id: "milestones", label: "Milestones", what: "Steps on the way to the target", measures: ["money", "count", "checklist"] },
  { id: "tasks", label: "Task checklist", what: "Tasks with who, when and status", measures: ["checklist"], wide: true },
  { id: "records", label: "Recent records", what: "Latest entries with who recorded them", measures: ["money", "count", "checklist"], wide: true },
];
export const widget = (id: WidgetId) => WIDGETS.find((w) => w.id === id)!;

const money = (label: string, required = true): TemplateField => ({ label, kind: "money", required });
export const BUILT_IN: Template[] = [
  { id: "shared-money", name: "Shared Money", description: "Savings, deposits, withdrawals and balances", icon: "wallet", measure: "money", builtIn: true, status: "Published",
    fields: [money("Target amount"), { label: "Target date", kind: "date", required: false }], widgets: ["stats", "progress", "monthly", "byMember", "contributions", "milestones"] },
  { id: "loan", name: "Loan and Installments", description: "Fixed schedule, payments and remaining balance", icon: "landmark", measure: "money", builtIn: true, status: "Published",
    fields: [money("Monthly amortization"), { label: "Term (months)", kind: "number", required: true }, { label: "First due date", kind: "date", required: true }], widgets: ["stats", "progress", "schedule", "inout", "contributions", "records"] },
  { id: "fitness", name: "Fitness and Health", description: "Weight, exercise and weekly updates", icon: "dumbbell", measure: "count", builtIn: true, status: "Published",
    fields: [{ label: "Target per member", kind: "number", required: true }, { label: "Unit (kg, workouts…)", kind: "text", required: true }, { label: "End date", kind: "date", required: false }], widgets: ["stats", "progress", "checkins", "leaderboard", "records"] },
  { id: "tasks", name: "Tasks and Milestones", description: "Assigned tasks, deadlines and status", icon: "list", measure: "checklist", builtIn: true, status: "Published",
    fields: [{ label: "Deadline", kind: "date", required: false }], widgets: ["stats", "progress", "tasks", "leaderboard"] },
  { id: "custom", name: "Custom Goal", description: "Your own target, unit and records", icon: "target", measure: "count", builtIn: true, status: "Published",
    fields: [{ label: "Target", kind: "number", required: true }, { label: "Unit", kind: "text", required: true }], widgets: ["stats", "progress", "records"] },
  { id: "walk-challenge", name: "Walking Challenge", description: "10,000 km each, ready to start", icon: "dumbbell", measure: "count", builtIn: true, status: "Published", scope: "each",
    fields: [{ label: "Target per member", kind: "number", required: true, mode: "locked", value: "10000" }, { label: "Unit (kg, workouts…)", kind: "text", required: true, mode: "locked", value: "km" }, { label: "End date", kind: "date", required: false }],
    widgets: ["stats", "progress", "checkins", "leaderboard", "records"] },
];

// Built-in templates cannot be edited, only retired (hidden from Create goal). Their ids are kept in a cookie.
export function parseRetired(raw?: string): string[] {
  try { const l: unknown = JSON.parse(decodeURIComponent(raw ?? "[]")); return Array.isArray(l) ? l.filter((x): x is string => BUILT_IN.some((t) => t.id === x)) : []; } catch { return []; }
}
export const builtInsWith = (retired: string[]): Template[] => BUILT_IN.map((t) => (retired.includes(t.id) ? { ...t, status: "Retired" } : t));

// Admin-made templates live in a cookie in the preview (no backend), so they are parsed defensively and capped.
const ICONS: IconKey[] = ["wallet", "landmark", "dumbbell", "list", "target", "plane", "home", "book"];
const KINDS: FieldKind[] = ["money", "number", "date", "text"];
const MODES: FieldMode[] = ["owner", "suggested", "locked"];
export function parseTemplates(raw?: string): Template[] {
  try {
    const list: unknown = JSON.parse(decodeURIComponent(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is Template =>
      typeof t?.id === "string" && /^tpl-[a-z0-9-]{1,60}$/.test(t.id) && typeof t.name === "string" && typeof t.description === "string"
      && ICONS.includes(t.icon) && ["money", "count", "checklist"].includes(t.measure) && ["Published", "Draft", "Retired"].includes(t.status)
      && Array.isArray(t.fields) && Array.isArray(t.widgets)).slice(0, MAX_TEMPLATES)
      .map((t) => ({
        ...t, builtIn: false, name: t.name.slice(0, 40), description: t.description.slice(0, 120),
        fields: t.fields.filter((f) => typeof f?.label === "string" && KINDS.includes(f.kind)).slice(0, 6).map((f) => {
          const mode = MODES.includes(f.mode as FieldMode) && f.mode !== "owner" && typeof f.value === "string" ? f.mode : undefined;
          return { label: f.label.slice(0, 40), kind: f.kind, required: !!f.required, ...(mode ? { mode, value: f.value!.slice(0, 40) } : {}) };
        }),
        widgets: t.widgets.filter((w) => WIDGETS.some((x) => x.id === w && x.measures.includes(t.measure))),
        scope: t.scope === "single" || t.scope === "each" ? t.scope : undefined,
        groups: Array.isArray(t.groups) ? t.groups.filter((g) => typeof g === "string" && /^(family|my-[a-z0-9-]{1,60})$/.test(g)).slice(0, 10) : undefined,
      }));
  } catch { return []; }
}
