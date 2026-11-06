"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Bell, Check, Hourglass, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, toneText } from "./primitives";
import { newRecordId, useGoalRecords, useGoalSubmissions, useSubmissionsAcross, writeRecords, writeSubmissions, type GoalRecord, type Submission } from "./records";
import { OwnerOnly, useAccount, useCreatedGoals, useCreatedGroups, useMe, useViewAs } from "./view-as";
import { roleIn } from "@/lib/accounts";
import { groups } from "@/lib/demo-data";
import type { CreatedGoal } from "@/lib/created-goals";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BASE_PATH, CAR_CREDIT, LOCALE } from "@/lib/constants";
import { ReviewList, useReviewQueue } from "./import-review";

// Members submit transactions with a receipt; the group Owner approves or rejects them. This works the same for
// goals made from a template and for the sample goals (Car Credit, Emergency Fund...), so every place that shows
// approvals (the goal page, the group page, the header bell) takes a list of these.
export type ApprovalGoal = {
  id: string; name: string; groupId: string; groupName: string; href: string;
  measure: "money" | "count"; unit?: string;
  sample?: boolean; // sample goals show fixed demo numbers, so an approval is kept but does not move their totals
};

export const approvalGoalOf = (g: CreatedGoal, groupName: string): ApprovalGoal => ({
  id: g.id, name: g.name, groupId: g.groupId, groupName, href: `${BASE_PATH}/my-goal?goal=${g.id}`,
  measure: g.template.measure === "count" ? "count" : "money", unit: g.values["Unit"] ?? g.values["Unit (kg, workouts…)"],
});

/** Sample goals that take transactions (loans and shared money), optionally only one group's. */
export const sampleApprovalGoals = (groupId?: string): ApprovalGoal[] =>
  groups.filter((gr) => !gr.archived && (!groupId || gr.id === groupId)).flatMap((gr) => gr.goals
    .filter((x) => x.type === "loan" || x.type === "shared_money")
    .map((x) => ({ id: x.id, name: x.name, groupId: gr.id, groupName: gr.name, measure: "money" as const, sample: true,
      href: `${BASE_PATH}/loan` })));

export const fmtSubmitted = (iso: string) => new Date(iso).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const subAmount = (goal: ApprovalGoal, s: Pick<Submission, "amount" | "direction">) =>
  goal.measure === "money" ? `${s.direction === "out" ? "-" : "+"}${peso(s.amount)}` : `${s.amount.toLocaleString(LOCALE)}${goal.unit ? ` ${goal.unit}` : ""}`;
const amountTone = (goal: ApprovalGoal, s: Submission) => goal.measure === "money" && (s.direction === "out" ? toneText.danger : toneText.success);
export const TX_KIND = { deposit: "Deposit", loan_payment: "Loan payment", expense: "Expense", withdrawal: "Withdrawal" } as const;
/** Reference and note in one line, for lists. */
const noteOf = (s: Submission) => [s.ref && `Ref ${s.ref}`, s.note].filter(Boolean).join(" · ");
export const pendingOf = (subs: Submission[]) => subs.filter((s) => s.status === "Pending").sort((a, b) => a.submitted.localeCompare(b.submitted)); // oldest first: review in order

type Pending = { goal: ApprovalGoal; s: Submission };
/** Everything waiting across these goals, oldest first. */
export function usePending(goals: ApprovalGoal[]): Pending[] {
  const byGoal = useSubmissionsAcross(goals.map((g) => g.id));
  return goals.flatMap((goal) => pendingOf(byGoal[goal.id] ?? []).map((s) => ({ goal, s }))).sort((a, b) => a.s.submitted.localeCompare(b.s.submitted));
}

interface ReviewDialogProps {
  goal: ApprovalGoal;
  id: string;
  onClose: () => void;
}
// ---------- The Owner checks the receipt, then approves (adds the record) or rejects it ----------
export function ReviewDialog({ goal, id, onClose }: ReviewDialogProps) {
  const me = useMe();
  const records = useGoalRecords(goal.id);
  const subs = useGoalSubmissions(goal.id);
  const s = subs.find((x) => x.id === id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  const pending = s.status === "Pending";
  const blocked = () => { setBusy(false); toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed."); };
  const decide = (status: "Approved" | "Rejected") => {
    const now = subs.find((x) => x.id === id);
    if (!now || now.status !== "Pending") { toast("This submission was already reviewed"); return onClose(); } // e.g. approved in another tab
    setBusy(true);
    const decided: Submission = { ...now, status, reviewedBy: me ?? "Owner", reviewed: new Date().toISOString(), reason: status === "Rejected" ? reason.trim().slice(0, 200) || undefined : undefined };
    if (status === "Approved") {
      // The value only changes here: the approved submission becomes a record, which every total and chart reads.
      const rec: GoalRecord = { id: newRecordId(), member: now.member, date: now.date, note: now.note, amount: now.amount, direction: now.direction, proofOf: now.id, kind: now.kind, method: now.method, ref: now.ref };
      if (!writeRecords(goal.id, [rec, ...records])) return blocked();
      if (!writeSubmissions(goal.id, subs.map((x) => (x.id === id ? { ...decided, recordId: rec.id } : x)))) { writeRecords(goal.id, records); return blocked(); } // undo, so the record is never added twice
      if (goal.sample && goal.id !== CAR_CREDIT) toast.success(`Approved · ${subAmount(goal, now)} from ${now.member}`, { description: "Sample goal: its totals are fixed demo numbers, so they do not change." });
      else toast.success(`Approved · ${subAmount(goal, now)} from ${now.member} added`);
    } else {
      if (!writeSubmissions(goal.id, subs.map((x) => (x.id === id ? decided : x)))) return blocked();
      toast(`Rejected · ${now.member} can see why`);
    }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{pending ? "Review transaction" : "Transaction receipt"}</DialogTitle><DialogDescription>{goal.name} · {s.member} · submitted {fmtSubmitted(s.submitted)}</DialogDescription></DialogHeader>
        <a href={s.proof} target="_blank" rel="noreferrer" className="block rounded-lg border bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Open the receipt full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
          <img src={s.proof} alt={`Receipt from ${s.member}`} className="mx-auto max-h-80 object-contain" />
        </a>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Amount</dt><dd className={cn("num text-right font-medium", amountTone(goal, s))}>{subAmount(goal, s)}</dd>
          <dt className="text-muted-foreground">Date</dt><dd className="text-right">{fmtDate(s.date)}</dd>
          {s.kind && <><dt className="text-muted-foreground">Type</dt><dd className="text-right">{TX_KIND[s.kind]}</dd></>}
          {s.method && <><dt className="text-muted-foreground">Payment method</dt><dd className="text-right">{s.method}</dd></>}
          {s.ref && <><dt className="text-muted-foreground">Reference</dt><dd className="text-right font-mono text-xs">{s.ref}</dd></>}
          {s.note && <><dt className="text-muted-foreground">Note</dt><dd className="text-right">{s.note}</dd></>}
          <dt className="text-muted-foreground">Status</dt><dd className="text-right"><StatusBadge status={s.status} /></dd>
          {s.reviewedBy && <><dt className="text-muted-foreground">{s.status === "Approved" ? "Approved by" : "Rejected by"}</dt><dd className="text-right">{s.reviewedBy}{s.reviewed && ` · ${fmtSubmitted(s.reviewed)}`}</dd></>}
          {s.reason && <><dt className="text-muted-foreground">Reason</dt><dd className="text-right">{s.reason}</dd></>}
        </dl>
        {pending && rejecting && <div className="space-y-1.5"><Label htmlFor="rev-reason">Why is it rejected? (optional, the member sees this)</Label><Textarea id="rev-reason" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The amount on the receipt is different" /></div>}
        <OwnerOnly fallback={<DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>}>
          <DialogFooter>
            {!pending ? <Button variant="outline" onClick={onClose}>Close</Button>
              : rejecting ? <><Button variant="outline" onClick={() => setRejecting(false)}>Back</Button><Button variant="destructive" disabled={busy} onClick={() => decide("Rejected")}>Reject transaction</Button></>
              : <><Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X aria-hidden /> Reject</Button><Button disabled={busy} onClick={() => decide("Approved")}><Check aria-hidden /> Approve and add</Button></>}
          </DialogFooter>
        </OwnerOnly>
      </DialogContent>
    </Dialog>
  );
}

interface CountProps {
  n: number;
}
const Count = ({ n }: CountProps) => n > 0 ? <span className="num min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs leading-5 text-white" aria-hidden>{n}</span> : null;

interface PendingTableProps {
  rows: Pending[];
  showGoal: boolean;
  onReview: (p: Pending) => void;
}
/** Table of submissions waiting for approval. With several goals it also says which goal each one is for. */
function PendingTable({ rows, showGoal, onReview }: PendingTableProps) {
  const owner = useViewAs() === "owner";
  if (!rows.length) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No pending approvals. Members&apos; new submissions show up here.</p>;
  return (
    <div className="max-h-[60vh] overflow-auto"><Table>
      <TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Member</TableHead>{showGoal && <TableHead>Goal</TableHead>}<TableHead className="text-right">Amount</TableHead><TableHead>Date</TableHead><TableHead>Note</TableHead><TableHead>Submitted</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((p) => (
        <TableRow key={p.s.id}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
          <TableCell><img src={p.s.proof} alt={`Receipt from ${p.s.member}`} className="size-10 rounded border object-cover" /></TableCell>
          <TableCell className="font-medium">{p.s.member}</TableCell>
          {showGoal && <TableCell><Link href={p.goal.href} className="underline-offset-4 hover:underline">{p.goal.name}</Link><span className="block text-xs text-muted-foreground">{p.goal.groupName}</span></TableCell>}
          <TableCell className={cn("num text-right", amountTone(p.goal, p.s))}>{subAmount(p.goal, p.s)}</TableCell>
          <TableCell className="num">{fmtDate(p.s.date)}</TableCell>
          <TableCell className="max-w-48 truncate text-muted-foreground">{noteOf(p.s) || "-"}</TableCell>
          <TableCell className="text-muted-foreground">{fmtSubmitted(p.s.submitted)}</TableCell>
          <TableCell className="text-right"><Button size="sm" variant={owner ? "default" : "outline"} onClick={() => onReview(p)}>{owner ? "Review" : "View"}</Button></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table></div>
  );
}

interface ApprovalsProps {
  goals: ApprovalGoal[];
  title?: string;
  variant?: "button" | "bell" | "chip";
  footer?: ReactNode;
  /** More to approve beside the submissions: how many, and the list. */
  extra?: { n: number; body: ReactNode };
}
/**
 * A trigger with the number of submissions waiting, which opens the pending table; Review opens one receipt.
 * The table steps aside while a submission is reviewed and comes back after it is approved or rejected.
 * variant "button": the goal page; "bell": the header notification; "chip": one goal's row on the group page.
 */
export function Approvals({ goals, title = "Pending approval", variant = "button", footer, extra }: ApprovalsProps) {
  const rows = usePending(goals);
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Pending | null>(null);
  const n = rows.length + (extra?.n ?? 0);
  const label = n ? `${title}, ${n} waiting` : `${title}, none waiting`;
  const many = new Set(goals.map((g) => g.id)).size > 1;
  const trigger: ReactNode =
    variant === "bell" ? <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label} onClick={() => setOpen(true)}><Bell aria-hidden />{n > 0 && <span className="num absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 text-white ring-2 ring-background" aria-hidden>{n}</span>}</Button>
    : variant === "chip" ? <Button variant={n ? "default" : "outline"} size="sm" aria-label={label} onClick={() => setOpen(true)}>{n ? `${n} ${n === 1 ? "request" : "requests"}` : "No requests"}</Button>
    : <Button variant="outline" aria-label={label} onClick={() => setOpen(true)}><Bell aria-hidden /> {many ? "Review all" : "Approvals"} <Count n={n} /></Button>;
  return (
    <>
      {trigger}
      <Dialog open={open && !reviewing} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{many ? `${goals.length} goals you own` : goals[0]?.name} · {n ? `${n} ${n === 1 ? "transaction is" : "transactions are"} waiting. Nothing counts until it is approved.` : "Nothing is waiting."}</DialogDescription></DialogHeader>
          {(rows.length > 0 || !extra?.n) && <PendingTable rows={rows} showGoal={many} onReview={setReviewing} />}
          {!!extra?.n && extra.body}
          <DialogFooter>{footer}<Button variant="outline" onClick={() => setOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {reviewing && <ReviewDialog key={reviewing.s.id} goal={reviewing.goal} id={reviewing.s.id} onClose={() => setReviewing(null)} />}
    </>
  );
}

interface GroupApprovalsProps {
  goals: ApprovalGoal[];
}
/** Group page section: every goal that takes transactions, with a button showing how many requests wait on it. */
export function GroupApprovals({ goals }: GroupApprovalsProps) {
  const total = usePending(goals).length;
  if (!goals.length) return null;
  return (
    <Card className={cn(total > 0 && "border-warning/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Hourglass className="size-4" aria-hidden />Pending approvals <Count n={total} /></CardTitle>
        <CardDescription>Transactions members submitted with a receipt. They count once you approve them.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">{goals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={g.href} className="font-medium underline-offset-4 hover:underline">{g.name}</Link>
            <Approvals goals={[g]} variant="chip" title={`${g.name} requests`} />
          </li>
        ))}</ul>
        {total > 1 && <div className="mt-3"><Approvals goals={goals} title="All pending approvals" /></div>}
      </CardContent>
    </Card>
  );
}

// ---------- Wrappers for server-rendered pages and the header (they pick the goals and the role themselves) ----------

interface SampleApprovalsProps {
  goalId: string;
}
/** Approvals button on a sample goal page, for its Owner (and the System Admin, read-only). */
export function SampleApprovals({ goalId }: SampleApprovalsProps) {
  const role = useViewAs();
  const goal = sampleApprovalGoals().find((g) => g.id === goalId);
  return goal && role !== "member" ? <Approvals goals={[goal]} /> : null;
}

interface SampleMySubmissionsProps {
  goalId: string;
}
/** A Member's submissions on a sample goal page. */
export function SampleMySubmissions({ goalId }: SampleMySubmissionsProps) {
  const role = useViewAs();
  const me = useMe();
  const goal = sampleApprovalGoals().find((g) => g.id === goalId);
  return goal && role === "member" ? <MySubmissionsCard goal={goal} me={me} /> : null;
}

/** Goals in one group that take transactions: its sample loans and funds, and goals made from a template (not checklists). */
function useGroupApprovalGoals(groupId: string, groupName: string) {
  const created = useCreatedGoals().filter((g) => g.groupId === groupId && g.template.measure !== "checklist").map((g) => approvalGoalOf(g, groupName));
  return [...sampleApprovalGoals(groupId), ...created];
}

interface GroupApprovalsForProps {
  groupId: string;
  groupName: string;
}
/** The group page's Pending approvals section. Members do not see it. */
export function GroupApprovalsFor({ groupId, groupName }: GroupApprovalsForProps) {
  const goals = useGroupApprovalGoals(groupId, groupName);
  return useViewAs() === "member" ? null : <GroupApprovals goals={goals} />;
}

/** Header notification bell: everything waiting in every group this account owns. */
export function ApprovalsBell() {
  const account = useAccount();
  const { pending } = useReviewQueue();
  const createdGroups = useCreatedGroups();
  const createdGoals = useCreatedGoals();
  const groupName = (id: string) => [...groups, ...createdGroups].find((g) => g.id === id)?.name ?? "Group";
  const owns = (groupId: string) => roleIn(account, groupId, createdGroups) === "owner";
  const goals = [
    ...sampleApprovalGoals().filter((g) => owns(g.groupId)),
    ...createdGoals.filter((g) => owns(g.groupId) && g.template.measure !== "checklist").map((g) => approvalGoalOf(g, groupName(g.groupId))),
  ];
  return <Approvals goals={goals} variant="bell" title="Pending approvals" extra={{ n: pending.length, body: <ReviewList items={pending} canReview /> }} footer={<Link href={`${BASE_PATH}/notifications`} className={buttonVariants({ variant: "ghost" })}>All notifications</Link>} />;
}

interface MySubmissionsCardProps {
  goal: ApprovalGoal;
  me: string | null;
}
/** A Member's own submissions on one goal, with the Owner's decision. */
export function MySubmissionsCard({ goal, me }: MySubmissionsCardProps) {
  const subs = useGoalSubmissions(goal.id);
  const [viewing, setViewing] = useState<string | null>(null);
  const mine = subs.filter((s) => s.member === me);
  const pending = pendingOf(mine);
  const decided = mine.filter((s) => s.status !== "Pending" && !s.dismissed).sort((a, b) => (b.reviewed ?? "").localeCompare(a.reviewed ?? "")).slice(0, 5);
  if (!pending.length && !decided.length) return null;
  const withdraw = (s: Submission) => { writeSubmissions(goal.id, subs.filter((x) => x.id !== s.id)); toast("Submission withdrawn"); };
  // Closing only hides it from this list; the Owner's decision and any approved record stay.
  const dismiss = (ids: string[]) => writeSubmissions(goal.id, subs.map((x) => (ids.includes(x.id) ? { ...x, dismissed: true } : x)));
  const row = (s: Submission) => (
    <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
      <img src={s.proof} alt="" className="size-10 shrink-0 rounded border object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">You · <span className="num">{subAmount(goal, s)}</span></span>
        <span className="block truncate text-xs text-muted-foreground">{fmtDate(s.date)}{noteOf(s) && ` · ${noteOf(s)}`}{s.reason && ` · Reason: ${s.reason}`}</span>
      </span>
      <StatusBadge status={s.status} />
      <span className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => setViewing(s.id)}>View</Button>
        {s.status === "Pending" ? <Button variant="ghost" size="sm" onClick={() => withdraw(s)}>Withdraw</Button>
          : <Button variant="ghost" size="icon-sm" aria-label={`Close ${subAmount(goal, s)} from ${fmtDate(s.date)}`} title="Close" onClick={() => dismiss([s.id])}><X aria-hidden /></Button>}
      </span>
    </li>
  );
  return (
    <Card className="border-warning/40">
      <CardHeader><CardTitle className="flex items-center gap-2"><Hourglass className="size-4" aria-hidden />Your submitted transactions</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {pending.length > 0 && <ul className="divide-y">{pending.map(row)}</ul>}
        {decided.length > 0 && <>
          <div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">Recently reviewed</p><Button variant="ghost" size="xs" onClick={() => dismiss(decided.map((s) => s.id))}>Clear all</Button></div>
          <ul className="divide-y">{decided.map(row)}</ul>
        </>}
      </CardContent>
      {viewing && <ReviewDialog key={viewing} goal={goal} id={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}
