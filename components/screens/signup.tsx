"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CircleCheck, Clock, Info, MailCheck, ShieldCheck, Target } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EmailMode } from "@/lib/view-as";
import { cn } from "@/lib/utils";

const ID_TYPES = ["PhilSys National ID", "Driver's License", "Passport", "UMID", "Postal ID"];
const TODAY = "2026-10-26";
const blank = { name: "", email: "", phone: "", password: "", confirm: "", birthdate: "", address: "", idType: "", idNumber: "", idExpiry: "", front: "", back: "", selfie: "", consent: false };
type Form = typeof blank;
type Errors = Partial<Record<keyof Form, string>>;

function check(step: 1 | 2, f: Form): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (f.name.trim().length < 3) e.name = "Enter your full name as it appears on your ID.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Enter a valid email address, like juan@example.com.";
    if (!/^(\+63|0)9\d{9}$/.test(f.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a Philippine mobile number, like 0917 123 4567.";
    if (f.password.length < 8) e.password = "Use at least 8 characters.";
    if (f.confirm !== f.password) e.confirm = "Passwords do not match.";
  } else {
    if (!f.birthdate) e.birthdate = "Enter your birthdate.";
    else if (f.birthdate > "2008-10-26") e.birthdate = "You must be 18 or older.";
    if (f.address.trim().length < 5) e.address = "Enter your city and province.";
    if (!f.idType) e.idType = "Choose the ID you will upload.";
    if (f.idNumber.trim().length < 5) e.idNumber = "Enter the number printed on your ID.";
    if (!f.idExpiry) e.idExpiry = "Enter the expiry date on your ID.";
    else if (f.idExpiry <= TODAY) e.idExpiry = "This ID has expired. Use a valid ID.";
    if (!f.front) e.front = "Upload a photo of the front of your ID.";
    if (!f.back) e.back = "Upload a photo of the back of your ID.";
    if (!f.selfie) e.selfie = "Upload a selfie holding your ID.";
    if (!f.consent) e.consent = "You need to agree before we can review your ID.";
  }
  return e;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-msg`} role="alert" className="text-xs text-destructive">{error}</p> : hint && <p id={`${id}-msg`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------- Sign-up: account, then a valid ID; the account waits for System Admin review ----------
export function SignupForm({ emailMode }: { emailMode: EmailMode }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [f, setF] = useState<Form>(blank);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const a11y = (k: keyof Form) => ({ "aria-invalid": !!errors[k] || undefined, "aria-describedby": `su-${k}-msg` });

  const next = () => {
    const e = check(step as 1 | 2, f);
    setErrors(e);
    if (Object.keys(e).length) { document.getElementById(`su-${Object.keys(e)[0]}`)?.focus(); return; }
    if (step === 1) return setStep(2);
    setBusy(true);
    setTimeout(() => { // simulated upload and save
      setBusy(false); setStep(3);
      if (emailMode === "prod") toast.success(`Email sent to ${f.email}`, { description: "\"We received your sign-up\" · through the email provider" });
      else toast(`Development: email not sent`, { description: `Would send "We received your sign-up" to ${f.email}` });
    }, 900);
  };

  const file = (k: "front" | "back" | "selfie", label: string, hint: string) => (
    <Field id={`su-${k}`} label={label} hint={f[k] ? `Selected: ${f[k]}` : hint} error={errors[k]}>
      <Input id={`su-${k}`} type="file" accept="image/jpeg,image/png" capture={k === "selfie" ? "user" : undefined} onChange={(e) => set({ [k]: e.target.files?.[0]?.name ?? "" })} {...a11y(k)} />
    </Field>
  );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/design-preview" className="flex items-center gap-2 self-start">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Target className="size-4" aria-hidden /></span>
        <span className="text-base font-semibold tracking-tight">eShareGoal</span>
      </Link>

      <ol className="flex gap-2 text-xs" aria-label="Sign-up steps">
        {["Account", "Verify your identity", "Review"].map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined} className={cn("flex-1 rounded-full border px-3 py-1.5 text-center", step === i + 1 ? "border-primary bg-primary/10 font-medium text-primary" : step > i + 1 ? "border-success/40 text-success" : "text-muted-foreground")}>
            {step > i + 1 && <CircleCheck className="mr-1 inline size-3.5" aria-hidden />}{i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Create your account</CardTitle><CardDescription>Use your real name. We check it against your ID in the next step.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Field id="su-name" label="Full name (as on your ID)" error={errors.name}><Input id="su-name" autoComplete="name" value={f.name} onChange={(e) => set({ name: e.target.value })} {...a11y("name")} /></Field>
            <Field id="su-email" label="Email" hint="We send your review result here." error={errors.email}><Input id="su-email" type="email" autoComplete="email" value={f.email} onChange={(e) => set({ email: e.target.value })} {...a11y("email")} /></Field>
            <Field id="su-phone" label="Mobile number" error={errors.phone}><Input id="su-phone" type="tel" autoComplete="tel" placeholder="0917 123 4567" value={f.phone} onChange={(e) => set({ phone: e.target.value })} {...a11y("phone")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="su-password" label="Password" hint="At least 8 characters." error={errors.password}><Input id="su-password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set({ password: e.target.value })} {...a11y("password")} /></Field>
              <Field id="su-confirm" label="Confirm password" error={errors.confirm}><Input id="su-confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => set({ confirm: e.target.value })} {...a11y("confirm")} /></Field>
            </div>
            <Button className="w-full" onClick={next}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Verify your identity</CardTitle><CardDescription>Every account is checked by a person before it can join groups that hold shared money.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="su-birthdate" label="Birthdate" error={errors.birthdate}><Input id="su-birthdate" type="date" value={f.birthdate} onChange={(e) => set({ birthdate: e.target.value })} {...a11y("birthdate")} /></Field>
              <Field id="su-address" label="City and province" error={errors.address}><Input id="su-address" autoComplete="address-level2" placeholder="Quezon City, Metro Manila" value={f.address} onChange={(e) => set({ address: e.target.value })} {...a11y("address")} /></Field>
              <Field id="su-idType" label="Valid ID" error={errors.idType}><NativeSelect id="su-idType" value={f.idType} onChange={(e) => set({ idType: e.target.value })} {...a11y("idType")}><option value="">Choose an ID…</option>{ID_TYPES.map((t) => <option key={t}>{t}</option>)}</NativeSelect></Field>
              <Field id="su-idNumber" label="ID number" error={errors.idNumber}><Input id="su-idNumber" value={f.idNumber} onChange={(e) => set({ idNumber: e.target.value })} {...a11y("idNumber")} /></Field>
              <Field id="su-idExpiry" label="ID expiry date" error={errors.idExpiry}><Input id="su-idExpiry" type="date" value={f.idExpiry} onChange={(e) => set({ idExpiry: e.target.value })} {...a11y("idExpiry")} /></Field>
            </div>
            {file("front", "Front of your ID", "JPG or PNG, all four corners visible.")}
            {file("back", "Back of your ID", "JPG or PNG.")}
            {file("selfie", "Selfie holding your ID", "Your face and the ID in one clear photo.")}
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input id="su-consent" type="checkbox" checked={f.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-0.5 size-4 accent-primary" {...a11y("consent")} />
                <span>I agree that eShareGoal stores my ID to verify who I am, under the Data Privacy Act of 2012. Only System Admins can see it.</span>
              </label>
              {errors.consent && <p id="su-consent-msg" role="alert" className="text-xs text-destructive">{errors.consent}</p>}
            </div>
            <p className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden />Preview only: files stay on your device. In production they are uploaded over HTTPS and stored encrypted.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setErrors({}); setStep(1); }}>Back</Button>
              <Button className="flex-1" disabled={busy} onClick={next}>{busy ? "Submitting…" : "Submit for review"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning"><Clock className="size-6" aria-hidden /></span>
            <div><h1 className="text-xl font-semibold">Your account is waiting for review</h1><p className="text-sm text-muted-foreground">A System Admin checks your ID, usually within one working day. You cannot sign in until you are approved.</p></div>
            <p className="flex items-center justify-center gap-2 text-sm"><MailCheck className="size-4 text-success" aria-hidden />We emailed {f.email}. We will email you again with the result.</p>
            {emailMode === "dev" && (
              <Alert className="text-left"><Info aria-hidden /><AlertTitle>Development mode</AlertTitle><AlertDescription>No email was actually sent. A System Admin can switch to production in Settings, Email delivery.</AlertDescription></Alert>
            )}
            <Link href="/design-preview/users" className="text-sm text-primary underline underline-offset-3">See it as the System Admin (Users)</Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
