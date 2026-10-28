"use client";

import { OwnerOnly, useViewAs } from "@/components/app/view-as";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ImageUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { StatusBadge, toneText } from "@/components/app/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { TransactionForm } from "./transaction-form";
import { candidates, members, type CandStatus, type Candidate, type Tx } from "@/lib/demo-data";
import { useCarCredit, useCarCreditEditor } from "@/components/app/car-credit";
import { newRecordId, readRecords, writeRecords, type TxPatch } from "@/components/app/records";
import { saveReviewItems, useReviewItems, type ReviewItem } from "@/components/app/import-store";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";

// Owners add transactions directly. Members submit theirs with a receipt for the Owner to approve. The System Admin only views.
// goalId: the sample goal the transaction is saved to. memberId: who it is for, when opened from a member's row.
export function AddTransactionDialog({ label = "Add transaction", goalId, memberId }: { label?: string; goalId: string; memberId?: string }) {
  const [open, setOpen] = useState(false);
  const role = useViewAs();
  if (role === "admin") return null;
  const submit = role === "member";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>{submit ? <><ImageUp aria-hidden /> Submit a transaction</> : <><Plus aria-hidden /> {label}</>}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{submit ? "Submit a transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>{submit ? "Attach the receipt. The group Owner checks it, and it counts once they approve it." : "It is saved as confirmed and shows in Transactions right away. Records can later be corrected, never silently overwritten."}</DialogDescription>
        </DialogHeader>
        <TransactionForm goalId={goalId} submit={submit} memberId={memberId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const typeLabel = { deposit: "Deposit", loan_payment: "Loan payment", expense: "Expense", withdrawal: "Withdrawal" } as const;

/** One accordion row per member; expanding shows that member's transactions. */
export function MemberContributions() {
  const { byMember } = useCarCredit();
  const { save, remove } = useCarCreditEditor();
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
                    <span className="block truncate text-xs text-muted-foreground">{t.notes} · {t.source === "imported" ? "Imported" : t.source === "submission" ? "Member submission" : "Manual"}</span>
                  </span>
                  <span className="flex items-center gap-2 sm:justify-end">
                    <span className={cn("num font-medium", t.type === "deposit" ? toneText.success : toneText.danger)}>{t.type === "deposit" ? "+" : "-"}{peso(t.amount)}</span>
                    <StatusBadge status={t.status} />
                    <OwnerOnly><EditTxDialog tx={t} save={save} /><DeleteTxDialog tx={t} remove={remove} /></OwnerOnly>
                  </span>
                </li>
              ))}
            </ul>
            <OwnerOnly><div className="mt-2 flex justify-end"><AddTransactionDialog goalId="car-credit" memberId={b.member.id} label={`Add for ${b.member.name}`} /></div></OwnerOnly>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

const txName = (t: Tx) => `${typeLabel[t.type].toLowerCase()} of ${peso(t.amount)} on ${fmtDate(t.date)}`;

function EditTxDialog({ tx, save }: { tx: Tx; save: (id: string, p: TxPatch) => boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${txName(tx)}`} />}><Pencil aria-hidden /></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Edit transaction</DialogTitle><DialogDescription>Fix a wrong amount, date, member or type. Totals and shares update right away.</DialogDescription></DialogHeader>
        {open && <TransactionForm goalId="car-credit" edit={{ tx, save: (p) => save(tx.id, p) }} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function DeleteTxDialog({ tx, remove }: { tx: Tx; remove: (id: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const del = () => {
    if (!remove(tx.id)) return void toast.error("Could not delete. This browser's storage is full or blocked (private mode), and nothing was changed.");
    toast.success("Transaction deleted");
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${txName(tx)}`} />}><Trash2 aria-hidden /></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete this transaction?</DialogTitle><DialogDescription>The {txName(tx)} is removed and no longer counts toward totals or shares.</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={del}><Trash2 aria-hidden /> Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Payments a Gmail import job sent here (Run now). Confirming one adds a record to its goal, so totals change for real. */
function JobReviewItems({ canReview }: { canReview: boolean }) {
  const items = useReviewItems();
  const set = (id: string, patch: Partial<ReviewItem>) => saveReviewItems(items.map((x) => (x.id === id ? { ...x, ...patch } : x))) || (toast.error("Could not save. This browser's storage is full or blocked."), false);
  const confirm = (r: ReviewItem) => {
    const recordId = newRecordId();
    const rec = { id: recordId, member: r.member, date: r.date, note: `Gmail import · ${r.ref}`, ref: r.ref, amount: r.amount, direction: "in" as const, kind: "deposit" as const, method: "Bank transfer" };
    if (!writeRecords(r.goalId, [rec, ...readRecords(r.goalId)])) return void toast.error("Could not save. This browser's storage is full or blocked.");
    if (set(r.id, { status: "Confirmed", recordId })) toast.success(`Confirmed: ${peso(r.amount)} from ${r.member} added to ${r.goal}`);
  };
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">From your import jobs <span className="font-normal text-muted-foreground">· {items.filter((r) => r.status === "Pending Review").length} waiting</span></h2>
      <ul className="space-y-3">{items.map((r) => {
        const open = r.status === "Pending Review";
        return (
          <li key={r.id} className={cn("rounded-xl border bg-card p-4", open && !r.member && "border-warning/50")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="num text-lg font-semibold">{peso(r.amount)}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(r.date)} · Ref {r.ref} · Payer {r.payer || "unknown"} · <span className="font-mono">{r.msg}</span></p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Member</dt><dd className={cn("font-medium", !r.member && toneText.warning)}>{r.member || "No payer rule matched"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Goal</dt><dd className="font-medium">{r.goal}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Found by</dt><dd className="font-medium">{r.job}</dd></div>
            </dl>
            {open && canReview && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={!r.member} onClick={() => confirm(r)}><Check aria-hidden /> Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => set(r.id, { status: "Rejected" }) && toast("Rejected. No record created.")}><X aria-hidden /> Reject</Button>
                <CorrectDialog c={{ id: r.id, ref: r.ref }} onSave={(m) => set(r.id, { member: m }) && toast.success("Member set. You can confirm now.")} />
                {!r.member && <span className="self-center text-xs text-warning">Choose a member before confirming, or add a payer rule to the job.</span>}
              </div>
            )}
          </li>
        );
      })}</ul>
      <h2 className="pt-2 text-sm font-medium">Sample candidates</h2>
    </section>
  );
}

/** Review queue: what import jobs sent (saved), then the fictional sample candidates (local state only). */
export function ImportQueue({ mode = "default" }: { mode?: "default" | "empty" }) {
  const canReview = useViewAs() === "owner";
  const [rows, setRows] = useState<Candidate[]>(mode === "empty" ? [] : candidates);
  const set = (id: string, patch: Partial<Candidate>) => setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const act = (c: Candidate, status: CandStatus) => {
    set(c.id, { status });
    toast(status === "Confirmed" ? "Confirmed. Dashboard totals would update now." : "Rejected. No record created.");
  };
  const count = (s: CandStatus) => rows.filter((c) => c.status === s).length;
  if (!rows.length) return <><JobReviewItems canReview={canReview} /><p className="py-8 text-center text-sm text-muted-foreground">No sample candidates to review.</p></>;
  return (
    <>
    <JobReviewItems canReview={canReview} />
    <div className="flex flex-wrap gap-2 text-sm">
      <Badge variant="secondary" className="bg-warning-soft text-warning">{count("Pending Review")} pending review</Badge><Badge variant="secondary">{count("Duplicate")} duplicate</Badge><Badge variant="secondary">{count("Confirmed")} confirmed</Badge><Badge variant="secondary" className="bg-destructive-soft text-destructive">{count("Error")} error</Badge>
    </div>
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
    </>
  );
}

function CorrectDialog({ c, onSave }: { c: Pick<Candidate, "id" | "ref">; onSave: (member: string) => void }) {
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
