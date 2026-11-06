"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { okEmail, type Mailbox, type MailboxMethod } from "@/lib/group-settings";
import { BASE_PATH, GMAIL_SIM_MS } from "@/lib/constants";
import { TODAY } from "@/lib/demo-data";
import { gmailDevLinkAction } from "@/app/actions/gmail";
import type { GmailStatus } from "@/lib/server/gmail";
import { AppSetup, HowToConnect } from "./gmail-setup";

// ---------- Choosing which inbox a goal reads ----------
// Clicking Gmail opens this. A site cannot see the Google accounts in the browser, so it offers the inboxes it knows
// (your email, inboxes you linked before); "Use another account" opens Google's own account list. With the Google keys
// set, every choice goes through Google's page, which decides the address that is linked. Without them, and for IMAP, it
// stays simulated: no password or token is kept, only the address, method and date.
// In development (live.devLink) a listed inbox links at once, without Google: real if it ever signed in, otherwise simulated.
// Use another account still opens Google, which is how an inbox signs in the first time. Production always signs in.
const APP_PASSWORD = /^[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}$/i; // Google shows it as four groups of four letters
type View = "accounts" | "other" | "imap";

interface GmailLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryKey: string;
  goalName: string;
  /** The goal's current inbox, if any: offered first, and its label and read-back days are kept. */
  mailbox?: Mailbox;
  live: GmailStatus | null;
  /** Saves a link made here (one through Google comes back through the server). real: development only: it has real access. */
  onLinked: (mailbox: Mailbox, message: string, real?: boolean) => void;
}
export function GmailLinkDialog({ open, onOpenChange, entryKey, goalName, mailbox, live, onLinked }: GmailLinkDialogProps) {
  const [view, setView] = useState<View>("accounts");
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // the address being linked, or "" for Google's own list
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Coming back with the browser's back button restores the page as it was left: the sign-in is no longer in progress.
  useEffect(() => { const back = () => setBusy(null); window.addEventListener("pageshow", back); return () => window.removeEventListener("pageshow", back); }, []);

  const configured = !!live?.configured;
  const devLink = !!live?.devLink;
  const current = mailbox?.connected ? mailbox.address.toLowerCase() : undefined;
  const accounts = [...new Set([current, ...(live?.accounts ?? [])])].filter((a): a is string => !!a);
  const addressError = !okEmail(address) ? "Enter a valid email address." : null;
  const passwordError = !APP_PASSWORD.test(appPassword.trim()) ? "Paste the 16-letter app password Google showed you." : null;

  const reset = () => { setView("accounts"); setAddress(""); setAppPassword(""); setTried(false); };
  const change = (next: boolean) => { if (busy !== null) return; if (!next) reset(); onOpenChange(next); };

  const simulate = (email: string, method: MailboxMethod) => {
    setBusy(email);
    // Simulated: the real app redirects to Google's consent screen (or checks the IMAP login) and comes back here.
    timer.current = setTimeout(() => {
      setBusy(null); reset(); onOpenChange(false);
      onLinked({ label: mailbox?.label ?? "", days: mailbox?.days ?? 30, method, address: email, connected: TODAY }, method === "oauth" ? `Linked ${email} to ${goalName} (simulated)` : `Connected to ${email} by IMAP (simulated)`);
    }, GMAIL_SIM_MS);
  };
  /** The real sign-in: hint is the chosen inbox; without one Google lists the accounts. It returns to this goal. */
  const toGoogle = (hint?: string) => {
    setBusy(hint ?? "");
    const [group, goal] = entryKey.split("~");
    const q = new URLSearchParams({ entry: entryKey, next: `${BASE_PATH}/group?group=${group}&setup=${goal}&tab=integrations#setup` });
    if (hint) q.set("hint", hint);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a route that redirects to Google's page, not a screen
    window.location.assign(`/api/gmail/connect?${q}`);
  };
  const linkInDev = async (email: string) => {
    setBusy(email);
    const r = await gmailDevLinkAction(entryKey, email);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    reset(); onOpenChange(false);
    onLinked({ label: mailbox?.label ?? "", days: mailbox?.days ?? 30, method: "oauth", address: email, connected: TODAY }, `Linked ${email} to ${goalName}${r.data ? "" : " (simulated)"}`, r.data);
  };
  const choose = (email: string) => (devLink ? linkInDev(email) : configured ? toGoogle(email) : simulate(email, "oauth"));
  const anotherAccount = () => (configured ? toGoogle() : setView("other"));
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setTried(true);
    if (addressError || (view === "imap" && passwordError)) return;
    simulate(address.trim().toLowerCase(), view === "imap" ? "imap" : "oauth");
  };

  const working = busy !== null;
  const back = <Button type="button" variant="ghost" disabled={working} onClick={() => { setTried(false); setView("accounts"); }}><ArrowLeft aria-hidden /> Back</Button>;
  const addressField = (
    <div className="space-y-1.5"><Label htmlFor={`${entryKey}-link-address`}>Gmail address</Label>
      <Input id={`${entryKey}-link-address`} type="email" autoComplete="email" autoFocus maxLength={254} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@gmail.com" aria-invalid={tried && !!addressError} />
      {tried && addressError && <p role="alert" className="text-xs text-destructive">{addressError}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{view === "imap" ? "Connect with an app password" : "Link a Gmail inbox"}</DialogTitle>
          <DialogDescription>Choose the inbox that receives bank and e-wallet alerts for {goalName}. eShareGoal can only read it.</DialogDescription>
        </DialogHeader>

        {view === "accounts" && <>
          <ul className="divide-y rounded-lg border">
            {accounts.map((email) => (
              <li key={email}>
                <button type="button" disabled={working} onClick={() => choose(email)} className="flex w-full items-center gap-3 p-3 text-left text-sm transition-colors hover:bg-accent/40 disabled:opacity-60">
                  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-medium text-accent-foreground uppercase">{email[0]}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{email}</span>
                  {busy === email ? <Loader2 className="size-4 shrink-0 animate-spin" aria-label="Linking" /> : email === current && <Badge variant="outline" className="font-normal">Linked now</Badge>}
                </button>
              </li>
            ))}
            <li>
              <button type="button" disabled={working} onClick={anotherAccount} className="flex w-full items-center gap-3 p-3 text-left text-sm transition-colors hover:bg-accent/40 disabled:opacity-60">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border"><UserPlus className="size-4" /></span>
                <span className="min-w-0 flex-1 font-medium">Use another account</span>
                {busy === "" && <Loader2 className="size-4 shrink-0 animate-spin" aria-label="Opening Google" />}
              </button>
            </li>
          </ul>
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><LogIn className="mt-px size-3.5 shrink-0" aria-hidden />
            {devLink && configured ? <span>Development: listed inboxes link at once, without Google. One that signed in before reads real mail; the others are simulated. Use another account to sign in. Production always signs in.</span>
              : configured ? <span>Google asks you to allow read-only access (<code className="font-mono">gmail.readonly</code>). Your Google password is never seen here.</span>
              : <span>Simulated: the Google keys are not set on the server yet, so nothing connects and no token is kept. <Badge variant="outline" className="ml-1 font-normal">Preview</Badge></span>}
          </p>
          {!configured && <AppSetup />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <HowToConnect />
            <Button variant="ghost" size="sm" disabled={working} onClick={() => setView("imap")}><KeyRound aria-hidden /> Use an app password instead</Button>
          </div>
        </>}

        {view === "other" && (
          <form onSubmit={submit} noValidate className="space-y-3">
            {addressField}
            <DialogFooter>{back}<Button type="submit" disabled={working}>{working ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Link this inbox</Button></DialogFooter>
          </form>
        )}

        {view === "imap" && (
          <form onSubmit={submit} noValidate className="space-y-3">
            {addressField}
            <div className="space-y-1.5"><Label htmlFor={`${entryKey}-link-pass`}>App password</Label>
              <Input id={`${entryKey}-link-pass`} type="password" autoComplete="off" maxLength={19} value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" aria-invalid={tried && !!passwordError} />
              {tried && passwordError && <p role="alert" className="text-xs text-destructive">{passwordError}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Create it in Google Account → Security → App passwords (2-Step Verification must be on). Server: imap.gmail.com, port 993 (SSL). It is sent once and never shown again; changing your Google password cancels it. <Badge variant="outline" className="ml-1 font-normal">Preview: simulated</Badge></p>
            <DialogFooter>{back}<Button type="submit" disabled={working}>{working ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />} Connect</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
