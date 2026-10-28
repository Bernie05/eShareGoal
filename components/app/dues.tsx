"use client";

import { CalendarClock, CircleCheck } from "lucide-react";
import { StatusBadge, toneText } from "@/components/app/primitives";
import { useGoalSubmissions, type Submission } from "@/components/app/records";
import { CAR_CREDIT, useCarCredit } from "./car-credit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { members, TODAY, type Tx } from "@/lib/demo-data";
import { addMonths, fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useMe, useViewAs } from "./view-as";
import { LastReminded, NotifyMembers } from "./notify";

// Car Credit only. Each member owes their monthly share on the 1st. Shares count from the first deposit month
// through the coming month. Approved member submissions and Owner-added deposits count as paid, in the month they are dated.
const FIRST_MONTH = "2025-11";
const ym = (d: string) => d.slice(0, 7);
export const comingMonth = ym(addMonths(ym(TODAY) + "-01", 1));
const monthsUntil = (last: string) => { const out: string[] = []; for (let m = FIRST_MONTH; m <= last; m = ym(addMonths(m + "-01", 1))) out.push(m); return out; };
const monthName = (m: string, year = false) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-PH", { month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" });
const isDeposit = (r: Submission) => r.kind ? r.kind === "deposit" : r.direction === "in";

export type Due = {
  id: string; name: string; share: number;
  paid: number;          // toward the coming month, including what the advance covers
  fromAdvance: number;   // the part of paid that comes from the advance
  status: "Paid" | "Partly paid" | "Not yet paid";
  advance: number;       // held in advance now; fromAdvance of it goes to the coming month
  behind: number;        // unpaid shares from earlier months
  missed: string[];      // those months, e.g. ["Mar", "Jul"]
  confirming: number;    // deposits waiting for confirmation (sample data)
  awaiting: number;      // submissions waiting for the Owner's approval
  thisMonth: { paid: number; confirming: boolean }; // what was paid in the current month, against the share
};

export const label = (k: string) => monthName(k, k.slice(0, 4) !== ym(TODAY).slice(0, 4));

/**
 * A ledger per member, month by month: the share is due each month.
 * Paying more than the share first settles months still owed (oldest first), then goes into the advance.
 * Paying less (or nothing) takes the rest from the advance; what the advance cannot cover is owed (behind).
 * A month whose deposit is still waiting for confirmation is left alone. The coming month uses the advance too.
 */
function dues(transactions: Tx[], submissions: Submission[], shares: Record<string, number>): Due[] {
  const past = monthsUntil(ym(TODAY));
  return members.map((m) => {
    const share = shares[m.id] ?? 0;
    const byMonth = new Map<string, number>();
    const add = (date: string, amount: number) => { const k = ym(date) < FIRST_MONTH ? FIRST_MONTH : ym(date); byMonth.set(k, (byMonth.get(k) ?? 0) + amount); };
    let confirming = 0;
    const pendingMonths = new Set<string>();
    for (const t of transactions) if (t.memberId === m.id && t.type === "deposit" && t.amount > 0) {
      if (t.status === "confirmed") add(t.date, t.amount);
      else if (t.status === "pending") { confirming += t.amount; pendingMonths.add(ym(t.date)); }
    }
    const awaiting = submissions.filter((s) => s.status === "Pending" && s.member === m.name && isDeposit(s)).reduce((s, x) => s + x.amount, 0);

    let advance = 0;
    const owed: { month: string; amount: number }[] = [];
    for (const k of past) {
      const paid = byMonth.get(k) ?? 0;
      if (paid >= share) {
        let extra = paid - share;
        for (const o of owed) { const used = Math.min(o.amount, extra); o.amount -= used; extra -= used; }
        advance += extra;
      } else if (!pendingMonths.has(k)) {
        const used = Math.min(advance, share - paid);
        advance -= used;
        if (share - paid - used > 0) owed.push({ month: k, amount: share - paid - used });
      }
    }
    // Paid ahead, dated after this month, counts toward the coming month like the advance does.
    const ahead = [...byMonth].filter(([k]) => k > ym(TODAY)).reduce((s, [, v]) => s + v, 0);
    const direct = Math.min(share, ahead);
    const fromAdvance = Math.min(share - direct, advance);
    advance += ahead - direct;
    const paid = direct + fromAdvance;
    const missed = owed.filter((o) => o.amount > 0);
    return {
      id: m.id, name: m.name, share, paid, fromAdvance, advance,
      status: paid >= share ? "Paid" : paid > 0 ? "Partly paid" : "Not yet paid",
      behind: missed.reduce((s, o) => s + o.amount, 0),
      missed: missed.map((o) => label(o.month)),
      confirming, awaiting,
      thisMonth: { paid: byMonth.get(ym(TODAY)) ?? 0, confirming: pendingMonths.has(ym(TODAY)) },
    };
  });
}

/** Everyone's ledger from the live Car Credit transactions (sample plus records saved in the app). */
export function useDues() {
  const { transactions, loan } = useCarCredit();
  return dues(transactions, useGoalSubmissions(CAR_CREDIT), loan.shares);
}

const shareDue = comingMonth + "-01";
const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 86_400_000);

/** Car Credit page: who has not paid the coming month's share yet, and who is behind from earlier months. */
export function DuesCard() {
  const list = useDues();
  const { nextDue, loan } = useCarCredit();
  const owner = useViewAs() === "owner";
  const me = useMe();
  const open = list.filter((d) => d.status !== "Paid");
  const toCollect = list.reduce((s, d) => s + d.share - d.paid, 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle>Shares due for {monthName(comingMonth, true)}</CardTitle>
          {owner && <NotifyMembers dues={list} month={comingMonth} />}
        </div>
        <CardDescription>
          Each member&apos;s share is due {fmtDate(shareDue)} (in {daysTo(shareDue)} days), before the {peso(loan.monthly)} installment on {fmtDate(nextDue)}. Every member gets an automatic reminder in their bell 10 days before (set in Group setup → Jobs){owner && "; use Notify to remind someone now"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={cn("flex items-center gap-2 text-sm font-medium", open.length ? toneText.warning : toneText.success)}>
          {open.length ? <CalendarClock className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
          {open.length ? `${open.length} of ${list.length} not yet paid · ${peso(toCollect)} still to collect` : "Everyone has paid this month's share"}
        </p>
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead className="text-right">Share</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead><TableHead>Earlier months</TableHead>{owner && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{list.map((d) => (
            <TableRow key={d.id}>
              <TableCell><span className="flex items-center gap-2 font-medium"><Avatar size="sm"><AvatarFallback>{d.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>{d.name}</span></TableCell>
              <TableCell className="num text-right">{peso(d.share)}</TableCell>
              <TableCell className="num text-right">{peso(d.paid)}{d.fromAdvance > 0 && <span className="block text-xs font-normal text-muted-foreground">{peso(d.fromAdvance)} from advance</span>}</TableCell>
              <TableCell>
                <StatusBadge status={d.status} />
                {d.awaiting > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{peso(d.awaiting)} waiting for approval</span>}
                <LastReminded name={d.name} month={comingMonth} />
              </TableCell>
              <TableCell className="text-sm">
                {d.behind > 0 && <span className={cn("block font-medium", toneText.danger)}>Behind {peso(d.behind)} · {d.missed.join(", ")}</span>}
                {d.confirming > 0 && <span className="block text-muted-foreground">{peso(d.confirming)} waiting for confirmation</span>}
                {!d.behind && !d.confirming && <span className="text-muted-foreground">Up to date</span>}
              </TableCell>
              {owner && <TableCell className="text-right">{(d.status !== "Paid" || d.behind > 0) && d.name !== me && <NotifyMembers dues={list} month={comingMonth} only={d.id} />}</TableCell>}
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** One line for the Car Credit goal card: who has not paid the coming month's share, and how many are behind.
 *  A Member sees only their own share. */
export function DuesHint() {
  const all = useDues();
  const me = useMe();
  const member = useViewAs() === "member";
  const list = member ? all.filter((d) => d.name === me) : all;
  if (member && !list.length) return null;
  const open = list.filter((d) => d.status !== "Paid");
  const behind = list.filter((d) => d.behind > 0);
  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-medium", open.length ? toneText.warning : toneText.success)}>
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {member
          ? `Your ${monthName(comingMonth)} share: ${list[0].status === "Paid" ? "paid" : `${peso(list[0].share - list[0].paid)} not yet paid`}`
          : open.length ? `${monthName(comingMonth)} share: ${open.map((d) => d.name).join(", ")} not yet paid` : `${monthName(comingMonth)} shares all paid`}
        {behind.length > 0 && <span className={toneText.danger}> · {member ? `behind ${peso(list[0].behind)}` : `${behind.length} behind`}</span>}
      </span>
    </p>
  );
}

/**
 * Every member's payment status, for everyone in the group to monitor: did they pay this month's share exactly,
 * more (the extra goes to their advance) or less, and are they ahead or behind overall. No totals or transactions.
 */
export function GroupStatusCard() {
  const list = useDues();
  const me = useMe();
  const now = ym(TODAY);
  const month = (d: Due) => {
    const { paid, confirming } = d.thisMonth;
    if (confirming) return "Waiting for confirmation";
    if (!paid) return "Not paid";
    return paid > d.share ? "Overpaid" : paid < d.share ? "Short" : "Paid";
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Group payment status</CardTitle>
        <CardDescription>What each member paid this month against their target. Advance is the difference: paid ₱15,000 on a ₱10,000 target is a ₱5,000 advance.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>{monthName(now)} share</TableHead><TableHead className="text-right">Target</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Advance</TableHead><TableHead>Overall</TableHead></TableRow></TableHeader>
          <TableBody>{list.map((d) => {
            const status = month(d);
            // Advance = paid - target for this month; below zero it is what is still missing.
            const diff = d.thisMonth.confirming ? 0 : d.thisMonth.paid - d.share;
            return (
              <TableRow key={d.id} className={cn(d.name === me && "bg-primary/5")}>
                <TableCell><span className="flex items-center gap-2 font-medium"><Avatar size="sm"><AvatarFallback>{d.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>{d.name}{d.name === me && <span className="text-xs font-normal text-muted-foreground">(you)</span>}</span></TableCell>
                <TableCell><StatusBadge status={status} /></TableCell>
                <TableCell className="num text-right">{peso(d.share)}</TableCell>
                <TableCell className="num text-right">{d.thisMonth.confirming ? <span className="text-muted-foreground">{peso(d.confirming)} pending</span> : peso(d.thisMonth.paid)}</TableCell>
                <TableCell className={cn("num text-right font-medium", diff > 0 ? toneText.success : diff < 0 ? toneText.warning : "text-muted-foreground")}>
                  {diff > 0 ? "+" : diff < 0 ? "−" : ""}{peso(Math.abs(diff))}
                  {diff < 0 && <span className="block text-xs font-normal text-muted-foreground">short</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {d.behind > 0 ? <span className={cn("font-medium", toneText.danger)}>Behind {peso(d.behind)}</span>
                    : <span className="text-muted-foreground">Up to date</span>}
                </TableCell>
              </TableRow>
            );
          })}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
