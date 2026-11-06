import { MAX_GOAL_REQUESTS } from "./constants";
// "Request a goal type": an Owner asks the System Admin for a kind of goal that no template covers.
// Requests show up in Reports; the admin builds a template from one or rejects it. Kept in a cookie: no backend yet.
export type GoalRequestStatus = "Open" | "Built" | "Rejected";
export type GoalRequest = {
  id: string; name: string; what: string; group: string; by: string; created: string;
  status: GoalRequestStatus; note?: string; templateId?: string;
};

export function parseGoalRequests(raw?: string): GoalRequest[] {
  try {
    const list: unknown = JSON.parse(decodeURIComponent(raw ?? "[]"));
    if (!Array.isArray(list)) return [];
    return list.filter((r): r is GoalRequest =>
      typeof r?.id === "string" && /^GR-[0-9a-z]{1,12}$/.test(r.id) && typeof r.name === "string" && typeof r.what === "string"
      && typeof r.group === "string" && typeof r.by === "string" && typeof r.created === "string" && ["Open", "Built", "Rejected"].includes(r.status))
      .slice(0, MAX_GOAL_REQUESTS)
      .map((r) => ({
        ...r, name: r.name.slice(0, 40), what: r.what.slice(0, 200), group: r.group.slice(0, 40), by: r.by.slice(0, 40),
        note: typeof r.note === "string" ? r.note.slice(0, 120) : undefined, templateId: typeof r.templateId === "string" ? r.templateId.slice(0, 80) : undefined,
      }));
  } catch { return []; }
}
