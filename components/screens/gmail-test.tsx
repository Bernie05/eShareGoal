"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleMinus, CircleX, Loader2, LogIn, PlugZap, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useImportWorkflows, useOwnWorkflows } from "@/components/app/workflow-store";
import { SAMPLE_EMAILS } from "@/lib/gmail-import";
import { cardMatch, memberFor, runWorkflow, type ImportJob } from "@/lib/import-workflows";
import { useUserCards } from "@/components/app/card-editor";
import type { UserCard } from "@/lib/user-cards";
import type { Mailbox } from "@/lib/group-settings";
import type { ActionResult } from "@/lib/server/action";
import type { GmailEmail, GmailStep } from "@/lib/server/gmail";
import { cn } from "@/lib/utils";
import { LOCALE, STEP_MS } from "@/lib/constants";

// ---------- Test connection: checks the Gmail connection step by step, then dry-runs the goal's import jobs ----------
// Nothing is imported. With a real connection the server runs the checks (live). Otherwise they are simulated on the
// sample inbox, and "Simulate" shows what each failure looks like.
type Sim = "ok" | "offline" | "expired" | "account" | "label" | "empty";
const SIMS: [Sim, string][] = [["ok", "Everything works"], ["offline", "Google cannot be reached"], ["expired", "Sign-in expired or revoked"], ["account", "Signed in with another account"], ["label", "Label not found"], ["empty", "No recent emails"]];
type Result = "pass" | "warn" | "fail" | "skip";
type Step = { title: string; result: Result; detail: string; fix?: string; signIn?: boolean; emails?: boolean | GmailEmail[]; jobs?: { name: string; line: string; warn: boolean }[] };

function checks(sim: Sim, mb: Mailbox, jobs: ImportJob[], workflows: ReturnType<typeof useImportWorkflows>, cards: UserCard[], members: string[]): Step[] {
  const oauth = mb.method === "oauth";
  const inbox = sim === "empty" ? [] : SAMPLE_EMAILS;
  const steps: Step[] = [
    sim === "offline" ? { title: "Reach Google", result: "fail", detail: "Google did not answer (network problem, or Google is down).", fix: "Try again in a few minutes. Scheduled pulls retry on their own." }
      : { title: "Reach Google", result: "pass", detail: oauth ? "gmail.googleapis.com answered." : "imap.gmail.com:993 answered (SSL)." },
    sim === "expired" ? { title: oauth ? "Google sign-in" : "IMAP login", result: "fail", signIn: true,
        detail: oauth ? "The sign-in expired or was revoked in your Google Account." : "Google rejected the app password (it is cancelled when the Google password changes).",
        fix: oauth ? "Sign in with Google again." : "Create a new app password and connect again." }
      : sim === "account" ? { title: oauth ? "Google sign-in" : "IMAP login", result: "fail", signIn: true, detail: `Signed in as other.person@gmail.com, not ${mb.address}.`, fix: `Sign in again with ${mb.address}.` }
      : { title: oauth ? "Google sign-in" : "IMAP login", result: "pass", detail: `Signed in as ${mb.address}.` },
    { title: "Read-only access", result: "pass", detail: oauth ? "gmail.readonly granted: eShareGoal can read email, nothing else." : "IMAP is on; mail is only read, never changed." },
    !mb.label.trim() ? { title: "Gmail label", result: "skip", detail: "No label set: the whole inbox is searched." }
      : sim === "label" ? { title: "Gmail label", result: "fail", detail: `There is no label "${mb.label}" in this Gmail.`, fix: "Create the label (and a filter that adds it) in Gmail, or clear it here." }
      : { title: "Gmail label", result: "pass", detail: `Label "${mb.label}" found.` },
    inbox.length ? { title: "Read recent emails", result: "pass", detail: `${inbox.length} emails in the last ${mb.days} days (sample inbox).`, emails: true }
      : { title: "Read recent emails", result: "warn", detail: `No emails in the last ${mb.days} days.`, fix: "Check that bank and e-wallet alerts go to this address, or read back more days." },
  ];
  steps.push({ title: "Confirmation email", result: "skip", detail: "Not sent: this test is simulated. A real connection emails the inbox when the test passes." });
  const on = jobs.filter((j) => j.on);
  steps.push(!on.length
    ? { title: "Dry run of import jobs", result: "warn", detail: "No import job is on yet, so nothing reads this inbox.", fix: "Add one: Scheduled jobs → New scheduled job → Pull payments from Gmail." }
    : (() => {
      const lines = on.map((j) => {
        const w = workflows.find((x) => x.id === j.workflow);
        if (!w) return { name: j.name ?? "Import job", line: "its filter is missing", warn: true };
        const found = inbox.map((e) => runWorkflow(w, e, w.find)).filter((r) => r.step === 2 && r.deposit);
        const unmapped = found.filter((r) => r.step === 2 && !memberFor(j.map, r.json, cardMatch(w, cards, members))).length;
        return { name: j.name ?? w.name, line: `${found.length} ${found.length === 1 ? "payment" : "payments"} found${unmapped ? ` · ${unmapped} without a member` : ""}`, warn: !found.length || unmapped > 0 };
      });
      return { title: "Dry run of import jobs", result: lines.some((l) => l.warn) ? "warn" : "pass", detail: "What each job would find now. Nothing is imported.", jobs: lines } as Step;
    })());
  return steps;
}

const ICON: Record<Result, typeof CircleCheck> = { pass: CircleCheck, warn: TriangleAlert, fail: CircleX, skip: CircleMinus };
const TONE: Record<Result, string> = { pass: "text-success", warn: "text-warning", fail: "text-destructive", skip: "text-muted-foreground" };
const at = (iso: string) => new Date(iso).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

interface ConnectionTestProps {
  entryKey: string; mailbox: Mailbox; jobs: ImportJob[]; members: string[]; disabled?: boolean; onPassed: (iso: string) => void; onSignIn?: () => void; live?: () => Promise<ActionResult<GmailStep[]>>;
}
/** mailbox: the saved, signed-in inbox. onPassed: saves when the test last passed. onSignIn: starts signing in again.
 *  live: runs the real checks on the server (a real connection). */
export function ConnectionTest({ entryKey, mailbox, jobs, members, disabled, onPassed, onSignIn, live }: ConnectionTestProps) {
  const workflows = [...useImportWorkflows().filter((w) => w.status === "Published"), ...useOwnWorkflows()];
  const cards = useUserCards();
  const [sim, setSim] = useState<Sim>("ok");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const [asking, setAsking] = useState(false);
  const show = (all: Step[]) => {
    // Stop at the first failure: later steps depend on it.
    const cut = all.findIndex((s) => s.result === "fail");
    const list = cut < 0 ? all : [...all.slice(0, cut + 1), ...all.slice(cut + 1).map((s) => ({ ...s, result: "skip" as const, detail: "Not checked: fix the step above first.", fix: undefined, emails: false, jobs: undefined }))];
    setSteps(list); setShown(0);
    if (timer.current) clearInterval(timer.current);
    let i = 0;
    timer.current = setInterval(() => {
      i++; setShown(i);
      if (i >= list.length) {
        clearInterval(timer.current!); timer.current = null;
        if (!list.some((s) => s.result === "fail")) onPassed(new Date().toISOString());
      }
    }, STEP_MS);
  };
  const run = async () => {
    if (!live) return show(checks(sim, mailbox, jobs, workflows, cards, members));
    setAsking(true); setSteps(null);
    const r = await live();
    setAsking(false);
    show(r.ok ? [...r.data, { title: "Dry run of import jobs", result: "skip", detail: "Not part of this test. Use Run now on a job in Scheduled jobs to read this inbox." }]
      : [{ title: "Reach the server", result: "fail", detail: r.error }]);
  };
  const running = asking || (!!steps && shown < steps.length);
  const failed = steps?.some((s) => s.result === "fail");
  const warned = steps?.some((s) => s.result === "warn");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" disabled={disabled || running} title={disabled ? "Sign in first" : undefined} onClick={run}>{running ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />} Test connection</Button>
        {!live && <div className="space-y-1"><Label htmlFor={`${entryKey}-sim`} className="text-xs font-normal text-muted-foreground">Simulate (preview)</Label>
          <NativeSelect id={`${entryKey}-sim`} className="h-8 w-56" value={sim} onChange={(e) => setSim(e.target.value as Sim)}>{SIMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
        </div>}
        {mailbox.tested && <span className="pb-1.5 text-xs text-muted-foreground">Last passed {at(mailbox.tested)}</span>}
      </div>

      {steps && (
        <div role="status" aria-live="polite" className="rounded-lg border">
          <ol className="divide-y">
            {steps.map((s, i) => {
              const done = i < shown, now = i === shown && running;
              const Icon = ICON[s.result];
              return (
                <li key={s.title} className={cn("flex gap-3 p-3 text-sm", !done && !now && "opacity-50")}>
                  {done ? <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[s.result])} aria-hidden /> : now ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{s.title}{!done && <span className="sr-only">{now ? ": checking" : ": waiting"}</span>}</p>
                    {done && <>
                      <p className="text-muted-foreground">{s.detail}</p>
                      {s.fix && <p className={cn("text-xs", TONE[s.result])}>{s.fix}</p>}
                      {s.signIn && onSignIn && <Button size="xs" variant="outline" onClick={onSignIn}><LogIn aria-hidden /> Sign in again</Button>}
                      {s.emails && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show the latest emails</summary>
                          <ul className="mt-1.5 divide-y rounded-md border">{(Array.isArray(s.emails) ? s.emails : SAMPLE_EMAILS.slice(0, 6)).map((e) => (
                            <li key={`${e.received}${e.subject}`} className="flex flex-wrap gap-x-3 px-2 py-1"><span className="w-28 shrink-0 text-muted-foreground">{e.received}</span><span className="min-w-0 flex-1 truncate">{e.subject}</span><span className="truncate text-muted-foreground">{e.from}</span></li>
                          ))}</ul>
                        </details>
                      )}
                      {s.jobs && <ul className="space-y-0.5 text-xs">{s.jobs.map((j) => <li key={j.name}><span className="font-medium">{j.name}</span>: <span className={j.warn ? "text-warning" : "text-muted-foreground"}>{j.line}</span></li>)}</ul>}
                    </>}
                  </div>
                </li>
              );
            })}
          </ol>
          {!running && (
            <p className={cn("flex items-center gap-2 border-t px-3 py-2 text-sm font-medium", failed ? "text-destructive" : warned ? "text-warning" : "text-success")}>
              {failed ? <><CircleX className="size-4" aria-hidden /> The connection has a problem: import jobs cannot read Gmail until it is fixed.</>
                : warned ? <><TriangleAlert className="size-4" aria-hidden /> Connected, with something to check above.</>
                : <><CircleCheck className="size-4" aria-hidden /> Connected: import jobs can read this inbox.</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
