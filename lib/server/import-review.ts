import "server-only";
import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/lib/db";
import { goalMembers, goals, importReviews, records, users } from "@/lib/db/schema";
import { GMAIL_IMPORT_MAX, GMAIL_IMPORT_NOTE, IMPORT_AMOUNT_MAX, REVIEW_LIST_MAX } from "@/lib/constants";
import { audit, parse, UserError, type Tx } from "./core";
import { Forbidden, roleInGroup, timerGoalAccess, TIMER_GOALS, type Viewer } from "./dal";
import { devBypass } from "./dev";
import { entryKey } from "./gmail";
import { groupToEdit } from "./import-setup";

// Payments found in Gmail and what became of them. A payment is a record of the goal, or a row of its review queue waiting for
// an Owner, never both by accident: the timer, Run now and Confirm all go through here, so each payment is handled once.

type GoalRow = typeof goals.$inferSelect;
export type ReviewState = "Pending Review" | "Confirmed" | "Rejected";
const STATE: Record<string, ReviewState> = { pending: "Pending Review", confirmed: "Confirmed", rejected: "Rejected" };

const peopleOf = (goalId: string) => db.select({ id: users.id, name: users.name }).from(goalMembers).innerJoin(users, eq(goalMembers.userId, users.id)).where(eq(goalMembers.goalId, goalId));
const keysOf = (rows: { ref: string | null; messageId: string | null }[]) => rows.flatMap((k) => [k.ref, k.messageId]).filter((k): k is string => !!k);

/** Every reference and Gmail message a goal has met: its records (deleted too) and its review queue (rejected too). */
export async function knownKeys(goalId: string) {
  const held = await db.select({ ref: records.ref, messageId: records.messageId }).from(records).where(eq(records.goalId, goalId));
  const queued = await db.select({ ref: importReviews.ref, messageId: importReviews.messageId }).from(importReviews).where(eq(importReviews.goalId, goalId));
  return new Set(keysOf([...held, ...queued]));
}

interface ImportedPayment { goal: GoalRow; memberId: string; day: string; amount: number; ref: string; messageId: string | null; actorId: string | null }
/** The one way a Gmail payment becomes a record. false: it is already recorded, nothing changed.
 *  A deleted record still counts as recorded, so a payment an Owner removed does not come back on the next run.
 *  Pass the transaction when inside one, so the record is kept or dropped with the change. */
export async function addImported({ goal, memberId, day, amount, ref, messageId, actorId }: ImportedPayment, tx: Db | Tx = db) {
  const same: SQL[] = [eq(records.ref, ref)];
  if (messageId) same.push(eq(records.messageId, messageId));
  const [dup] = await tx.select({ id: records.id }).from(records).where(and(eq(records.goalId, goal.id), or(...same))).limit(1);
  if (dup) return false;
  const added = await tx.insert(records).values({ goalId: goal.id, memberId, day, amount, direction: "in", kind: "deposit", method: "Bank transfer", ref, messageId: messageId || null, note: `${GMAIL_IMPORT_NOTE} · ${ref}`, source: "import", createdBy: goal.createdBy }).onConflictDoNothing().returning({ id: records.id });
  if (!added.length) return false;
  await audit({ actorId, action: "record.import", groupId: goal.groupId, goalId: goal.id, detail: { ref, amount, memberId } }, tx);
  return true;
}

interface QueuedPayment { goalId: string; memberId: string | null; day: string; amount: number; ref: string; messageId: string | null; payer: string; job: string; foundBy: string | null }
/** Puts a payment in front of the goal's Owners. false: it is already queued. */
export async function queueImport(p: QueuedPayment) {
  const rows = await db.insert(importReviews).values(p).onConflictDoNothing().returning({ id: importReviews.id });
  return rows.length > 0;
}

/** Payments waiting only for a member: a payer rule added later settles them on the next run. */
export async function waitingForMember(goalId: string) {
  const rows = await db.select({ ref: importReviews.ref }).from(importReviews).where(and(eq(importReviews.goalId, goalId), eq(importReviews.status, "pending"), isNull(importReviews.memberId)));
  return new Set(rows.map((r) => r.ref));
}
export const settleReview = (goalId: string, ref: string, memberId: string) => db.update(importReviews).set({ status: "confirmed", memberId, decidedAt: new Date() }).where(and(eq(importReviews.goalId, goalId), eq(importReviews.ref, ref)));

const reviewPayment = z.object({
  member: z.string().trim().max(40), // "" when no payer rule matched
  day: z.iso.date(),
  amount: z.number().int().positive().max(IMPORT_AMOUNT_MAX),
  ref: z.string().trim().min(1).max(80),
  msg: z.string().trim().max(60),
  payer: z.string().trim().max(80),
  job: z.string().trim().max(60),
});
const sendInput = z.object({ entry: entryKey, items: z.array(reviewPayment).max(GMAIL_IMPORT_MAX) });
/** Run now: sends what it found to the goal's Owners. A payment already recorded or queued is skipped. */
export async function sendToReview(viewer: Viewer, input: unknown) {
  const { entry, items } = parse(sendInput, input);
  if (!(await groupToEdit(viewer, entry))) throw new UserError("This goal does not keep its records on the server.");
  const goalId = TIMER_GOALS[entry];
  const known = await knownKeys(goalId), people = await peopleOf(goalId);
  let sent = 0;
  for (const p of items) {
    if (known.has(p.ref) || (p.msg && known.has(p.msg))) continue;
    known.add(p.ref);
    const memberId = people.find((m) => m.name === p.member)?.id ?? null;
    if (await queueImport({ goalId, memberId, day: p.day, amount: p.amount, ref: p.ref, messageId: p.msg || null, payer: p.payer, job: p.job, foundBy: viewer.id })) sent++;
  }
  return { sent };
}

/** One queued payment, for the goal's Owners only. The System Admin can see the queue but changes no group data. */
async function ownedReview(viewer: Viewer, id: string) {
  const [row] = await db.select({ review: importReviews, goal: goals }).from(importReviews).innerJoin(goals, eq(goals.id, importReviews.goalId)).where(eq(importReviews.id, id)).limit(1);
  if (!row) throw new UserError("This payment is no longer in the queue.");
  if (!devBypass && (await roleInGroup(viewer, row.goal.groupId)) !== "owner") throw new Forbidden("Only an Owner of this goal can decide on a payment.");
  return row;
}

const decideInput = z.object({ id: z.uuid(), action: z.enum(["confirm", "reject", "reopen"]) });
const DECIDED = { confirm: "confirmed", reject: "rejected", reopen: "pending" } as const;
/** Confirm adds the record; Reject keeps the payment out for good, unless an Owner reopens it. added false: nothing new was recorded. */
export async function decideReview(viewer: Viewer, input: unknown) {
  const { id, action } = parse(decideInput, input);
  const { goal } = await ownedReview(viewer, id);
  const expected = action === "reopen" ? "rejected" : "pending";
  return db.transaction(async (tx) => {
    // The status check is part of the write: of two decisions at once the second waits on the row, then matches nothing.
    const [review] = await tx.update(importReviews).set({ status: DECIDED[action], decidedBy: viewer.id, decidedAt: new Date() }).where(and(eq(importReviews.id, id), eq(importReviews.status, expected))).returning();
    if (!review) throw new UserError("Someone already decided on this payment. Refresh to see it.");
    if (action !== "confirm") {
      await audit({ actorId: viewer.id, action: `import.${action}`, groupId: goal.groupId, goalId: goal.id, detail: { ref: review.ref, amount: review.amount } }, tx);
      return { added: false };
    }
    if (!review.memberId) throw new UserError("Choose a member first."); // the throw undoes the status above
    return { added: await addImported({ goal, memberId: review.memberId, day: review.day, amount: review.amount, ref: review.ref, messageId: review.messageId, actorId: viewer.id }, tx) };
  });
}

const memberInput = z.object({ id: z.uuid(), member: z.string().trim().min(1).max(40) });
/** Correct: picks who a queued payment belongs to. */
export async function setReviewMember(viewer: Viewer, input: unknown) {
  const { id, member } = parse(memberInput, input);
  const { review } = await ownedReview(viewer, id);
  const person = (await peopleOf(review.goalId)).find((m) => m.name === member);
  if (!person) throw new UserError(`${member} does not take part in this goal.`);
  await db.update(importReviews).set({ memberId: person.id }).where(eq(importReviews.id, id));
}

export type ImportedRecord = { id: string; member: string; date: string; note: string; ref: string; amount: number; direction: "in"; kind: "deposit"; method: string };
export type ServerReview = { id: string; goalId: string; goal: string; job: string; amount: number; date: string; ref: string; payer: string; member: string; msg: string; found: string; status: ReviewState };
const NO_IMPORTS = { keys: [] as string[], records: [] as ImportedRecord[], review: [] as ServerReview[] };
/** What a goal holds from Gmail: its live records for the screens and, for Owners and the System Admin, its queue.
 *  withKeys, when a run starts: also the keys it must skip. A Member gets only their own records; someone outside the goal gets nothing. */
export async function goalImported(viewer: Viewer, entry: string, withKeys = false) {
  const goal = await timerGoalAccess(viewer, entry);
  if (!goal || (!devBypass && !goal.role)) return NO_IMPORTS;
  const { goalId, role } = goal;
  const manages = role === "owner" || role === "admin", ownOnly = !devBypass && !manages;
  const rows = await db.select({ id: records.id, member: users.name, day: records.day, note: records.note, ref: records.ref, amount: records.amount, method: records.method }).from(records).innerJoin(users, eq(users.id, records.memberId))
    .where(and(eq(records.goalId, goalId), eq(records.source, "import"), isNull(records.deletedAt), ownOnly ? eq(records.memberId, viewer.id) : undefined));
  const queue = manages ? await db.select({ review: importReviews, member: users.name }).from(importReviews).leftJoin(users, eq(users.id, importReviews.memberId)).where(eq(importReviews.goalId, goalId)).orderBy(desc(importReviews.foundAt)).limit(REVIEW_LIST_MAX) : [];
  const localId = entry.split("~")[1];
  return {
    keys: withKeys && !ownOnly ? [...(await knownKeys(goalId))] : [],
    records: rows.map((r): ImportedRecord => ({ id: r.id, member: r.member ?? "", date: r.day, note: r.note, ref: r.ref ?? "", amount: r.amount, direction: "in", kind: "deposit", method: r.method ?? "Bank transfer" })),
    review: queue.map(({ review: r, member }): ServerReview => ({ id: r.id, goalId: localId, goal: goal.name, job: r.job, amount: r.amount, date: r.day, ref: r.ref, payer: r.payer, member: member ?? "", msg: r.messageId ?? "", found: r.foundAt.toISOString(), status: STATE[r.status] })),
  };
}
