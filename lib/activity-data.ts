import { groups, members, transactions, type Tx } from "./demo-data";
import { addMonths } from "./money";
import type { ViewAs } from "./view-as";

// FICTIONAL activity log across every group: one row per thing that happened, with who recorded it and its audit trail.
// Group Owners record everything (Family: Bernz, Friends: Carla); imports are confirmed by the Owner.
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
  return row({ at, groupId: "family", goalId: "car-credit", kind: kindOf[t.type], subject, by: "Bernz", amount: t.amount, detail: t.notes, status: statusOf[t.status], source: imported ? "Imported" : "Manual", ref: t.ref ?? null, audit });
});

const monthly = (from: string, count: number, make: (date: string, i: number) => Activity[]) =>
  Array.from({ length: count }, (_, i) => make(addMonths(from, i), i)).flat();

const other: Activity[] = [
  // Family > Emergency Fund: Bernz, Apr-Oct
  ...monthly("2026-04-20", 7, (d, i) => [row({ at: `${d}T19:05`, groupId: "family", goalId: "emergency-fund", kind: "Deposit", subject: "Bernz", by: "Bernz", amount: 600_000, detail: "Monthly share", status: "Confirmed", source: "Manual", ref: `DEMO-EF${String(i + 1).padStart(2, "0")}`, audit: [`${d} · Recorded by Bernz (BPI Transfer)`] })]),
  // Family > Grocery Budget: Babylyn and Billy only (Bernz did not join)
  ...monthly("2026-06-01", 5, (d, i) => ["Babylyn", "Billy"].map((who) => row({ at: `${d}T10:30`, groupId: "family", goalId: "grocery-budget", kind: "Deposit", subject: who, by: "Bernz", amount: 450_000, detail: "Grocery share", status: i === 4 && who === "Billy" ? "Pending" : "Confirmed", source: "Manual", ref: `DEMO-GR${who[1].toUpperCase()}${i + 1}`, audit: [`${d} · Recorded by Bernz (GCash)`] }))),
  // Family > Family Fitness
  ...["2026-10-22", "2026-10-20", "2026-10-15"].map((d, i) => row({ at: `${d}T06:30`, groupId: "family", goalId: "family-fitness", kind: "Progress log", subject: ["Billy", "Babylyn", "Bernz"][i], by: "Bernz", amount: null, detail: ["30-minute run", "Strength session", "Swim, 1 km"][i], status: "Confirmed", source: "Manual", ref: null, audit: [`${d} · Logged by Bernz`] })),
  // Friends > Vacation Fund: four members, Feb-Oct
  ...monthly("2026-02-15", 9, (d, i) => ["Bernz", "Carla", "Dino", "Ella"].map((who) => row({ at: `${d}T12:00`, groupId: "friends", goalId: "vacation-fund", kind: "Deposit", subject: who, by: "Carla", amount: 200_000, detail: "Monthly share", status: i === 8 && who === "Dino" ? "Pending" : "Confirmed", source: i % 3 === 0 ? "Imported" : "Manual", ref: `DEMO-VF${who[0]}${i + 1}`, audit: [`${d} · Recorded by Carla`] }))),
  // Friends > 30-Day Fitness Challenge
  ...["Bernz", "Dino", "Ella"].map((who, i) => row({ at: `2026-10-25T0${6 + i}:30`, groupId: "friends", goalId: "fitness-30", kind: "Progress log", subject: who, by: "Carla", amount: null, detail: "Day 12 check-in", status: "Confirmed", source: "Manual", ref: null, audit: ["2026-10-25 · Logged by Carla"] })),
  // Friends > Book Club (Bernz did not join)
  row({ at: "2026-10-05T20:00", groupId: "friends", goalId: "book-club", kind: "Goal change", subject: null, by: "Carla", amount: null, detail: "Goal paused: not enough readers this month", status: "Done", source: "Manual", ref: null, audit: ["2026-10-05 · Status Active → Paused by Carla"] }),
  // Imports that need a look
  row({ at: "2026-10-24T08:12", groupId: "family", goalId: "car-credit", kind: "Import", subject: "Bernz", by: "Gmail import", amount: 1_200_000, detail: "Same reference as an earlier email; not recorded twice", status: "Duplicate", source: "Imported", ref: "DEMO-BE2410", audit: ["2026-10-24 · Email msg-demo-7f3b matched DEMO-BE2410, already recorded", "2026-10-24 · Marked duplicate automatically"] }),
  row({ at: "2026-10-23T17:40", groupId: "family", goalId: "car-credit", kind: "Import", subject: null, by: "Gmail import", amount: 800_000, detail: "Member unclear: account suffix 7710 is on both Babylyn's and Billy's rules", status: "Pending", source: "Imported", ref: "DEMO-XX0991", audit: ["2026-10-23 · Email msg-demo-2c91 found", "2026-10-23 · Waiting for the Owner to choose the member"] }),
  row({ at: "2026-10-19T09:02", groupId: "family", goalId: null, kind: "Import", subject: null, by: "Gmail import", amount: null, detail: "Amount could not be read from the email body", status: "Rejected", source: "Imported", ref: null, audit: ["2026-10-19 · Email msg-demo-be05 could not be parsed", "2026-10-19 · Rejected by Bernz"] }),
  // Group-level changes
  row({ at: "2026-06-01T09:00", groupId: "family", goalId: "grocery-budget", kind: "Goal change", subject: null, by: "Bernz", amount: null, detail: "Goal created: ₱12,000 every month", status: "Done", source: "Manual", ref: null, audit: ["2026-06-01 · Created by Bernz"] }),
  row({ at: "2026-03-02T11:15", groupId: "family", goalId: null, kind: "Member change", subject: "Babylyn", by: "Bernz", amount: null, detail: "Role changed: Administrator → Member", status: "Done", source: "Manual", ref: null, audit: ["2026-03-02 · Role changed by Bernz"] }),
  row({ at: "2026-02-04T18:20", groupId: "friends", goalId: null, kind: "Member change", subject: "Migs", by: "Carla", amount: null, detail: "Joined with invite code FRN-3M8P-DEMO", status: "Done", source: "Manual", ref: null, audit: ["2026-02-04 · Invite accepted"] }),
];

export const activityLog: Activity[] = [...fromLedger, ...other].sort((a, b) => b.at.localeCompare(a.at));

// What each role may see: the System Admin sees every group; Owners and Members only the goals they joined
// (plus group-level rows of their groups). The server must apply this filter; the page only mirrors it.
const joinedGoals = new Set(groups.flatMap((g) => g.goals).filter((x) => x.joined).map((x) => x.id));
export const visibleActivity = (viewAs: ViewAs) =>
  viewAs === "admin" ? activityLog : activityLog.filter((a) => (a.goalId ? joinedGoals.has(a.goalId) : true));
