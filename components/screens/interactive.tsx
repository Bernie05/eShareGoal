"use client";

import { OwnerOnly, useViewAs } from "@/components/app/view-as";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import { StatusBadge, toneText } from "@/components/app/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { TransactionForm } from "./transaction-form";
import { byMember, candidates, members, type CandStatus, type Candidate } from "@/lib/demo-data";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";

export function AddTransactionDialog({ label = "Add transaction" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus aria-hidden /> {label}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Totals update as soon as you save. Confirmed records can later be corrected, never silently overwritten.</DialogDescription>
        </DialogHeader>
        <TransactionForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const typeLabel = { deposit: "Deposit", loan_payment: "Loan payment", expense: "Expense", withdrawal: "Withdrawal" } as const;

/** One accordion row per member; expanding shows that member's transactions. */
export function MemberContributions() {
  return (
    <Accordion className="rounded-xl border">
      <div className="hidden grid-cols-[1.4fr_1fr_.6fr_1fr_2rem] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid" aria-hidden>
        <span>Member</span><span>Total contributed</span><span>Records</span><span>Latest activity</span><span />
      </div>
      {byMember.map((b) => (
        <AccordionItem key={b.member.id} value={b.member.id} className="border-b last:border-b-0">
          <AccordionTrigger className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:no-underline sm:grid-cols-[1.4fr_1fr_.6fr_1fr_2rem]">
            <span className="flex items-center gap-2 font-medium">
              <Avatar size="sm"><AvatarFallback>{b.member.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              {b.member.name}<Badge variant="outline" className="font-normal">{b.member.role}</Badge>
            </span>
            <span className="num font-medium">{peso(b.total)}</span>
            <span className="text-sm text-muted-foreground">{b.count} deposits</span>
            <span className="text-sm text-muted-foreground">{fmtDate(b.latest)}</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <ul className="divide-y rounded-lg border bg-card">
              {b.txs.slice(0, 5).map((t) => (
                <li key={t.id} className="grid gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-[7rem_1fr_auto]">
                  <span className="text-muted-foreground">{fmtDate(t.date)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{typeLabel[t.type]}</span> · {t.method}{t.ref && <> · <span className="font-mono text-xs">{t.ref}</span></>}
                    <span className="block truncate text-xs text-muted-foreground">{t.notes} · {t.source === "imported" ? "Imported" : "Manual"}</span>
                  </span>
                  <span className="flex items-center gap-2 sm:justify-end">
                    <span className={cn("num font-medium", t.type === "deposit" ? toneText.success : toneText.danger)}>{t.type === "deposit" ? "+" : "-"}{peso(t.amount)}</span>
                    <StatusBadge status={t.status} />
                    <OwnerOnly><Button variant="ghost" size="icon-sm" aria-label={`Correct transaction ${t.ref ?? t.id}`}><Pencil aria-hidden /></Button></OwnerOnly>
                  </span>
                </li>
              ))}
            </ul>
            <OwnerOnly><div className="mt-2 flex justify-end"><AddTransactionDialog label={`Add for ${b.member.name}`} /></div></OwnerOnly>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/** Review queue. Confirm / reject / correct are local state here; the real app writes a record and an audit row. */
export function ImportQueue({ mode = "default" }: { mode?: "default" | "empty" }) {
  const canReview = useViewAs() === "owner";
  const [rows, setRows] = useState<Candidate[]>(mode === "empty" ? [] : candidates);
  const set = (id: string, patch: Partial<Candidate>) => setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const act = (c: Candidate, status: CandStatus) => {
    set(c.id, { status });
    toast(status === "Confirmed" ? "Confirmed. Dashboard totals would update now." : "Rejected. No record created.");
  };
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No candidates to review.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((c) => {
        const open = c.status === "Pending Review" || c.status === "Detected";
        return (
          <li key={c.id} className={cn("rounded-xl border bg-card p-4", c.ambiguous && open && "border-warning/50")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="num text-lg font-semibold">{c.amount ? peso(c.amount) : "Amount not found"}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(c.date)} · Ref {c.ref || "none"} · Acct ····{c.suffix || "n/a"} · <span className="font-mono">{c.msg}</span></p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Proposed member</dt><dd className={cn("font-medium", c.ambiguous && open && toneText.warning)}>{c.member}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Proposed goal</dt><dd className="font-medium">{c.goal}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Match confidence</dt><dd className="font-medium">{c.confidence}%</dd></div>
            </dl>
            <p className="mt-2 text-sm text-muted-foreground">{c.why}</p>
            {open && canReview && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={c.ambiguous} onClick={() => act(c, "Confirmed")}><Check aria-hidden /> Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => act(c, "Rejected")}><X aria-hidden /> Reject</Button>
                <CorrectDialog c={c} onSave={(m) => { set(c.id, { member: m, ambiguous: false, confidence: 100, why: "Corrected by reviewer" }); toast.success("Member set. You can confirm now."); }} />
                {c.ambiguous && <span className="self-center text-xs text-warning">Choose a member before confirming.</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CorrectDialog({ c, onSave }: { c: Candidate; onSave: (member: string) => void }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}><Pencil aria-hidden /> Correct</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct match</DialogTitle><DialogDescription>Reference {c.ref}. Assign the right member.</DialogDescription></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`m-${c.id}`}>Member</Label>
          <NativeSelect id={`m-${c.id}`} value={m} onChange={(e) => setM(e.target.value)}>
            <option value="">Select a member…</option>
            {members.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!m} onClick={() => { onSave(m); setOpen(false); }}>Save correction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
