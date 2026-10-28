"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loan as sample, members, type LoanTerms } from "@/lib/demo-data";
import { Switch } from "@/components/ui/switch";
import { fmtDate, peso } from "@/lib/money";
import { CAR_CREDIT, useCarCredit } from "./car-credit";
import { sendNudges } from "./nudges";
import { writeLoanTerms } from "./records";
import { useMe, useSendEmail } from "./view-as";

/** The goal's description under the page title; it follows what the Owner saves in Goal settings. */
export function LoanAbout() {
  return <>{useCarCredit().loan.about} Figures below come from records, not estimates.</>;
}

const toPesos = (c: number) => String(c / 100);

/** What the Owner changed, in words for the members' message, e.g. "Monthly installment ₱24,000.00 → ₱25,000.00". */
function changesOf(a: LoanTerms, b: LoanTerms) {
  const out: string[] = [];
  const diff = (label: string, x: string, y: string) => { if (x !== y) out.push(`${label} ${x} → ${y}`); };
  diff("Monthly installment", peso(a.monthly), peso(b.monthly));
  diff("Term", `${a.term} months`, `${b.term} months`);
  diff("First due date", fmtDate(a.firstDue), fmtDate(b.firstDue));
  for (const m of members) diff(`${m.name}'s share`, peso(a.shares[m.id] ?? 0), peso(b.shares[m.id] ?? 0));
  if (a.about !== b.about) out.push("Description updated");
  return out;
}
const money = /^\d+(\.\d{1,2})?$/;

// Goal settings → Details: the loan's terms and each member's monthly share. Saving moves every figure on the page:
// installments, balance, due dates and who has paid their share.
export function LoanDetailsCard() {
  const { loan } = useCarCredit();
  return <DetailsForm key={JSON.stringify(loan)} loan={loan} />; // starts again from the saved terms after a save or reset
}

function DetailsForm({ loan }: { loan: LoanTerms }) {
  const [about, setAbout] = useState(loan.about);
  const [monthly, setMonthly] = useState(toPesos(loan.monthly));
  const [term, setTerm] = useState(String(loan.term));
  const [firstDue, setFirstDue] = useState(loan.firstDue);
  const [shares, setShares] = useState(Object.fromEntries(members.map((m) => [m.id, toPesos(loan.shares[m.id] ?? 0)])));
  const [tried, setTried] = useState(false);
  const [notify, setNotify] = useState(true);
  const [email, setEmail] = useState(false);
  const me = useMe();
  const sendEmail = useSendEmail();

  const errors = {
    about: about.trim() ? "" : "Describe the goal in a sentence.",
    monthly: money.test(monthly) && Number(monthly) > 0 ? "" : "Enter an amount greater than ₱0.00, at most 2 decimals.",
    term: /^\d+$/.test(term) && Number(term) >= 1 && Number(term) <= 600 ? "" : "Enter a whole number of months, 1 to 600.",
    firstDue: firstDue ? "" : "Pick the first due date.",
    ...Object.fromEntries(members.map((m) => [m.id, money.test(shares[m.id]) ? "" : "Enter ₱0.00 or more, at most 2 decimals."])),
  } as Record<string, string>;
  const err = (k: string) => tried && errors[k] ? <p role="alert" className="text-xs text-destructive">{errors[k]}</p> : null;
  const centavos = (v: string) => Math.round(Number(v) * 100);
  const shareTotal = members.reduce((s, m) => s + (money.test(shares[m.id]) ? centavos(shares[m.id]) : 0), 0);

  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const next: LoanTerms = { about: about.trim(), monthly: centavos(monthly), term: Number(term), firstDue, shares: Object.fromEntries(members.map((m) => [m.id, centavos(shares[m.id])])) };
    const changes = changesOf(loan, next);
    if (!changes.length) return void toast("Nothing changed");
    if (!writeLoanTerms(CAR_CREDIT, next)) return void toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed.");
    const to = members.filter((m) => m.name !== me).map((m) => m.name);
    if (notify && to.length) {
      const message = changes.join(" · ");
      // The details are saved either way; only the message can fail here.
      if (!sendNudges(to.map((name) => ({ to: name, from: me ?? "Owner", month: "", amount: 0, message, kind: "update" as const })))) toast.error("Saved, but the members could not be notified", { description: "This browser did not let the preview save the message." });
      else if (email) for (const name of to) sendEmail(name, "Car Credit details were updated");
    }
    toast.success("Goal details saved", { description: notify && to.length ? `${to.join(", ")} ${to.length === 1 ? "was" : "were"} notified${email ? " in the bell and by email" : " in their bell"}.` : "Members were not notified." });
  };
  const reset = () => {
    if (!writeLoanTerms(CAR_CREDIT, sample)) return void toast.error("Could not reset. This browser's storage is full or blocked.");
    toast.success("Goal details reset to the original terms");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goal details</CardTitle>
        <CardDescription>The loan&apos;s terms and what each member pays every month. Records are kept; only the figures computed from them change.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="gd-about">Description</Label><Textarea id="gd-about" rows={2} maxLength={200} value={about} onChange={(e) => setAbout(e.target.value)} />{err("about")}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="gd-monthly">Monthly installment (₱)</Label><Input id="gd-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />{err("monthly")}</div>
          <div className="space-y-1.5"><Label htmlFor="gd-term">Term (months)</Label><Input id="gd-term" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />{err("term")}</div>
          <div className="space-y-1.5"><Label htmlFor="gd-first">First due date</Label><Input id="gd-first" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />{err("firstDue")}</div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Monthly share per member</legend>
          <div className="grid gap-3 sm:grid-cols-3">{members.map((m) => (
            <div key={m.id} className="space-y-1.5"><Label htmlFor={`gd-share-${m.id}`}>{m.name} (₱)</Label><Input id={`gd-share-${m.id}`} inputMode="decimal" value={shares[m.id]} onChange={(e) => setShares({ ...shares, [m.id]: e.target.value })} />{err(m.id)}</div>
          ))}</div>
          <p className="text-xs text-muted-foreground">
            Shares add up to {peso(shareTotal)} a month{money.test(monthly) && centavos(monthly) !== shareTotal && <> · the installment is {peso(centavos(monthly))}</>}.
          </p>
        </fieldset>
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gd-notify" className="flex-col items-start gap-0.5">Notify members about this change<span className="text-xs font-normal text-muted-foreground">They get a message in their bell listing what changed.</span></Label>
            <Switch id="gd-notify" checked={notify} onCheckedChange={setNotify} />
          </div>
          {notify && <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gd-email">Also send by email</Label>
            <Switch id="gd-email" checked={email} onCheckedChange={setEmail} />
          </div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={reset}><RotateCcw aria-hidden /> Reset to original</Button>
          <Button onClick={save}>Save details</Button>
        </div>
      </CardContent>
    </Card>
  );
}
