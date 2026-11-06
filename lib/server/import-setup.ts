import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { importSetups } from "@/lib/db/schema";
import { BUILT_IN_WORKFLOWS, importJobsFor, parseImportJobs, parseWorkflow, workflowProblems, type ImportJob, type ImportWorkflow } from "@/lib/import-workflows";
import { okSchedule } from "@/lib/group-settings";
import { OWN_PREFIX, WORKFLOW_LIMITS } from "@/lib/constants";
import { Forbidden, timerGoalAccess, type Viewer } from "./dal";
import { devBypass } from "./dev";
import { UserError } from "./core";

// What the scheduler runs, saved from the same screen that shows it: each goal's jobs, with the filter and target fields of each.
export type GoalImports = { jobs: ImportJob[]; workflows: ImportWorkflow[] };
export interface SaveGoalImportsInput { entry: string; jobs: unknown; workflows: unknown }

async function readSetup<T>(key: string) {
  const [row] = await db.select({ data: importSetups.data }).from(importSetups).where(eq(importSetups.key, key)).limit(1);
  return row ? (row.data as T) : null;
}
async function writeSetup(key: string, data: object, viewerId: string) {
  const row = { data, updatedBy: viewerId, updatedAt: new Date() };
  await db.insert(importSetups).values({ key, ...row }).onConflictDoUpdate({ target: importSetups.key, set: row });
}

/** Nothing unsafe reaches the scheduler: the same checks as the editor, because this input comes from the browser. */
function checkedWorkflows(input: unknown, keep: (w: ImportWorkflow) => boolean) {
  if (!Array.isArray(input) || input.length > WORKFLOW_LIMITS.workflows) throw new UserError("These workflows could not be read.");
  const list = input.map(parseWorkflow).filter((w): w is ImportWorkflow => !!w && keep(w));
  if (list.length !== input.length) throw new UserError("These workflows could not be read.");
  const bad = list.find((w) => Object.keys(workflowProblems(w, [])).length);
  if (bad) throw new UserError(`${bad.name} has problems. Open it in the editor and fix them.`);
  return list;
}

/** The goal's group when this viewer may change its jobs: its Owners and the System Admin. null for a preview-only goal. */
export async function groupToEdit(viewer: Viewer, entry: string) {
  const goal = await timerGoalAccess(viewer, entry);
  if (!goal) return null;
  if (!devBypass && goal.role !== "owner" && goal.role !== "admin") throw new Forbidden("Only an Owner or the System Admin can change scheduled jobs.");
  return goal.groupId;
}

export const savedGoalImports = (entry: string) => readSetup<GoalImports>(entry);
/** timer: whether this goal runs on the server. jobs: its saved list, or null when it was never saved. */
export async function goalJobs(viewer: Viewer, entry: string) {
  const none = { timer: false, jobs: null, workflows: [] as ImportWorkflow[] };
  const goal = await timerGoalAccess(viewer, entry);
  if (!goal || (!devBypass && !goal.role)) return none;
  const saved = await savedGoalImports(entry);
  return { timer: true, jobs: saved?.jobs ?? null, workflows: saved?.workflows ?? [] };
}
export async function saveGoalImports(viewer: Viewer, { entry, jobs, workflows }: SaveGoalImportsInput) {
  if (!(await groupToEdit(viewer, entry))) return false;
  const list = parseImportJobs(jobs, (v) => (okSchedule(v) ? v : undefined));
  if (!list) throw new UserError("These jobs could not be read.");
  await writeSetup(entry, { jobs: list, workflows: checkedWorkflows(workflows, (w) => w.id.startsWith(OWN_PREFIX)) }, viewer.id);
  return true;
}

/** What one goal runs: its saved jobs (or the sample list until it is saved), and every workflow they may use. */
export async function timerSetup(entry: string): Promise<GoalImports> {
  const saved = await savedGoalImports(entry);
  return { jobs: saved?.jobs ?? importJobsFor(entry), workflows: [...(saved?.workflows ?? []), ...BUILT_IN_WORKFLOWS] };
}
