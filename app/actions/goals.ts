"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import * as svc from "@/lib/server/goals";

// Goals, join requests and records. Each action re-checks the signed-in user and their role (lib/server/goals.ts).
const done = <T,>(...paths: string[]) => (r: T) => { revalidatePath("/", "layout"); for (const p of paths) revalidatePath(p); return r; };

export async function createGoalAction(groupId: string, input: Record<string, unknown>) { return run((v) => svc.createGoal(v, groupId, input).then(done(`/groups/${groupId}`))); }
export async function updateGoalAction(goalId: string, input: Record<string, unknown>) { return run((v) => svc.updateGoal(v, goalId, input).then(done(`/goals/${goalId}`))); }
export async function setGoalStatusAction(goalId: string, status: "active" | "paused" | "completed" | "archived") { return run((v) => svc.setGoalStatus(v, goalId, status).then(done(`/goals/${goalId}`))); }
export async function deleteGoalAction(goalId: string) { return run((v) => svc.deleteGoal(v, goalId).then(done())); }
export async function setShareAction(goalId: string, userId: string, share: number | null) { return run((v) => svc.setShare(v, goalId, userId, share).then(done(`/goals/${goalId}`))); }

export async function requestToJoinGoalAction(goalId: string) { return run((v) => svc.requestToJoinGoal(v, goalId).then(done(`/goals/${goalId}`))); }
export async function cancelJoinRequestAction(requestId: string, goalId: string) { return run((v) => svc.cancelJoinRequest(v, requestId).then(done(`/goals/${goalId}`))); }
export async function decideJoinRequestAction(requestId: string, approve: boolean, share: number | null = null) { return run((v) => svc.decideJoinRequest(v, requestId, approve, share).then(done())); }

export async function addRecordAction(goalId: string, input: Record<string, unknown>) { return run((v) => svc.addRecord(v, goalId, input).then(done(`/goals/${goalId}`))); }
export async function updateRecordAction(recordId: string, goalId: string, input: Record<string, unknown>) { return run((v) => svc.updateRecord(v, recordId, input).then(done(`/goals/${goalId}`))); }
export async function deleteRecordAction(recordId: string, goalId: string) { return run((v) => svc.deleteRecord(v, recordId).then(done(`/goals/${goalId}`))); }
