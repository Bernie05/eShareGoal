"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { newRecordId, newSubmissionId, PAYMENT_METHODS, shrinkImage, useGoalRecords, useGoalSubmissions, writeRecords, writeSubmissions, type Submission, type TxPatch } from "@/components/app/records";
import { peso } from "@/lib/money";
import { FilePicker } from "@/components/app/file-picker";
import { useMe } from "@/components/app/view-as";
import { members, TODAY, type Tx, type TxType } from "@/lib/demo-data";
import { MAX_PROOF_UPLOAD } from "@/lib/constants";

type Errors = Partial<Record<"member" | "amount" | "date" | "proof", string>>;

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}
function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{error}</p> : hint && <p id={`${id}-err`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface ValidateInput {
  member: string;
  amount: string;
  date: string;
}
// Validation mirrors what the server will enforce: member required, amount > 0 (max 2 decimals), date not in the future.
export function validate(v: ValidateInput): Errors {
  const e: Errors = {};
  if (!v.member) e.member = "Choose who made this transaction.";
  const n = Number(v.amount);
  if (!v.amount || !Number.isFinite(n) || n <= 0) e.amount = "Enter an amount greater than ₱0.00.";
  else if (!/^\d+(\.\d{1,2})?$/.test(v.amount)) e.amount = "Use at most 2 decimal places.";
  if (!v.date) e.date = "Pick the transaction date.";
  else if (v.date > TODAY) e.date = "The date cannot be in the future.";
  return e;
}

interface TransactionFormProps {
  showErrors?: boolean;
  goalId?: string;
  submit?: boolean;
  memberId?: string;
  edit?: { tx: Tx; save: (p: TxPatch) => boolean };
  onDone?: () => void;
}
// goalId: where the transaction is saved. The Owner's is a confirmed record right away (it shows in Transactions).
// submit: a Member's instead. It is always theirs, needs a receipt image, and waits for the Owner to approve it.
// memberId: who it is for when the Owner opens the form from a member's row.
// edit: the Owner correcting an existing transaction; the form starts from it and save replaces it.
export function TransactionForm({ showErrors = false, goalId, submit = false, memberId, edit, onDone }: TransactionFormProps) {
  const subs = useGoalSubmissions(goalId ?? "");
  const records = useGoalRecords(goalId ?? "");
  const myName = useMe();
  const me = members.find((m) => m.name === myName)?.id ?? "";
  const tx = edit?.tx;
  const [v, setV] = useState(tx ? { member: tx.memberId, amount: String(tx.amount / 100), date: tx.date } : { member: submit ? me : showErrors ? "" : memberId ?? me, amount: showErrors ? "-5" : "", date: TODAY });
  const [errors, setErrors] = useState<Errors>(showErrors ? validate({ member: "", amount: "-5", date: TODAY }) : {});
  const [type, setType] = useState<string>(tx?.type ?? "deposit");
  const [method, setMethod] = useState<string>(tx?.method ?? PAYMENT_METHODS[0]);
  const [ref, setRef] = useState(tx?.ref ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [proof, setProof] = useState("");
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function pick(file?: File) {
    setProof(""); setFileName(file?.name ?? ""); setErrors((e) => ({ ...e, proof: undefined }));
    if (!file) return;
    const fail = (proof: string) => setErrors((e) => ({ ...e, proof }));
    if (!file.type.startsWith("image/")) return fail("Choose an image file (JPG, PNG, WebP or HEIC).");
    if (file.size > MAX_PROOF_UPLOAD) return fail("The image is over 10 MB. Choose a smaller one.");
    setReading(true);
    try { setProof(await shrinkImage(file)); } catch { fail("This image could not be read. Try a JPG or PNG."); } finally { setReading(false); }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(v);
    if (submit && !proof) errs.proof = errors.proof ?? "Attach a photo or screenshot of the receipt.";
    setErrors(errs);
    if (reading || Object.keys(errs).length) return;
    const details = { date: v.date, amount: Math.round(Number(v.amount) * 100), direction: type === "deposit" ? "in" as const : "out" as const, note: notes.trim().slice(0, 160), kind: type as Submission["kind"], method, ref: ref.trim() || undefined };
    if (edit) {
      if (!edit.save({ memberId: v.member, amount: details.amount, date: v.date, type: type as TxType, method, ref: details.ref, notes: details.note })) return void toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed.");
      toast.success("Transaction updated", { description: "Totals and shares now use the corrected amount." });
      return onDone?.();
    }
    if (goalId && submit && myName) {
      const s: Submission = {
        ...details, id: newSubmissionId(), member: myName, proof, submitted: new Date().toISOString(), status: "Pending",
      };
      if (!writeSubmissions(goalId, [s, ...subs])) return void toast.error("Not enough browser storage for this image", { description: "Try a smaller image, or ask the Owner to review the waiting ones first." });
      toast.success("Sent to the group Owner for approval", { description: "It counts once they approve it." });
      return onDone?.();
    }
    if (goalId) {
      const member = members.find((m) => m.id === v.member)?.name ?? v.member;
      if (!writeRecords(goalId, [{ ...details, id: newRecordId(), member }, ...records])) return void toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed.");
      toast.success(`Transaction added · ${type === "deposit" ? "+" : "-"}${peso(details.amount)} for ${member}`, { description: "It is in the Transactions list now." });
      return onDone?.();
    }
    setBusy(true); // the form preview screen has no goal to save to
    setTimeout(() => { setBusy(false); toast.success("Transaction added (preview only, nothing was saved)"); onDone?.(); }, 600);
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tx-member" label="Member" error={errors.member}>
          <NativeSelect id="tx-member" value={v.member} onChange={set("member")} disabled={submit} aria-invalid={!!errors.member} aria-describedby="tx-member-err">
            <option value="">Select a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="tx-amount" label="Amount (PHP)" error={errors.amount}>
          <Input id="tx-amount" inputMode="decimal" placeholder="0.00" value={v.amount} onChange={set("amount")} aria-invalid={!!errors.amount} aria-describedby="tx-amount-err" />
        </Field>
        <Field id="tx-type" label="Transaction type">
          <NativeSelect id="tx-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="deposit">Deposit (adds to group funds)</option>
            <option value="loan_payment">Loan payment to lender</option>
            <option value="expense">Expense</option>
            <option value="withdrawal">Withdrawal</option>
          </NativeSelect>
        </Field>
        <Field id="tx-date" label="Transaction date" error={errors.date}>
          <Input id="tx-date" type="date" value={v.date} max={TODAY} onChange={set("date")} aria-invalid={!!errors.date} aria-describedby="tx-date-err" />
        </Field>
        <Field id="tx-method" label="Payment method">
          <NativeSelect id="tx-method" value={method} onChange={(e) => setMethod(e.target.value)}>{[...(PAYMENT_METHODS as readonly string[]).includes(method) ? [] : [method], ...PAYMENT_METHODS].map((m) => <option key={m}>{m}</option>)}</NativeSelect>
        </Field>
        <Field id="tx-ref" label="Reference number" hint="Optional. A repeated reference is flagged as a possible duplicate.">
          <Input id="tx-ref" placeholder="e.g. DEMO-BE2411" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} aria-describedby="tx-ref-err" />
        </Field>
      </div>
      {submit && (
        <div className="space-y-1.5">
          <Field id="tx-proof" label="Receipt image" error={errors.proof} hint={reading ? "Preparing the image…" : undefined}>
            <FilePicker id="tx-proof" fileName={fileName} onPick={pick} invalid={!!errors.proof} describedBy="tx-proof-err" />
          </Field>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
          {proof && <img src={proof} alt="Receipt preview" className="max-h-48 rounded-lg border object-contain" />}
        </div>
      )}
      <Field id="tx-notes" label="Notes"><Textarea id="tx-notes" rows={2} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={160} /></Field>
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <Button type="submit" disabled={busy || reading}>{busy ? "Saving…" : submit ? <><ImageUp aria-hidden /> Submit for approval</> : edit ? "Save changes" : "Add transaction"}</Button>
      </div>
    </form>
  );
}
