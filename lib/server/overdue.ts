import "server-only";
import { and, eq, gt, lte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, goalMembers, goals, groups, records, users } from "@/lib/db/schema";
import { BUILT_IN_EMAILS, EMAIL_JOBS, renderEmail } from "@/lib/email-templates";
import { peso } from "@/lib/money";
import { BASE_PATH, LOCALE, TIME_ZONE } from "@/lib/constants";
import { appUrl, audit, mailTestTo, sendMail } from "./core";

// Overdue check: finds members of loan goals who have not paid their monthly share after the due date, and emails them.
// Run by the scheduler (app/api/jobs/overdue) and by Run now on the job. The due day is the day of the loan's start date.
// One notice per person per month: a notice only counts once it is really sent, so a failed send is tried again next run.
// A test email (MAIL_TEST_TO) never counts, so the check can be run again as often as needed.
const NOTICE = "overdue.notice";
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const dueIn = (y: number, m: number, day: number) => iso(y, m, Math.min(day, lastDay(y, m)));
const longDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(LOCALE, { ...opts, timeZone: "UTC" });

/** The newest due date that has passed, and the one before it. A payment counts for it from the day after the one before,
 *  so a late payment still clears it. Null while the loan's first due date has not passed. */
export function latestDue(startsOn: string, today: string) {
  const day = Number(startsOn.slice(8, 10));
  const y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7)) - 1;
  if (dueIn(y, m, day) >= today) m -= 1;
  const due = dueIn(y, m, day);
  if (due <= startsOn) return null;
  return { due, since: dueIn(y, m - 1, day) };
}

export type OverdueLine = { goal: string; member: string; email: string; month: string; amount: number; delivery: "sent" | "test" | "not-sent" | "already" };
export type OverdueReport = { goals: number; lines: OverdueLine[] };

/** today: an ISO date; by default today in the app's time zone. */
export async function runOverdueCheck(today = new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE })): Promise<OverdueReport> {
  const loans = await db.select({ goal: goals, group: groups.name, owner: users.name }).from(goals).innerJoin(groups, eq(goals.groupId, groups.id)).innerJoin(users, eq(goals.createdBy, users.id))
    .where(and(eq(goals.kind, "loan"), eq(goals.status, "active")));
  const template = BUILT_IN_EMAILS.find((t) => t.id === EMAIL_JOBS["overdue-check"])!;
  const lines: OverdueLine[] = [];
  for (const { goal, group, owner } of loans) {
    const period = goal.startsOn ? latestDue(goal.startsOn, today) : null;
    if (!period) continue;
    const members = await db.select({ id: users.id, name: users.name, email: users.email, share: goalMembers.share }).from(goalMembers).innerJoin(users, eq(goalMembers.userId, users.id))
      .where(and(eq(goalMembers.goalId, goal.id), eq(users.status, "active")));
    const paid = await db.select({ member: records.memberId, total: sql<string>`sum(${records.amount})` }).from(records)
      .where(and(eq(records.goalId, goal.id), eq(records.direction, "in"), isNull(records.deletedAt), gt(records.day, period.since), lte(records.day, today))).groupBy(records.memberId);
    const noticed = await db.select({ detail: auditLog.detail }).from(auditLog).where(and(eq(auditLog.action, NOTICE), eq(auditLog.goalId, goal.id)));
    const month = longDate(period.due, { month: "long", year: "numeric" });
    for (const m of members) {
      const owed = (m.share ?? 0) - Number(paid.find((p) => p.member === m.id)?.total ?? 0);
      if (owed <= 0 || !m.share || !m.email) continue;
      const line = { goal: goal.name, member: m.name ?? m.email, email: m.email, month, amount: owed };
      if (noticed.some((n) => n.detail.member === m.id && n.detail.due === period.due)) { lines.push({ ...line, delivery: "already" }); continue; }
      const mail = renderEmail(template, { member: line.member, month, amount: peso(owed), goal: goal.name, group, owner: owner ?? "Your group Owner", due_date: longDate(period.due, { month: "short", day: "numeric", year: "numeric" }), link: `${appUrl()}${BASE_PATH}` });
      const sent = await sendMail(m.email, mail.subject, mail.text ?? "");
      const testing = !!mailTestTo();
      if (sent && !testing) await audit({ actorId: null, action: NOTICE, groupId: goal.groupId, goalId: goal.id, detail: { member: m.id, due: period.due, amount: owed } });
      lines.push({ ...line, delivery: !sent ? "not-sent" : testing ? "test" : "sent" });
    }
  }
  return { goals: loans.length, lines };
}
