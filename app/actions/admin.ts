"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import * as svc from "@/lib/server/admin";

// System Admin: account review. Each action re-checks that the caller is a System Admin (lib/server/admin.ts).
const done = <T,>(r: T) => { revalidatePath("/admin/users"); revalidatePath("/"); return r; };

export async function reviewUserAction(userId: string, approve: boolean, reason = "") { return run((v) => svc.reviewUser(v, userId, approve, reason).then(done)); }
export async function revokeUserAction(userId: string, reason: string) { return run((v) => svc.revokeUser(v, userId, reason).then(done)); }
export async function restoreUserAction(userId: string) { return run((v) => svc.restoreUser(v, userId).then(done)); }
