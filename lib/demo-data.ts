import { addMonths, fmtDate, loanSummary, peso } from "./money";
import type { ViewAs } from "./view-as";

// FICTIONAL DEMO DATA. Amounts in integer centavos. Reference date for the preview: 2026-10-25.
export const TODAY = "2026-10-25";

// Group roles: the Owner changes anything in the group and its goals; a Member can only view. (System Admin is a site role, see lib/view-as.ts.)
export type GroupRole = "Owner" | "Member";
export type Member = { id: string; name: string; role: GroupRole; color: string };
export const members: Member[] = [
  { id: "bernz", name: "Bernz", role: "Owner", color: "var(--chart-1)" },
  { id: "babylyn", name: "Babylyn", role: "Member", color: "var(--chart-2)" },
  { id: "billy", name: "Billy", role: "Member", color: "var(--chart-3)" },
];

export type TxType = "deposit" | "loan_payment" | "expense" | "withdrawal";
export type TxStatus = "confirmed" | "pending" | "reversed";
export type Tx = {
  id: string; memberId: string; amount: number; type: TxType; date: string;
  method: "BPI Transfer" | "GCash" | "Cash"; ref?: string; status: TxStatus;
  source: "manual" | "imported"; notes: string;
};

// 12 months of deposits (Nov 2025 - Oct 2026) and 11 lender payments (Dec 2025 - Oct 2026).
const deposits: Tx[] = [];
const split: Record<string, number> = { bernz: 1_200_000, babylyn: 800_000, billy: 600_000 };
for (let m = 0; m < 12; m++) {
  const date = addMonths("2025-11-01", m);
  for (const mem of members) {
    if (mem.id === "billy" && (m === 4 || m === 8)) continue; // Billy missed two months
    const pending = m === 11 && mem.id === "billy";
    deposits.push({
      id: `d-${mem.id}-${m}`, memberId: mem.id, amount: split[mem.id], type: "deposit", date,
      method: mem.id === "billy" ? "GCash" : "BPI Transfer",
      ref: `DEMO-${mem.id.slice(0, 2).toUpperCase()}${String(m + 1).padStart(2, "0")}`,
      status: pending ? "pending" : "confirmed", source: m % 3 === 0 ? "imported" : "manual",
      notes: pending ? "Waiting for email confirmation" : "Monthly share",
    });
  }
}
const payments: Tx[] = Array.from({ length: 11 }, (_, i) => ({
  id: `p-${i}`, memberId: "bernz", amount: 2_400_000, type: "loan_payment" as const,
  date: addMonths("2025-12-05", i), method: "BPI Transfer" as const, ref: `DEMO-LND${String(i + 1).padStart(2, "0")}`,
  status: "confirmed" as const, source: "manual" as const, notes: `Installment ${i + 1}/60`,
}));
const expenses: Tx[] = [
  { id: "e-1", memberId: "babylyn", amount: 1_850_000, type: "expense", date: "2026-01-12", method: "GCash", ref: "DEMO-INS01", status: "confirmed", source: "manual", notes: "Comprehensive insurance (annual)" },
  { id: "e-2", memberId: "bernz", amount: 320_000, type: "expense", date: "2026-03-20", method: "Cash", status: "confirmed", source: "manual", notes: "Vehicle registration" },
  { id: "e-3", memberId: "billy", amount: 480_000, type: "expense", date: "2026-08-02", method: "Cash", status: "reversed", source: "manual", notes: "Entered twice, reversed (see audit history)" },
];
export const transactions: Tx[] = [...deposits, ...payments, ...expenses].sort((a, b) => b.date.localeCompare(a.date));

const live = transactions.filter((t) => t.status !== "reversed"); // pending counts toward funds (decision)
const sum = (xs: Tx[]) => xs.reduce((s, t) => s + t.amount, 0);
export const loan = { monthly: 2_400_000, term: 60, firstDue: "2025-12-05" };
const paidCount = live.filter((t) => t.type === "loan_payment" && t.status === "confirmed").length;
export const nextDue = addMonths(loan.firstDue, paidCount);

const contributions = sum(live.filter((t) => t.type === "deposit"));
const paidToLender = sum(live.filter((t) => t.type === "loan_payment" && t.status === "confirmed"));
const otherOut = sum(live.filter((t) => t.type === "expense" || t.type === "withdrawal"));
export const totals = {
  contributions,
  paidToLender,
  otherOut,
  available: contributions - paidToLender - otherOut,
  installmentsDone: paidCount,
  ...loanSummary(loan.monthly, loan.term, paidCount),
};

export const byMember = members.map((m) => {
  const mine = transactions.filter((t) => t.memberId === m.id && t.type === "deposit" && t.status !== "reversed");
  return { member: m, total: sum(mine), count: mine.length, latest: mine[0]?.date ?? "", txs: transactions.filter((t) => t.memberId === m.id) };
});

const ym = (d: string) => d.slice(0, 7);
export const monthly = Array.from({ length: 12 }, (_, i) => {
  const key = ym(addMonths("2025-11-01", i));
  const row: Record<string, number | string> = { month: new Date(key + "-01T00:00:00Z").toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" }) };
  for (const m of members) row[m.id] = live.filter((t) => t.type === "deposit" && t.memberId === m.id && ym(t.date) === key).reduce((s, t) => s + t.amount, 0) / 100;
  row.incoming = live.filter((t) => t.type === "deposit" && ym(t.date) === key).reduce((s, t) => s + t.amount, 0) / 100;
  row.outgoing = live.filter((t) => t.type !== "deposit" && ym(t.date) === key).reduce((s, t) => s + t.amount, 0) / 100;
  return row;
});

export const upcoming = [0, 1, 2].map((i) => ({ n: paidCount + i + 1, date: addMonths(loan.firstDue, paidCount + i), amount: loan.monthly }));

// --- Groups & goals ---
export type GoalType = "shared_money" | "loan" | "fitness" | "tasks" | "custom";
export type Goal = { id: string; name: string; type: GoalType; status: "Active" | "Paused" | "Completed" | "Archived"; progress: number; metric: string; last: string; joined: boolean; info?: GoalInfo };
// What a non-participant may see about a goal: its purpose, who joined and when it started. No progress or money.
export type GoalInfo = { about: string; target: string; started: string; joinedBy: string[] };
export type Group = { id: string; name: string; description: string; members: number; created: string; goals: Goal[]; archived?: boolean };
export const groups: Group[] = [
  { id: "family", name: "Family", description: "Household money and health goals.", members: 3, created: "2025-10-18", goals: [
    { id: "car-credit", name: "Car Credit", type: "loan", status: "Active", progress: totals.pct, metric: `${totals.installmentsDone}/60 installments`, last: "2 days ago", joined: true },
    { id: "emergency-fund", name: "Emergency Fund", type: "shared_money", status: "Active", progress: 42, metric: "₱126,000 of ₱300,000", last: "5 days ago", joined: true },
    { id: "family-fitness", name: "Family Fitness", type: "fitness", status: "Active", progress: 60, metric: "3 of 5 weekly workouts", last: "Today", joined: true },
    { id: "grocery-budget", name: "Grocery Budget", type: "shared_money", status: "Active", progress: 75, metric: "₱9,000 of ₱12,000 this month", last: "3 days ago", joined: false,
      info: { about: "One shared budget for the weekly grocery run, so no one pays more than their share.", target: "₱12,000 every month", started: "2026-06-01", joinedBy: ["Babylyn", "Billy"] } },
  ] },
  { id: "friends", name: "Friends", description: "Trips and challenges with the barkada.", members: 5, created: "2026-02-03", goals: [
    { id: "vacation-fund", name: "Vacation Fund", type: "shared_money", status: "Active", progress: 68, metric: "₱68,000 of ₱100,000", last: "Yesterday", joined: true },
    { id: "fitness-30", name: "30-Day Fitness Challenge", type: "fitness", status: "Active", progress: 40, metric: "Day 12 of 30", last: "Today", joined: true },
    { id: "book-club", name: "Book Club: 12 Books", type: "tasks", status: "Paused", progress: 25, metric: "3 of 12 books", last: "3 weeks ago", joined: false,
      info: { about: "Read one book a month together and meet on the last Sunday to talk about it.", target: "12 books in 12 months", started: "2026-07-01", joinedBy: ["Carla", "Ella", "Migs"] } },
  ] },
  { id: "old-team", name: "Office Project Team", description: "Closed in September.", members: 4, created: "2025-11-02", archived: true, goals: [] },
];

// --- Import candidates (mock Gmail, fictional) ---
export type CandStatus = "Detected" | "Pending Review" | "Confirmed" | "Rejected" | "Duplicate" | "Error";
export type Candidate = { id: string; amount: number; date: string; ref: string; suffix: string; member: string; goal: string; confidence: number; why: string; status: CandStatus; msg: string; ambiguous?: boolean };
export const candidates: Candidate[] = [
  { id: "c1", amount: 1_200_000, date: "2026-10-24", ref: "DEMO-BE2410", suffix: "4821", member: "Bernz", goal: "Car Credit", confidence: 96, why: "Account suffix 4821 and alias B. Santos match Bernz", status: "Pending Review", msg: "msg-demo-7f3a" },
  { id: "c2", amount: 800_000, date: "2026-10-23", ref: "DEMO-XX0991", suffix: "7710", member: "Babylyn or Billy?", goal: "Car Credit", confidence: 54, why: "Suffix 7710 is on two members' rules; choose one", status: "Pending Review", msg: "msg-demo-2c91", ambiguous: true },
  { id: "c3", amount: 1_200_000, date: "2026-10-24", ref: "DEMO-BE2410", suffix: "4821", member: "Bernz", goal: "Car Credit", confidence: 96, why: "Same reference as the first candidate", status: "Duplicate", msg: "msg-demo-7f3b" },
  { id: "c4", amount: 600_000, date: "2026-10-20", ref: "DEMO-BI2410", suffix: "3302", member: "Billy", goal: "Emergency Fund", confidence: 91, why: "Alias Billy S. matches", status: "Confirmed", msg: "msg-demo-aa10" },
  { id: "c5", amount: 0, date: "2026-10-19", ref: "", suffix: "", member: "Unknown", goal: "-", confidence: 0, why: "Amount could not be parsed from the email body", status: "Error", msg: "msg-demo-be05" },
];

export const stateOf = (s?: string) => (s === "loading" || s === "empty" || s === "error" ? s : "default") as "default" | "loading" | "empty" | "error";

// --- Dashboard: each group you joined, and inside it a small dashboard per goal (you = Bernz) ---
export const ME = "bernz";
export type GoalPoint = { month: string; value: number };
export type MyGoalDetail = {
  id: string; name: string; type: GoalType; progress: number; metric: string;
  stats: { label: string; value: string; hint: string }[];
  chart: { title: string; unit: "peso" | "count"; data: GoalPoint[] };
  recent: [string, string][];
};
export type MyGroupActivity = { groupId: string; last: string; goals: MyGoalDetail[] };

const monthLabels = monthly.map((r) => String(r.month));
const series = (values: number[]): GoalPoint[] => monthLabels.map((month, i) => ({ month, value: values[i] ?? 0 }));
const myDeposits = live.filter((t) => t.memberId === ME && t.type === "deposit");
const myPut = sum(myDeposits);
const myByMonth = monthLabels.map((_, i) => sum(myDeposits.filter((t) => t.date.startsWith(addMonths("2025-11-01", i).slice(0, 7)))) / 100);
const goal = (groupId: string, id: string) => groups.find((g) => g.id === groupId)!.goals.find((x) => x.id === id)!;
const base = (groupId: string, id: string) => { const g = goal(groupId, id); return { id, name: g.name, type: g.type, progress: g.progress, metric: g.metric }; };

export const myActivity: MyGroupActivity[] = [
  {
    groupId: "family", last: "Yesterday, 9:14 AM",
    goals: [
      {
        ...base("family", "car-credit"),
        stats: [
          { label: "You put in", value: peso(myPut), hint: `${Math.round((myPut / totals.contributions) * 100)}% of all deposits, incl. pending` },
          { label: "Installments paid", value: `${paidCount}/60`, hint: "Paid to the lender monthly" },
          { label: "Next due", value: fmtDate(nextDue), hint: peso(loan.monthly) },
        ],
        chart: { title: "Your deposits per month", unit: "peso", data: series(myByMonth) },
        recent: [["Deposit of ₱12,000.00 recorded", "Yesterday, 9:14 AM"], ["Installment 11/60 paid to the lender", "Oct 5"], ["Confirmed Billy's imported deposit", "Oct 3"]],
      },
      {
        ...base("family", "emergency-fund"),
        stats: [
          { label: "You put in", value: peso(4_200_000), hint: "33% of the fund" },
          { label: "Fund so far", value: peso(12_600_000), hint: `of ${peso(30_000_000)} target` },
          { label: "Deposits you made", value: "7", hint: "Since April" },
        ],
        chart: { title: "Your deposits per month", unit: "peso", data: series([0, 0, 0, 0, 0, 6000, 6000, 6000, 6000, 6000, 6000, 6000]) },
        recent: [["Deposit of ₱6,000.00 recorded", "Oct 20"], ["Deposit of ₱6,000.00 recorded", "Sep 20"]],
      },
      {
        ...base("family", "family-fitness"),
        stats: [
          { label: "Workouts this month", value: "5", hint: "Logged by you" },
          { label: "This week", value: "3 of 5", hint: "Weekly target" },
          { label: "Streak", value: "4 weeks", hint: "Weeks with at least 3 workouts" },
        ],
        chart: { title: "Your workouts per month", unit: "count", data: series([0, 0, 0, 0, 0, 0, 2, 4, 5, 4, 6, 5]) },
        recent: [["Logged a 30-minute run", "Oct 22"], ["Logged a strength session", "Oct 20"]],
      },
    ],
  },
  {
    groupId: "friends", last: "Today, 6:30 AM",
    goals: [
      {
        ...base("friends", "vacation-fund"),
        stats: [
          { label: "You put in", value: peso(1_800_000), hint: "26% of the fund" },
          { label: "Fund so far", value: peso(6_800_000), hint: `of ${peso(10_000_000)} target` },
          { label: "Deposits you made", value: "9", hint: "Since February" },
        ],
        chart: { title: "Your deposits per month", unit: "peso", data: series([0, 0, 0, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]) },
        recent: [["Deposit of ₱2,000.00 recorded", "Oct 15"], ["Deposit of ₱2,000.00 recorded", "Sep 15"]],
      },
      {
        ...base("friends", "fitness-30"),
        stats: [
          { label: "Day", value: "12 of 30", hint: "Challenge started Oct 14" },
          { label: "Your check-ins", value: "12/12", hint: "No missed days" },
          { label: "Group rank", value: "1st of 5", hint: "By check-ins" },
        ],
        chart: { title: "Your check-ins per month", unit: "count", data: series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12]) },
        recent: [["Checked in on day 12", "Today, 6:30 AM"], ["Checked in on day 11", "Yesterday"]],
      },
    ],
  },
];

// --- Group overview details per group (Family figures come from the ledger above) ---
export type GroupDetail = { funds: number; invite: string; others: string[]; ownerIfYouAreMember: string; activity: [string, string, string][] };
export const groupDetails: Record<string, GroupDetail> = {
  family: {
    funds: totals.available, invite: "FAM-7K2Q-DEMO",
    others: ["Babylyn", "Billy"], ownerIfYouAreMember: "Babylyn",
    activity: [
      ["Bernz", "added a deposit of ₱12,000.00 to Car Credit", "Yesterday, 9:14 AM"],
      ["Bernz", "confirmed Babylyn's imported deposit", "2 days ago"],
      ["Bernz", "recorded Billy's workout in Family Fitness", "Today, 6:30 AM"],
      ["Bernz", "paid installment 11/60 to the lender", "Oct 5"],
    ],
  },
  friends: {
    funds: 6_800_000, invite: "FRN-3M8P-DEMO",
    others: ["Carla", "Dino", "Ella", "Migs"], ownerIfYouAreMember: "Carla",
    activity: [
      ["Carla", "recorded Bernz's day 12 check-in", "Today, 6:30 AM"],
      ["Carla", "recorded Ella's deposit of ₱2,000.00 to Vacation Fund", "Yesterday"],
      ["Carla", "paused Book Club: 12 Books", "3 weeks ago"],
      ["Carla", "recorded Dino's day 11 check-in", "Yesterday"],
    ],
  },
};

// Members list for the "view as" role. Bernz is the Owner unless you preview as a Member; the System Admin is never in this list.
export const rosterFor = (d: GroupDetail, viewAs: ViewAs): { name: string; role: GroupRole; you: boolean }[] => [
  { name: "Bernz", role: viewAs === "member" ? "Member" : "Owner", you: viewAs !== "admin" },
  ...d.others.map((name) => ({ name, role: (viewAs === "member" && name === d.ownerIfYouAreMember ? "Owner" : "Member") as GroupRole, you: false })),
];
