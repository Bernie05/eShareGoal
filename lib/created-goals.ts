import { WIDGETS, type IconKey, type Measure, type Template, type TemplateField, type WidgetId } from "./goal-templates";
import { MAX_CREATED_GOALS, RETIRED_DEMO_GROUP } from "./constants";

// Goals created in the preview. Each keeps a copy of its template (fields, measure, dashboard sections),
// so it keeps working if the template is deleted. While the template exists, its dashboard sections win (see withTemplate).
// Kept in a cookie: no backend yet.
export type CreatedGoal = {
  id: string; name: string; groupId: string; status: "Active" | "Paused"; created: string; templateId?: string;
  template: { name: string; icon: IconKey; measure: Measure; fields: TemplateField[]; widgets: WidgetId[] };
  values: Record<string, string>; // field label -> what the Owner typed
  // single: one shared target for the group. each: every participant has their own copy of the target (e.g. 10,000 km each).
  scope?: GoalScope; participants?: string[]; // participants: who takes part in an "each" goal (empty = everyone in the group)
};
export type GoalScope = "single" | "each";
const ICONS: IconKey[] = ["wallet", "landmark", "dumbbell", "list", "target", "plane", "home", "book"];

export function parseCreatedGoals(raw?: string): CreatedGoal[] {
  try {
    const list: unknown = JSON.parse(decodeURIComponent(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list.filter((g): g is CreatedGoal =>
      typeof g?.id === "string" && /^goal-[a-z0-9-]{1,60}$/.test(g.id) && typeof g.name === "string" && typeof g.groupId === "string"
      && /^(family|my-[a-z0-9-]{1,60})$/.test(g.groupId) && g.groupId !== RETIRED_DEMO_GROUP && ["Active", "Paused"].includes(g.status) && typeof g.created === "string"
      && typeof g.template === "object" && ICONS.includes(g.template?.icon) && ["money", "count", "checklist"].includes(g.template?.measure)
      && Array.isArray(g.template.fields) && Array.isArray(g.template.widgets) && typeof g.values === "object" && g.values !== null)
      .slice(0, MAX_CREATED_GOALS)
      .map((g) => ({
        ...g, name: g.name.slice(0, 60), templateId: typeof g.templateId === "string" ? g.templateId.slice(0, 80) : undefined,
        template: { ...g.template, name: String(g.template.name).slice(0, 40), widgets: g.template.widgets.filter((w) => WIDGETS.some((x) => x.id === w)) },
        values: Object.fromEntries(Object.entries(g.values).filter(([, v]) => typeof v === "string").slice(0, 8).map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 80)])),
        scope: g.scope === "each" ? "each" : g.scope === "single" ? "single" : undefined,
        participants: Array.isArray(g.participants) ? g.participants.filter((p) => typeof p === "string").slice(0, 20) : undefined,
      }));
  } catch { return []; }
}

/** Which template a goal came from: its id, or for goals made before ids were kept, a template with the same name. */
export const templateOf = (g: CreatedGoal, templates: Template[]) =>
  templates.find((t) => t.id === g.templateId) ?? (g.templateId ? undefined : templates.find((t) => t.name === g.template.name));

/** When the System Admin edits a template, goals made from it get its current name, icon and dashboard sections.
 *  The values the Owner entered stay. A template that now measures something else is ignored. */
export function withTemplate(g: CreatedGoal, templates: Template[]): CreatedGoal {
  const t = templateOf(g, templates);
  if (!t || t.measure !== g.template.measure || !t.widgets.length) return g;
  return { ...g, templateId: t.id, template: { ...g.template, name: t.name, icon: t.icon, widgets: t.widgets } };
}

/** The number a goal is measured against, from its first money or number field. */
export function targetOf(g: CreatedGoal) {
  const f = g.template.fields.find((x) => x.kind === "money" || x.kind === "number");
  const n = f ? Number((g.values[f.label] ?? "").replace(/,/g, "")) : NaN;
  return f && Number.isFinite(n) && n > 0 ? { label: f.label, value: n, money: f.kind === "money" } : null;
}

/** Goals made before the toggle existed: a "per member" target meant one goal per member. */
export const scopeOf = (g: CreatedGoal): GoalScope => g.scope ?? (g.template.fields.some((f) => /per member/i.test(f.label)) ? "each" : "single");
/** Who an "each" goal is for, limited to people still in the group. */
export const participantsOf = (g: CreatedGoal, members: string[]) => {
  const picked = (g.participants ?? []).filter((p) => members.includes(p));
  return picked.length ? picked : members;
};
