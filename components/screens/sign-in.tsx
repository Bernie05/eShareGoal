"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Target } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailLinkAction, googleSignInAction, passwordSignInAction } from "@/app/actions/auth";
import { SIGN_UP_PATH } from "@/lib/constants";

interface SignInFormProps {
  google: boolean;
  emailLink: boolean;
  /** Set when sign-in sent them back here: why, in words. */
  notice?: string;
  sent?: boolean;
}
// ---------- Sign-in: email and password, with Google and an email link when they are set up ----------
export function SignInForm({ google, emailLink, notice, sent = false }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(notice ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (go: () => Promise<{ error: string }>) => {
    setBusy(true); setError("");
    const res = await go(); // a successful sign-in redirects, so this only returns on failure
    setError(res.error);
    setBusy(false);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => passwordSignInAction(email, password)); };
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <p className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Target className="size-4" aria-hidden /></span>
        <span className="text-base font-semibold tracking-tight">eShareGoal</span>
      </p>
      <Card>
        <CardHeader><CardTitle><h1>Sign in</h1></CardTitle><CardDescription>Use the account you signed up with.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {sent && <Alert><AlertDescription>Check your email for a sign-in link.</AlertDescription></Alert>}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="si-email">Email</Label><Input id="si-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="si-password">Password</Label><Input id="si-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
          {(google || emailLink) && <div className="space-y-2 border-t pt-4">
            {google && <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(googleSignInAction)}>Continue with Google</Button>}
            {emailLink && <Button variant="outline" className="w-full" disabled={busy || !email} onClick={() => run(() => emailLinkAction(email))}>Email me a sign-in link</Button>}
          </div>}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">New here? <Link href={SIGN_UP_PATH} className="text-primary underline underline-offset-3">Create an account</Link></p>
    </main>
  );
}
