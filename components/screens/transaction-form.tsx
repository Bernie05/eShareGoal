"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { members, TODAY } from "@/lib/demo-data";

type Errors = Partial<Record<"member" | "amount" | "date", string>>;

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{error}</p> : hint && <p id={`${id}-err`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Validation mirrors what the server will enforce: member required, amount > 0 (max 2 decimals), date not in the future.
export function validate(v: { member: string; amount: string; date: string }): Errors {
  const e: Errors = {};
  if (!v.member) e.member = "Choose who made this transaction.";
  const n = Number(v.amount);
  if (!v.amount || !Number.isFinite(n) || n <= 0) e.amount = "Enter an amount greater than ₱0.00.";
  else if (!/^\d+(\.\d{1,2})?$/.test(v.amount)) e.amount = "Use at most 2 decimal places.";
  if (!v.date) e.date = "Pick the transaction date.";
  else if (v.date > TODAY) e.date = "The date cannot be in the future.";
  return e;
}

export function TransactionForm({ showErrors = false, onDone }: { showErrors?: boolean; onDone?: () => void }) {
  const [v, setV] = useState({ member: showErrors ? "" : "bernz", amount: showErrors ? "-5" : "", date: TODAY });
  const [errors, setErrors] = useState<Errors>(showErrors ? validate({ member: "", amount: "-5", date: TODAY }) : {});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); // disabled while submitting: prevents double-submit
    setTimeout(() => { setBusy(false); toast.success("Transaction added (preview only, nothing was saved)"); onDone?.(); }, 600);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tx-member" label="Member" error={errors.member}>
          <NativeSelect id="tx-member" value={v.member} onChange={set("member")} aria-invalid={!!errors.member} aria-describedby="tx-member-err">
            <option value="">Select a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="tx-amount" label="Amount (PHP)" error={errors.amount}>
          <Input id="tx-amount" inputMode="decimal" placeholder="0.00" value={v.amount} onChange={set("amount")} aria-invalid={!!errors.amount} aria-describedby="tx-amount-err" />
        </Field>
        <Field id="tx-type" label="Transaction type">
          <NativeSelect id="tx-type" defaultValue="deposit">
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
          <NativeSelect id="tx-method" defaultValue="BPI Transfer"><option>BPI Transfer</option><option>GCash</option><option>Cash</option></NativeSelect>
        </Field>
        <Field id="tx-ref" label="Reference number" hint="Optional. A repeated reference is flagged as a possible duplicate.">
          <Input id="tx-ref" placeholder="e.g. DEMO-BE2411" aria-describedby="tx-ref-err" />
        </Field>
      </div>
      <Field id="tx-notes" label="Notes"><Textarea id="tx-notes" rows={2} placeholder="Optional" /></Field>
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add transaction"}</Button>
      </div>
    </form>
  );
}
