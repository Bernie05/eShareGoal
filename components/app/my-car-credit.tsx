"use client";

import { ArrowDownLeft, CalendarClock, PiggyBank, TriangleAlert } from "lucide-react";
import { StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { TX_KIND } from "@/components/app/approvals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MyGoalChart } from "@/components/screens/charts";
import { comingMonth, GroupStatusCard, label, useDues } from "./dues";
import { useMe, useViewAs } from "./view-as";
import { members } from "@/lib/demo-data";
import { fmtDate, peso } from "@/lib/money";
import { useCarCredit } from "./car-credit";
import { cn } from "@/lib/utils";

// Your own share, contributions, advance and transactions on Car Credit, with who in the group has paid.
// A Member's whole page; the Owner's "Your share" tab. The System Admin has none.

export function MyCarCreditView() {
  const me = useMe();
  const { transactions, monthly } = useCarCredit();
  const due = useDues().find((d) => d.name === me);
  const member = members.find((m) => m.name === me);
  const owner = useViewAs() === "owner";
  if (!due || !member) return null;

  // Your rows only: the sample history plus what was added in the app.
  const rows = transactions.filter((t) => t.memberId === member.id);
  const contributed = rows.filter((r) => r.type === "deposit" && r.status !== "reversed").reduce((s, r) => s + r.amount, 0);
  const chart = monthly.map((row) => ({ month: String(row.month), value: Number(row[member.id] ?? 0) }));
  const left = due.share - due.paid;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="You contributed" value={peso(contributed)} icon={ArrowDownLeft} tone="success" hint={`${rows.filter((r) => r.type === "deposit").length} deposits`} />
        <StatCard label={`Your ${label(comingMonth)} share`} value={due.status === "Paid" ? "Paid" : peso(left)} icon={CalendarClock} tone={due.status === "Paid" ? "success" : "warning"} hint={due.status === "Paid" ? peso(due.share) : `left of ${peso(due.share)}`} />
        <StatCard label="Your advance" value={peso(due.advance)} icon={PiggyBank} tone={due.advance ? "success" : undefined} hint={due.fromAdvance ? `${peso(due.fromAdvance)} goes to ${label(comingMonth)}` : "Paid above your share"} />
        <StatCard label="You are behind" value={peso(due.behind)} icon={TriangleAlert} tone={due.behind ? "danger" : undefined} hint={due.behind ? due.missed.join(", ") : "Up to date"} />
      </div>
      <Card><CardHeader><CardTitle>Your monthly contributions</CardTitle></CardHeader><CardContent><MyGoalChart data={chart} unit="peso" label="Your contributions" /></CardContent></Card>
      <GroupStatusCard />
      <Card>
        <CardHeader><CardTitle>Your transactions</CardTitle><CardDescription>{owner ? "Only yours. Everyone's are in the group dashboard below and in Transactions." : "Only yours. The group Owner sees everyone's."}</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">{rows.slice(0, 8).map((t) => (
            <li key={t.id} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[7rem_1fr_auto]">
              <span className="text-muted-foreground">{fmtDate(t.date)}</span>
              <span className="min-w-0"><span className="font-medium">{TX_KIND[t.type]}</span> · {t.method}{t.ref && <> · <span className="font-mono text-xs">{t.ref}</span></>}<span className="block truncate text-xs text-muted-foreground">{t.notes}</span></span>
              <span className="flex items-center gap-2 sm:justify-end">
                <span className={cn("num font-medium", t.type === "deposit" ? toneText.success : toneText.danger)}>{t.type === "deposit" ? "+" : "-"}{peso(t.amount)}</span>
                <StatusBadge status={t.status} />
              </span>
            </li>
          ))}</ul>
        </CardContent>
      </Card>
    </>
  );
}
