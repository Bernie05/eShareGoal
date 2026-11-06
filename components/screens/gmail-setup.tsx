"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleHelp, Repeat, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importJobsFor } from "@/lib/import-workflows";
import { mailboxFor, type Mailbox, type SetupSettings } from "@/lib/group-settings";
import { gmailStatusAction, gmailTestAction } from "@/app/actions/gmail";
import type { GmailStatus } from "@/lib/server/gmail";
import { ConnectionTest } from "./gmail-test";

// ---------- Gmail for one goal: the linked inbox. What to read is in Scheduled jobs (Gmail import jobs) ----------
// Gmail cannot be read with an API key: reading a person's mail needs their consent. The real app uses Google sign-in
// (OAuth 2.0, server-side flow, scope gmail.readonly): the server keeps the refresh token, encrypted, so the scheduler can
// read new mail while the Owner is offline. Fallback: IMAP with a Google app password (needs 2-Step Verification).
// Google sign-in is real once the server has its Google keys (the server is then the source of truth for the connection).
// What came back from Google, in the address after signing in (app/api/gmail/callback).
const RETURNED: Record<string, [string, boolean]> = {
  connected: ["Gmail connected", true],
  denied: ["Gmail was not connected: access was not allowed", false],
  scope: ["Gmail was not connected: leave the Gmail box ticked on Google's page", false],
  failed: ["Gmail could not be connected. Try again.", false],
};

export function HowToConnect() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><CircleHelp aria-hidden /> How it connects</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>How Gmail connects</DialogTitle><DialogDescription>eShareGoal only reads; it never sends, changes or deletes email. Access to Gmail never gives access to a bank account.</DialogDescription></DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Turn on email alerts for incoming transfers in your bank or e-wallet app, sent to this Gmail address.</li>
            <li><span className="font-medium">Google sign-in:</span> click <span className="font-medium">Connect</span> on the Gmail row, choose the inbox and allow <span className="font-medium">read-only</span> access (gmail.readonly). Google gives eShareGoal a refresh token, kept encrypted on the server, so jobs run while you are offline.</li>
            <li><span className="font-medium">Or IMAP:</span> turn on 2-Step Verification, create an app password at myaccount.google.com/apppasswords, choose <span className="font-medium">Use an app password instead</span> and paste it. It is sent once to the server and never shown again.</li>
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
export function AppSetup() {
  const origin = typeof window === "undefined" ? "https://your-app" : window.location.origin;
  const rows: [string, string][] = [
    ["Google Cloud", "A project with the Gmail API enabled, and an OAuth consent screen with the gmail.readonly scope (a restricted scope: Google reviews the app before it can go public)."],
    ["AUTH_GOOGLE_ID", "OAuth client ID (type: Web application), in the server's environment variables. Same client as Google sign-in."],
    ["AUTH_GOOGLE_SECRET", "Its client secret, server only. Never in the browser or in git."],
    ["Redirect URI", `${origin}/api/gmail/callback`],
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

interface GmailStatusInput {
  entryKey: string;
  settings: SetupSettings;
  onChange: (s: SetupSettings) => void;
  /** Google sign-in just succeeded for this goal. */
  onLinked: () => void;
}
/** Keeps a goal's Gmail in step with the server, and reports what came back from Google. Runs once per goal, even before
 *  Gmail is added: signing in adds it. */
export function useGmailStatus({ entryKey, settings, onChange, onLinked }: GmailStatusInput) {
  const [live, setLive] = useState<GmailStatus | null>(null);
  useEffect(() => {
    let on = true;
    gmailStatusAction(entryKey).then((r) => {
      if (!on || !r.ok) return;
      setLive(r.data);
      const q = new URLSearchParams(window.location.search), back = q.get("gmail"), result = back ? RETURNED[back] : undefined;
      if (result && (q.get("gmailEntry") ?? entryKey) === entryKey) {
        if (result[1]) { toast.success(r.data.connection ? `${result[0]}: ${r.data.connection.email}` : result[0]); onLinked(); } else toast.error(result[0]);
        q.delete("gmail"); q.delete("gmailEntry");
        window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}${window.location.hash}`);
      }
      if (!r.data.configured || (r.data.devLink && !r.data.connection)) return; // development keeps simulated inboxes
      const saved = settings.mailbox ?? mailboxFor(entryKey, settings);
      const c = r.data.connection, was = saved?.method === "oauth" && saved.connected, added = settings.integrations.includes("gmail");
      const next: Mailbox | null = c ? { ...(saved ?? { label: "", days: 30 }), method: "oauth", address: c.email, connected: c.connectedAt.slice(0, 10) } : was ? { ...saved, connected: undefined, tested: undefined } : null;
      if (next && ((c && !added) || next.address !== saved?.address || next.connected !== saved?.connected || next.method !== saved?.method)) onChange({ ...settings, integrations: c && !added ? [...settings.integrations, "gmail"] : settings.integrations, mailbox: next });
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the goal changes; it writes the settings it reads
  }, [entryKey]);
  return [live, setLive] as const;
}

interface GmailSetupProps {
  entryKey: string;
  goalName: string;
  settings: SetupSettings;
  mailbox: Mailbox;
  /** The goal's members, for the dry run of its import jobs. */
  members: string[];
  live: GmailStatus | null;
  editable: boolean;
  onChange: (s: SetupSettings) => void;
  /** Opens the dialog that chooses another inbox. */
  onChangeInbox: () => void;
}
/** The linked inbox: which mail to read, and the connection test. Choosing the inbox itself is in GmailLinkDialog. */
export function GmailSetup({ entryKey, goalName, settings, mailbox, members, live, editable, onChange, onChangeInbox }: GmailSetupProps) {
  const [label, setLabel] = useState(mailbox.label);
  const [days, setDays] = useState(mailbox.days);
  const dirty = label !== mailbox.label || days !== mailbox.days;
  const real = mailbox.method === "oauth" && !!live?.connection; // the real Google sign-in, not the simulation
  const save = () => { onChange({ ...settings, mailbox: { ...mailbox, label: label.trim(), days } }); setLabel(label.trim()); toast.success(`Gmail settings saved for ${goalName}`); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm"><CircleCheck className="size-4 text-success" aria-hidden /> <span><span className="font-medium">{mailbox.address}</span> · {mailbox.method === "oauth" ? "Google sign-in" : "IMAP"} · since {mailbox.connected}</span></p>
        <div className="flex flex-wrap items-center gap-1">
          {editable && <Button variant="outline" size="sm" onClick={onChangeInbox}><Repeat aria-hidden /> Change inbox</Button>}
          <HowToConnect />
        </div>
      </div>

      <fieldset disabled={!editable} className="space-y-2">
        <legend className="sr-only">Which mail to read</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${entryKey}-gm-label`}>Gmail label <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${entryKey}-gm-label`} maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="eShareGoal" /></div>
          <div className="space-y-1.5"><Label htmlFor={`${entryKey}-gm-days`}>First sync reads back (days)</Label><Input id={`${entryKey}-gm-days`} type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} /></div>
        </div>
        {dirty && <Button size="sm" onClick={save}>Save changes</Button>}
      </fieldset>

      <ConnectionTest entryKey={entryKey} mailbox={mailbox} members={members} jobs={importJobsFor(entryKey, settings)} disabled={!editable}
        onPassed={(tested) => onChange({ ...settings, mailbox: { ...mailbox, tested } })} onSignIn={editable ? onChangeInbox : undefined}
        live={live?.connection && mailbox.method === "oauth" ? () => gmailTestAction(entryKey, mailbox.label, mailbox.days) : undefined} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {real ? <p className="text-xs text-muted-foreground">Real connection: access is read-only and stored encrypted.</p>
          : <p className="text-xs text-muted-foreground">Simulated: {mailbox.method === "imap" ? "IMAP does not connect yet" : live?.configured ? "this inbox never signed in with Google, so the test uses sample emails" : "the Google keys are not set on the server yet, so nothing connects"}, and no password or token is kept. <Badge variant="outline" className="ml-1 font-normal">Preview</Badge></p>}
        <AppSetup />
      </div>
    </div>
  );
}
