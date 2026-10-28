"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleHelp, KeyRound, Loader2, LogIn, PlugZap, Server, TriangleAlert, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SAMPLE_EMAILS } from "@/lib/gmail-import";
import { SAMPLE_IMPORT_JOBS } from "@/lib/import-workflows";
import { mailboxFor, okEmail, type Mailbox, type MailboxMethod, type SetupSettings } from "@/lib/group-settings";
import { TODAY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

// ---------- Gmail for one goal: only the connection. What to read is in Scheduled jobs (Gmail import jobs) ----------
// Gmail cannot be read with an API key: reading a person's mail needs their consent. The real app uses Google sign-in
// (OAuth 2.0, server-side flow, scope gmail.readonly): the server keeps the refresh token, encrypted, so the scheduler can
// read new mail while the Owner is offline. Fallback: IMAP with a Google app password (needs 2-Step Verification).
// In the preview nothing connects: no password or token is kept, only the address, method and the date it was "signed in".
const METHODS: { id: MailboxMethod; name: string; hint: string; Icon: typeof LogIn }[] = [
  { id: "oauth", name: "Google sign-in", hint: "Recommended. Read-only access you can revoke in your Google Account.", Icon: LogIn },
  { id: "imap", name: "IMAP + app password", hint: "Fallback for accounts that cannot use Google sign-in. Needs 2-Step Verification.", Icon: KeyRound },
];
const APP_PASSWORD = /^[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}$/i; // Google shows it as four groups of four letters

function HowToConnect() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><CircleHelp aria-hidden /> How it connects</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>How Gmail connects</DialogTitle><DialogDescription>eShareGoal only reads; it never sends, changes or deletes email. Access to Gmail never gives access to a bank account.</DialogDescription></DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Turn on email alerts for incoming transfers in your bank or e-wallet app, sent to this Gmail address.</li>
            <li><span className="font-medium">Google sign-in:</span> click <span className="font-medium">Sign in with Google</span> and allow <span className="font-medium">read-only</span> access (gmail.readonly). Google gives eShareGoal a refresh token, kept encrypted on the server, so jobs run while you are offline.</li>
            <li><span className="font-medium">Or IMAP:</span> turn on 2-Step Verification, create an app password at myaccount.google.com/apppasswords and paste it here. It is sent once to the server and never shown again.</li>
            <li>Click <span className="font-medium">Test connection</span>, then add <span className="font-medium">Gmail import jobs</span> in Scheduled jobs. Each job picks a workflow and maps payers to members.</li>
          </ol>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">An API key cannot read Gmail: Google requires the account owner&apos;s consent (OAuth) for mail. Revoke access any time in Google Account → Security → Third-party connections.</p>
          <DialogFooter><Button onClick={() => setOpen(false)}>Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** What the server needs once for Google sign-in, set by whoever deploys the app. Never typed into this page. */
function AppSetup() {
  const origin = typeof window === "undefined" ? "https://your-app" : window.location.origin;
  const rows: [string, string][] = [
    ["Google Cloud", "A project with the Gmail API enabled, and an OAuth consent screen with the gmail.readonly scope (a restricted scope: Google reviews the app before it can go public)."],
    ["GOOGLE_CLIENT_ID", "OAuth client ID (type: Web application), in the server's environment variables."],
    ["GOOGLE_CLIENT_SECRET", "Its client secret, server only. Never in the browser or in git."],
    ["Redirect URI", `${origin}/api/auth/google/callback`],
    ["TOKEN_ENCRYPTION_KEY", "Encrypts each inbox's refresh token (or app password) at rest."],
    ["Scheduler", "For example Vercel Cron calling /api/jobs/gmail-import, which runs each goal's import jobs."],
  ];
  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}><Server aria-hidden /> App setup (done once, by whoever deploys the app)</CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 grid gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-[11rem_1fr]">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="font-mono font-medium">{k}</dt><dd className="break-words text-muted-foreground">{v}</dd></div>)}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GmailSetup({ entryKey, goalName, settings, editable, onChange }: { entryKey: string; goalName: string; settings: SetupSettings; editable: boolean; onChange: (s: SetupSettings) => void }) {
  const saved = mailboxFor(entryKey, settings);
  const [m, setM] = useState<Mailbox>(saved ?? { method: "oauth", address: "", label: "", days: 30 });
  const [appPassword, setAppPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [test, setTest] = useState<"idle" | "testing" | "done">("idle");
  const [signing, setSigning] = useState(false);
  const dirty = JSON.stringify({ ...m, connected: undefined }) !== JSON.stringify({ ...(saved ?? { method: "oauth", address: "", label: "", days: 30 }), connected: undefined });
  const connected = !!saved?.connected && !dirty;
  const addressError = !okEmail(m.address) ? "Enter the Gmail address that receives the alerts." : null;
  const passwordError = m.method === "imap" && !APP_PASSWORD.test(appPassword.trim()) ? "Paste the 16-letter app password Google showed you." : null;
  const jobs = (settings.imports ?? SAMPLE_IMPORT_JOBS[entryKey] ?? []).filter((j) => j.on).length;
  const set = (patch: Partial<Mailbox>) => { setM((x) => ({ ...x, ...patch })); setTest("idle"); };
  const store = (next: Mailbox | undefined, msg: string) => { onChange({ ...settings, mailbox: next }); toast.success(msg); };

  const connect = () => {
    setTried(true);
    if (addressError || passwordError) return void toast.error("Fix the highlighted fields first");
    setSigning(true);
    // Simulated: the real app redirects to Google's consent screen (or checks the IMAP login) and comes back here.
    setTimeout(() => {
      setSigning(false); setAppPassword("");
      store({ ...m, address: m.address.trim(), connected: TODAY }, m.method === "oauth" ? `Signed in as ${m.address.trim()} (simulated)` : `Connected to ${m.address.trim()} by IMAP (simulated)`);
    }, 700);
  };
  const runTest = () => { setTest("testing"); setTimeout(() => setTest("done"), 700); };
  const recent = SAMPLE_EMAILS.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          {connected ? <><CircleCheck className="size-4 text-success" aria-hidden /> <span><span className="font-medium">{saved!.address}</span> · {saved!.method === "oauth" ? "Google sign-in" : "IMAP"} · since {saved!.connected}</span></>
            : <><TriangleAlert className="size-4 text-warning" aria-hidden /> <span>Not signed in. Import jobs for {goalName} cannot run yet.</span></>}
        </p>
        <HowToConnect />
      </div>

      <fieldset disabled={!editable} className="space-y-3">
        <legend className="sr-only">How to connect</legend>
        <div role="radiogroup" aria-label="How to connect" className="grid gap-2 sm:grid-cols-2">
          {METHODS.map(({ id, name, hint, Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={m.method === id} onClick={() => set({ method: id })}
              className={cn("flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60", m.method === id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/40")}>
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="block font-medium">{name}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${entryKey}-gm-address`}>Gmail address</Label>
            <Input id={`${entryKey}-gm-address`} type="email" autoComplete="email" maxLength={254} value={m.address} onChange={(e) => set({ address: e.target.value })} placeholder="you@gmail.com" aria-invalid={tried && !!addressError} />
            {tried && addressError && <p role="alert" className="text-xs text-destructive">{addressError}</p>}
          </div>
          {m.method === "oauth" ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">Access asked: <code className="font-mono">gmail.readonly</code> (read email, nothing else). Sign in with this same Google account.</p>
          ) : <>
            <div className="space-y-1.5"><Label htmlFor={`${entryKey}-gm-pass`}>App password</Label>
              <Input id={`${entryKey}-gm-pass`} type="password" autoComplete="off" maxLength={19} value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder={saved?.method === "imap" && saved.connected ? "Saved on the server: paste a new one to change it" : "xxxx xxxx xxxx xxxx"} aria-invalid={tried && !!passwordError} />
              {tried && passwordError && <p role="alert" className="text-xs text-destructive">{passwordError}</p>}
            </div>
            <div className="space-y-1.5"><Label>IMAP server</Label><p className="flex h-8 items-center rounded-md border bg-muted/40 px-2.5 font-mono text-xs">imap.gmail.com : 993 (SSL)</p></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Create it in Google Account → Security → App passwords (2-Step Verification must be on). It is sent once to the server and never shown again; changing your Google password cancels it.</p>
          </>}
          <div className="space-y-1.5"><Label htmlFor={`${entryKey}-gm-label`}>Gmail label <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${entryKey}-gm-label`} maxLength={40} value={m.label} onChange={(e) => set({ label: e.target.value })} placeholder="eShareGoal" /></div>
          <div className="space-y-1.5"><Label htmlFor={`${entryKey}-gm-days`}>First sync reads back (days)</Label><Input id={`${entryKey}-gm-days`} type="number" min={1} max={365} value={m.days} onChange={(e) => set({ days: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })} /></div>
        </div>
      </fieldset>

      {editable && <div className="flex flex-wrap items-center gap-2">
        {(!connected || dirty) && <Button disabled={signing} onClick={connect}>{signing ? <Loader2 className="animate-spin" aria-hidden /> : m.method === "oauth" ? <LogIn aria-hidden /> : <KeyRound aria-hidden />}{m.method === "oauth" ? (saved?.connected ? "Sign in again and save" : "Sign in with Google") : saved?.connected ? "Save and reconnect" : "Connect"}</Button>}
        <Button variant="outline" disabled={!connected || test === "testing"} title={connected ? undefined : "Sign in first"} onClick={runTest}>{test === "testing" ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />} Test connection</Button>
        {saved?.connected && <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { store({ ...saved, connected: undefined }, `Gmail signed out for ${goalName}`); setM({ ...saved, connected: undefined }); setTest("idle"); }}><Unplug aria-hidden /> Sign out</Button>}
        {dirty && saved?.connected && <span className="text-xs text-warning">Changed: sign in again to save</span>}
      </div>}

      {test === "done" && connected && (
        <ul role="status" className="space-y-1 rounded-lg border p-3 text-sm">
          <li className="flex items-center gap-2 text-success"><CircleCheck className="size-4" aria-hidden /> Signed in as {saved!.address} · {saved!.method === "oauth" ? "read-only access (gmail.readonly), token valid" : "IMAP login OK, read-only"}</li>
          <li className="flex items-center gap-2 text-success"><CircleCheck className="size-4" aria-hidden /> {saved!.label ? `Label "${saved!.label}" found · ` : ""}{recent} emails in the last {saved!.days} days (sample inbox)</li>
          <li className={cn("flex items-center gap-2", jobs ? "text-success" : "text-warning")}>{jobs ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />} {jobs ? `${jobs} Gmail import ${jobs === 1 ? "job reads" : "jobs read"} this inbox` : "No Gmail import job yet: add one in Scheduled jobs"}</li>
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">Simulated in v1: nothing connects and no password or token is kept. <Badge variant="outline" className="ml-1 font-normal">Preview</Badge></p>
        <AppSetup />
      </div>
    </div>
  );
}
