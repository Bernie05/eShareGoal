"use client";

import { useState } from "react";
import { Download, Receipt, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, toneText } from "@/components/app/primitives";
import { useGoalRecords } from "@/components/app/records";
import { useImported } from "@/components/app/imported-records";
import { CAR_CREDIT, CAR_CREDIT_ENTRY } from "@/lib/constants";
import { ReviewDialog, sampleApprovalGoals, TX_KIND } from "@/components/app/approvals";
import { useMe } from "@/components/app/view-as";
import { members, transactions, type TxStatus, type TxType } from "@/lib/demo-data";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";

// One row of the Transactions list: a demo transaction, or a member's submission the Owner approved (it has its receipt).
type Row = { id: string; date: string; member: string; type: TxType; method: string; ref?: string; source: Source; status: TxStatus; amount: number; note: string; proofOf?: string };
type Source = "manual" | "imported" | "submission";
const SOURCE: Record<Source, string> = { manual: "Manual", imported: "Imported", submission: "Member submission" };
const STATUS: Record<TxStatus, string> = { confirmed: "Confirmed", pending: "Pending", reversed: "Reversed" };
const PAGE = 10;
const blank = { q: "", member: "", type: "", status: "", source: "", from: "", to: "" };

interface TransactionsTableProps {
  goalId: string;
  onlyMine?: boolean;
}
/** onlyMine: a Member's page (decided on the server) lists only their own rows. */
export function TransactionsTable({ goalId, onlyMine = false }: TransactionsTableProps) {
  const approved = useGoalRecords(goalId);
  const imported = useImported(goalId === CAR_CREDIT ? CAR_CREDIT_ENTRY : null).records;
  const local = new Set(approved.map((r) => r.ref));
  const goal = sampleApprovalGoals().find((g) => g.id === goalId);
  const [f, setF] = useState(blank);
  const [page, setPage] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const me = useMe();

  const rows: Row[] = [
    ...approved.map((r): Row => ({
      id: r.id, date: r.date, member: r.member, type: r.kind ?? (r.direction === "out" ? "expense" : "deposit"), method: r.method ?? "-", ref: r.ref,
      source: r.proofOf ? "submission" : "manual", status: "confirmed", amount: r.amount, note: r.note, proofOf: r.proofOf,
    })),
    ...imported.filter((r) => !local.has(r.ref)).map((r): Row => ({ id: r.id, date: r.date, member: r.member, type: r.kind, method: r.method, ref: r.ref, source: "imported", status: "confirmed", amount: r.amount, note: r.note })),
    ...transactions.map((t): Row => ({ id: t.id, date: t.date, member: members.find((m) => m.id === t.memberId)?.name ?? "-", type: t.type, method: t.method, ref: t.ref, source: t.source, status: t.status, amount: t.amount, note: t.notes })),
  ].filter((r) => !onlyMine || r.member === me).sort((a, b) => b.date.localeCompare(a.date));

  const q = f.q.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (!q || [r.ref, r.note, r.member].some((x) => x?.toLowerCase().includes(q)))
    && (!f.member || r.member === f.member) && (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!f.source || r.source === f.source)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1); // stays valid when a filter shrinks the list
  const pageRows = shown.slice(at * PAGE, at * PAGE + PAGE);
  const filtered = JSON.stringify(f) !== JSON.stringify(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(0); };
  const dateErr = f.from && f.to && f.from > f.to ? "From must be on or before To." : "";

  function exportCsv() {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [["Date", "Member", "Type", "Method", "Reference", "Source", "Status", "Amount (PHP)", "Note"], ...shown.map((r) => [r.date, r.member, TX_KIND[r.type], r.method, r.ref ?? "", SOURCE[r.source], STATUS[r.status], `${r.type === "deposit" ? "" : "-"}${(r.amount / 100).toFixed(2)}`, r.note])];
    const url = URL.createObjectURL(new Blob([lines.map((l) => l.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${goalId}-transactions.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  const select = (id: string, label: string, k: keyof typeof blank, options: [string, string][]) => (
    <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><NativeSelect id={id} value={f[k]} onChange={set(k)}><option value="">All</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>
  );
  return (
    <>
      <Card><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="f-q">Search</Label><div className="relative"><Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden /><Input id="f-q" className="pl-8" placeholder="Reference, note or member" value={f.q} onChange={set("q")} /></div></div>
        {!onlyMine && select("f-m", "Member", "member", members.map((m) => [m.name, m.name]))}
        {select("f-t", "Type", "type", Object.entries(TX_KIND))}
        {select("f-s", "Status", "status", Object.entries(STATUS))}
        {select("f-src", "Source", "source", Object.entries(SOURCE))}
        <div className="space-y-1.5"><Label htmlFor="f-from">From</Label><Input id="f-from" type="date" value={f.from} onChange={set("from")} aria-invalid={!!dateErr} /></div>
        <div className="space-y-1.5"><Label htmlFor="f-to">To</Label><Input id="f-to" type="date" value={f.to} onChange={set("to")} aria-invalid={!!dateErr} /></div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          {dateErr && <p role="alert" className="flex-1 text-xs text-destructive">{dateErr}</p>}
          <span className="ml-auto flex gap-2">
            {filtered && <Button variant="ghost" onClick={() => { setF(blank); setPage(0); }}><X aria-hidden /> Clear filters</Button>}
            <Button variant="outline" onClick={exportCsv} disabled={!shown.length}><Download aria-hidden /> Export CSV</Button>
          </span>
        </div>
      </CardContent></Card>
      <Card><CardContent className="overflow-x-auto">
        {shown.length === 0 ? <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">No transactions match these filters. <Button variant="link" className="h-auto p-0" onClick={() => { setF(blank); setPage(0); }}>Clear filters</Button></p> : <>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{pageRows.map((t) => (
              <TableRow key={t.id} className={cn(t.status === "reversed" && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                <TableCell>{fmtDate(t.date)}</TableCell><TableCell>{t.member}</TableCell><TableCell>{TX_KIND[t.type]}</TableCell>
                <TableCell>{t.method}</TableCell><TableCell className="font-mono text-xs">{t.ref ?? "-"}</TableCell>
                <TableCell>{t.proofOf && goal ? <Button variant="link" className="h-auto p-0" onClick={() => setReceipt(t.proofOf!)}><Receipt aria-hidden /> {SOURCE[t.source]}</Button> : SOURCE[t.source]}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className={cn("num text-right font-medium", t.type === "deposit" ? toneText.success : toneText.danger)}>{t.type === "deposit" ? "+" : "-"}{peso(t.amount)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
            <span>Showing {at * PAGE + 1}-{at * PAGE + pageRows.length} of {shown.length}{filtered && ` (filtered from ${rows.length})`}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</Button></div>
          </div>
        </>}
      </CardContent></Card>
      {receipt && goal && <ReviewDialog key={receipt} goal={goal} id={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}
