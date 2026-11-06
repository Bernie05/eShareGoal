"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Inbox, Pencil, RotateCcw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge, toneText } from "./primitives";
import { readRecords, newRecordId, writeRecords } from "./records";
import { saveReviewItems, useReviewItems, type ReviewItem } from "./import-store";
import { pollImported, refreshImported, useImported } from "./imported-records";
import { useViewAs } from "./view-as";
import { decideReviewAction, sendToReviewAction, setReviewMemberAction } from "@/app/actions/import-setup";
import { members } from "@/lib/demo-data";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BASE_PATH, CAR_CREDIT, CAR_CREDIT_ENTRY } from "@/lib/constants";

// The Owner's queue of payments found in Gmail. Car Credit's lives on the server, so every Owner sees it on every device;
// goals made in the preview keep theirs in this browser.

export const IMPORT_REVIEW_HREF = `${BASE_PATH}/import`;
const STOPPED = "Could not reach the server. Nothing changed; try again.";
const isServer = (r: ReviewItem) => r.goalId === CAR_CREDIT;

let handingOver = false;
/** Payments sent here before the queue moved to the server: passes them on once, then forgets its own copy. */
async function handOver(local: ReviewItem[]) {
  const mine = local.filter(isServer);
  if (!mine.length || handingOver) return;
  handingOver = true;
  const items = mine.filter((r) => r.status === "Pending Review").map((r) => ({ member: r.member, day: r.date, amount: r.amount, ref: r.ref, msg: r.msg, payer: r.payer, job: r.job }));
  const res = await sendToReviewAction({ entry: CAR_CREDIT_ENTRY, items }).catch(() => null);
  if (res?.ok) { saveReviewItems(local.filter((r) => !isServer(r))); await refreshImported(CAR_CREDIT_ENTRY).catch(() => {}); }
  handingOver = false;
}

/** The whole queue, kept fresh while the page stays open. Only an Owner's browser hands over old items. */
export function useReviewQueue() {
  const local = useReviewItems();
  const { review } = useImported(CAR_CREDIT_ENTRY);
  const owner = useViewAs() === "owner";
  useEffect(() => {
    if (owner) void handOver(local);
  }, [owner, local]);
  useEffect(pollImported, []);
  const items: ReviewItem[] = [...review, ...local.filter((r) => !isServer(r))];
  return { items, pending: items.filter((r) => r.status === "Pending Review") };
}

interface CorrectDialogProps {
  c: { id: string; ref: string };
  onSave: (member: string) => void;
}
/** Picks the member a payment belongs to. */
export function CorrectDialog({ c, onSave }: CorrectDialogProps) {
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

interface ReviewListProps {
  items: ReviewItem[];
  canReview: boolean;
}
/** Each payment with what the Owner can do about it. */
export function ReviewList({ items, canReview }: ReviewListProps) {
  const local = useReviewItems();
  const [busy, setBusy] = useState(false);
  const saveLocal = (id: string, patch: Partial<ReviewItem>) => saveReviewItems(local.map((x) => (x.id === id ? { ...x, ...patch } : x))) || (toast.error("Could not save. This browser's storage is full or blocked."), false);
  /** Runs one server change, then reloads the queue. Returns its data, or null after telling the Owner why it failed. */
  const onServer = async <T,>(call: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>) => {
    setBusy(true);
    const res = await call().catch(() => null);
    if (res?.ok) await refreshImported(CAR_CREDIT_ENTRY).catch(() => {});
    setBusy(false);
    if (!res) { toast.error(STOPPED); return null; }
    if (!res.ok) { toast.error(res.error); return null; }
    return res;
  };
  const confirm = async (r: ReviewItem) => {
    if (isServer(r)) {
      const res = await onServer(() => decideReviewAction({ id: r.id, action: "confirm" }));
      if (res) toast.success(res.data.added ? `Confirmed: ${peso(r.amount)} from ${r.member} added to ${r.goal}` : `Ref ${r.ref} is already in ${r.goal}. Nothing was added.`);
      return;
    }
    const recordId = newRecordId();
    const rec = { id: recordId, member: r.member, date: r.date, note: `Gmail import · ${r.ref}`, ref: r.ref, amount: r.amount, direction: "in" as const, kind: "deposit" as const, method: "Bank transfer" };
    if (!writeRecords(r.goalId, [rec, ...readRecords(r.goalId)])) return void toast.error("Could not save. This browser's storage is full or blocked.");
    if (saveLocal(r.id, { status: "Confirmed", recordId })) toast.success(`Confirmed: ${peso(r.amount)} from ${r.member} added to ${r.goal}`);
  };
  const reject = async (r: ReviewItem) => {
    if (isServer(r)) { if (await onServer(() => decideReviewAction({ id: r.id, action: "reject" }))) toast("Rejected. It will not be imported again."); return; }
    if (saveLocal(r.id, { status: "Rejected" })) toast("Rejected. No record created.");
  };
  const reopen = async (r: ReviewItem) => {
    if (await onServer(() => decideReviewAction({ id: r.id, action: "reopen" }))) toast("Back in the queue.");
  };
  const correct = async (r: ReviewItem, member: string) => {
    if (isServer(r)) { if (await onServer(() => setReviewMemberAction({ id: r.id, member }))) toast.success("Member set. You can confirm now."); return; }
    if (saveLocal(r.id, { member })) toast.success("Member set. You can confirm now.");
  };
  return (
    <ul className="space-y-3">{items.map((r) => {
      const open = r.status === "Pending Review";
      return (
        <li key={r.id} className={cn("rounded-xl border bg-card p-4", open && !r.member && "border-warning/50")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="num text-lg font-semibold">{peso(r.amount)}</p>
              <p className="break-all text-xs text-muted-foreground">{fmtDate(r.date)} · Ref {r.ref} · Payer {r.payer || "unknown"} · <span className="font-mono">{r.msg}</span></p>
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
              <Button size="sm" disabled={!r.member || busy} onClick={() => confirm(r)}><Check aria-hidden /> Confirm</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reject(r)}><X aria-hidden /> Reject</Button>
              <CorrectDialog c={{ id: r.id, ref: r.ref }} onSave={(m) => correct(r, m)} />
              {!r.member && <span className="self-center text-xs text-warning">Choose a member before confirming, or add a payer rule to the job.</span>}
            </div>
          )}
          {r.status === "Rejected" && canReview && isServer(r) && <div className="mt-3"><Button size="sm" variant="ghost" disabled={busy} onClick={() => reopen(r)}><RotateCcw aria-hidden /> Undo reject</Button></div>}
        </li>
      );
    })}</ul>
  );
}

/** The Owner's section on the goal page: only there while payments are waiting. */
export function PendingImportsCard() {
  const owner = useViewAs() === "owner";
  const { pending } = useReviewQueue();
  const here = pending.filter(isServer);
  if (!owner || !here.length) return null;
  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="size-4" aria-hidden /> Payments to approve</CardTitle>
        <CardDescription>Found in Gmail. They count toward the goal once you confirm them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReviewList items={here} canReview />
        <Link href={IMPORT_REVIEW_HREF} className={buttonVariants({ variant: "ghost", size: "sm" })}>Open Import review</Link>
      </CardContent>
    </Card>
  );
}

/** The sidebar count. */
export function PendingImportsBadge() {
  const { pending } = useReviewQueue();
  return pending.length ? <span className="num rounded-full bg-primary px-1.5 text-xs text-primary-foreground" aria-label={`${pending.length} waiting`}>{pending.length}</span> : null;
}
