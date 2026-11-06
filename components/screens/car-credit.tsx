"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarClock, Landmark, ListChecks, Wallet } from "lucide-react";
import { ProgressBar, StatCard, StatusBadge, Unavailable } from "@/components/app/primitives";
import { useCarCredit } from "@/components/app/car-credit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TODAY } from "@/lib/demo-data";
import { addMonths, fmtDate, peso } from "@/lib/money";

// Car Credit's loan figures, live: they move when the Owner records a deposit, a lender payment or an expense,
// or approves a member's submission. `group`: also the fund totals (Owner and System Admin only).
const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 86_400_000);

interface LoanStatsProps {
  group: boolean;
  noSchedule?: boolean;
}
export function LoanStats({ group, noSchedule = false }: LoanStatsProps) {
  const { totals, nextDue, loan } = useCarCredit();
  const na = <Unavailable why="No loan schedule is configured" />;
  const done = totals.installmentsDone >= loan.term;
  return (
    <div className={group ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
      {group && <>
        <StatCard label="Total Contributions" value={peso(totals.contributions)} icon={ArrowDownLeft} tone="success" hint="Deposited into the shared fund" />
        <StatCard label="Available Group Funds" value={peso(totals.available)} icon={Wallet} tone={totals.available < 0 ? "danger" : undefined} hint="Fund balance now (pending deposits included)" />
      </>}
      <StatCard label="Total Paid to Lender" value={noSchedule ? peso(0) : peso(totals.paidToLender)} icon={ArrowUpRight} tone="danger" hint="Confirmed lender payments" />
      <StatCard label="Installments Completed" value={noSchedule ? na : `${totals.installmentsDone}/${loan.term}`} icon={ListChecks} hint={noSchedule ? undefined : `${totals.pct}% of schedule`} />
      <StatCard label="Remaining Loan Balance" value={noSchedule ? na : peso(totals.remaining)} icon={Landmark} hint="From the configured schedule" />
      <StatCard label="Next Payment Due" value={noSchedule ? na : done ? "Paid off" : fmtDate(nextDue)} icon={CalendarClock} tone={noSchedule || done ? undefined : daysTo(nextDue) < 0 ? "danger" : "warning"}
        hint={noSchedule || done ? undefined : `${peso(loan.monthly)} · ${daysTo(nextDue) < 0 ? `${-daysTo(nextDue)} days overdue` : `in ${daysTo(nextDue)} days`}`} />
    </div>
  );
}

export function LoanProgress() {
  const { totals } = useCarCredit();
  return (
    <Card><CardContent className="space-y-2">
      <div className="flex justify-between text-sm"><span className="font-medium">Loan repayment progress</span><span className="num">{peso(totals.paid)} of {peso(totals.total)}</span></div>
      <ProgressBar value={totals.pct} label="Loan repayment progress" />
    </CardContent></Card>
  );
}

/** The last 3 paid installments and the next 3, and the latest lender payments. */
export function LoanSchedule() {
  const { totals, upcoming, lenderPayments, loan } = useCarCredit();
  const paid = totals.installmentsDone;
  const sched = [
    ...Array.from({ length: Math.min(3, paid) }, (_, i) => { const n = paid - Math.min(3, paid) + i + 1; return { n, date: addMonths(loan.firstDue, n - 1), paid: true }; }),
    ...upcoming.map((u) => ({ n: u.n, date: u.date, paid: false })),
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle><CardDescription>Next installments and the latest paid ones.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{sched.map((r) => (
              <TableRow key={r.n}><TableCell className="num">{r.n}</TableCell><TableCell>{fmtDate(r.date)}</TableCell><TableCell className="num text-right">{peso(loan.monthly)}</TableCell><TableCell><StatusBadge status={r.paid ? "Confirmed" : r.date < TODAY ? "Overdue" : "Upcoming"} /></TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative ml-2 space-y-3 border-l pl-5">
            {lenderPayments.slice(0, 5).map((t) => (
              <li key={t.id} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-success ring-4 ring-background" aria-hidden />
                <span className="font-medium">{t.notes || "Lender payment"}</span> <span className="num text-destructive">-{peso(t.amount)}</span><span className="block text-xs text-muted-foreground">{fmtDate(t.date)} · {t.method}{t.ref && ` · ${t.ref}`}</span></li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

/** Group goal card for Car Credit: the live progress bar and installment count. */
export function CarCreditCardProgress() {
  const { totals, loan } = useCarCredit();
  return (
    <>
      <ProgressBar value={totals.pct} label="Car Credit progress" />
      <div className="flex justify-between text-xs text-muted-foreground"><span>{totals.installmentsDone}/{loan.term} installments</span><span className="num font-medium text-foreground">{totals.pct}%</span></div>
    </>
  );
}
