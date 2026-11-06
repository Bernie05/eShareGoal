import { groups, members, transactions, type Tx } from "./demo-data";
import { sampleGroupsFor, type Account } from "./accounts";
import { CAR_CREDIT } from "./constants";

// FICTIONAL activity log across every group: one row per thing that happened, with who recorded it and its audit trail.
// Group Owners record everything (Family: Bernz); imports are confirmed by the Owner.
export type ActivityKind = "Deposit" | "Loan payment" | "Expense" | "Withdrawal" | "Progress log" | "Import" | "Goal change" | "Member change";
export type ActivityStatus = "Confirmed" | "Pending" | "Reversed" | "Rejected" | "Duplicate" | "Done";
export type Activity = {
  id: string; at: string; groupId: string; groupName: string; goalId: string | null; goal: string;
  // subject: the person the record is about; null when it is about no one (goal changes, unmatched imports)
  kind: ActivityKind; subject: string | null; by: string; amount: number | null; detail: string;
  status: ActivityStatus; source: "Manual" | "Imported" | "System"; ref: string | null; audit: string[];
};
export const ISSUE_STATUSES: ActivityStatus[] = ["Pending", "Reversed", "Rejected", "Duplicate"];

const groupName = (id: string) => groups.find((g) => g.id === id)!.name;
const goalName = (id: string | null) => (id ? groups.flatMap((g) => g.goals).find((x) => x.id === id)!.name : "Whole group");
const kindOf: Record<Tx["type"], ActivityKind> = { deposit: "Deposit", loan_payment: "Loan payment", expense: "Expense", withdrawal: "Withdrawal" };
const statusOf: Record<Tx["status"], ActivityStatus> = { confirmed: "Confirmed", pending: "Pending", reversed: "Reversed" };

let seq = 0;
const row = (a: Omit<Activity, "id" | "groupName" | "goal">): Activity => ({ ...a, id: `act-${++seq}`, groupName: groupName(a.groupId), goal: goalName(a.goalId) });

// Family > Car Credit: straight from the ledger.
const fromLedger = transactions.map((t, i) => {
  const subject = members.find((m) => m.id === t.memberId)!.name;
  const at = `${t.date}T${String(8 + (i % 10)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`;
  const imported = t.source === "imported";
  const audit = [`${t.date} · ${imported ? `Found in a ${t.method} email, confirmed by Bernz` : `Recorded by Bernz (${t.method})`}`];
  if (t.status === "pending") audit.push(`${t.date} · Waiting for the bank email that confirms it`);
  if (t.status === "reversed") audit.push("2026-08-03 · Reversed by Bernz: entered twice. The original row is kept, a reversal row cancels it");
  return row({ at, groupId: "family", goalId: CAR_CREDIT, kind: kindOf[t.type], subject, by: "Bernz", amount: t.amount, detail: t.notes, status: statusOf[t.status], source: imported ? "Imported" : "Manual", ref: t.ref ?? null, audit });
});

const other: Activity[] = [
  // Imports that need a look
  row({ at: "2026-10-24T08:12", groupId: "family", goalId: CAR_CREDIT, kind: "Import", subject: "Bernz", by: "Gmail import", amount: 1_200_000, detail: "Same reference as an earlier email; not recorded twice", status: "Duplicate", source: "Imported", ref: "DEMO-BE2410", audit: ["2026-10-24 · Email msg-demo-7f3b matched DEMO-BE2410, already recorded", "2026-10-24 · Marked duplicate automatically"] }),
  row({ at: "2026-10-23T17:40", groupId: "family", goalId: CAR_CREDIT, kind: "Import", subject: null, by: "Gmail import", amount: 800_000, detail: "Member unclear: account suffix 7710 is on both Babylyn's and Billy's rules", status: "Pending", source: "Imported", ref: "DEMO-XX0991", audit: ["2026-10-23 · Email msg-demo-2c91 found", "2026-10-23 · Waiting for the Owner to choose the member"] }),
  row({ at: "2026-10-19T09:02", groupId: "family", goalId: null, kind: "Import", subject: null, by: "Gmail import", amount: null, detail: "Amount could not be read from the email body", status: "Rejected", source: "Imported", ref: null, audit: ["2026-10-19 · Email msg-demo-be05 could not be parsed", "2026-10-19 · Rejected by Bernz"] }),
  // Group-level changes
  row({ at: "2026-03-02T11:15", groupId: "family", goalId: null, kind: "Member change", subject: "Babylyn", by: "Bernz", amount: null, detail: "Role changed: Administrator → Member", status: "Done", source: "Manual", ref: null, audit: ["2026-03-02 · Role changed by Bernz"] }),
];

export const activityLog: Activity[] = [...fromLedger, ...other].sort((a, b) => b.at.localeCompare(a.at));

// What each account may see: the System Admin sees every group; a user only the goals they joined in their groups
// (plus group-level rows of those groups). The server must apply this filter; the page only mirrors it.
export function visibleActivity(account: Account) {
  if (account === "admin") return activityLog;
  const mine = sampleGroupsFor(account);
  const groupIds = new Set(mine.map((g) => g.id));
  const joined = new Set(mine.flatMap((g) => g.goals).filter((x) => x.joined).map((x) => x.id));
  return activityLog.filter((a) => groupIds.has(a.groupId) && (a.goalId ? joined.has(a.goalId) : true));
}

