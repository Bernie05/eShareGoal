import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gmailConnections, goalMembers, goals, users } from "@/lib/db/schema";
import { dueOn, memberFor, payerOf } from "@/lib/import-workflows";
import { TIME_ZONE } from "@/lib/constants";
import { UserError } from "./core";
import { TIMER_GOALS } from "./dal";
import { readInboxForJob } from "./gmail";
import { addImported, knownKeys, queueImport, settleReview, waitingForMember } from "./import-review";
import { timerSetup } from "./import-setup";

// Scheduled Gmail import: runs each goal's saved jobs on its linked inbox and adds the payments to the goal's records, so the
// overdue check sees them. Jobs and workflows come from lib/server/import-setup.ts, so what is saved on the screen is what runs.
// A payment needs a member and a new reference. One with no member goes to the goal's Owners; one they rejected stays out.

async function timerJobs(entry: string) {
  const { jobs, workflows } = await timerSetup(entry);
  return jobs.map((job) => ({ job, workflow: workflows.find((w) => w.id === job.workflow && w.status === "Published") }));
}

export type ImportJobReport = { job: string; read: number; added: number; duplicates: number; unmapped: number; notDeposits: number; skipped?: string };

export interface RunImportsInput { dry?: boolean; today?: string }
/** dry: reports what would be added and writes nothing. today: only jobs scheduled for this date run. */
export async function runGmailImports({ dry = false, today = new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE }) }: RunImportsInput = {}): Promise<ImportJobReport[]> {
  const reports: ImportJobReport[] = [];
  for (const [entry, goalId] of Object.entries(TIMER_GOALS)) for (const { job, workflow } of await timerJobs(entry)) {
    const r: ImportJobReport = { job: job.name ?? workflow?.name ?? job.id, read: 0, added: 0, duplicates: 0, unmapped: 0, notDeposits: 0 };
    reports.push(r);
    if (!job.on) { r.skipped = "Paused."; continue; }
    if (!dueOn(job.schedule, today)) { r.skipped = "Not scheduled today."; continue; }
    const [goal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
    const [inbox] = await db.select({ by: gmailConnections.connectedBy }).from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
    if (!workflow || !goal) { r.skipped = "Its workflow or goal is missing or not active."; continue; }
    if (!inbox?.by) { r.skipped = "No Gmail is linked to this goal."; continue; }

    let reads;
    try { ({ reads } = await readInboxForJob({ entry, workflow, label: "", days: workflow.find.days, viewerId: inbox.by })); }
    catch (e) { if (e instanceof UserError) { r.skipped = e.message; continue; } throw e; }
    r.read = reads.length;

    const members = await db.select({ id: users.id, name: users.name }).from(goalMembers).innerJoin(users, eq(goalMembers.userId, users.id)).where(eq(goalMembers.goalId, goal.id));
    const seen = await knownKeys(goal.id), waiting = await waitingForMember(goal.id);
    for (const read of reads) {
      if (!read.deposit) { r.notDeposits++; continue; }
      const ref = String(read.json.reference ?? read.json.messageId);
      const name = memberFor(job.map, read.json), member = members.find((m) => m.name === name);
      if ((seen.has(ref) || seen.has(read.id)) && !(member && waiting.has(ref))) { r.duplicates++; continue; }
      seen.add(ref).add(read.id);
      const day = typeof read.json.date === "string" ? read.json.date : read.received.slice(0, 10), amount = read.json.amount as number;
      if (!member) {
        r.unmapped++;
        if (!dry) await queueImport({ goalId: goal.id, memberId: null, day, amount, ref, messageId: read.id, payer: payerOf(workflow, read.json)?.value ?? "", job: r.job, foundBy: null });
        continue;
      }
      if (dry) { r.added++; continue; }
      if (await addImported({ goal, memberId: member.id, day, amount, ref, messageId: read.id, actorId: inbox.by })) {
        r.added++;
        if (waiting.delete(ref)) await settleReview(goal.id, ref, member.id);
      }
      else r.duplicates++;
    }
  }
  return reports;
}
