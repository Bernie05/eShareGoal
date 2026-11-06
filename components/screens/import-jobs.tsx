"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Info, Loader2, Mail, Pencil, Play, Plus, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete, type Deleting } from "@/components/app/confirm-delete";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRecordId, useGoalRecords, writeRecords } from "@/components/app/records";
import { refreshImported } from "@/components/app/imported-records";
import { addJobRun, newReviewId, saveReviewItems, useJobRuns, useReviewItems, type ReviewItem } from "@/components/app/import-store";
import { saveOwnWorkflows, useImportWorkflows, useOwnWorkflows } from "@/components/app/workflow-store";
import { isoDate, SAMPLE_EMAILS, type SampleEmail } from "@/lib/gmail-import";
import { TODAY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { cardMatch, DEFAULT_IMPORT_SCHEDULE, gmailQuery, importJobsFor, memberFor, paramRules, payerOf, runWorkflow, suggestRules, whereLabel, withTimerJobs, workflowProblems, type ImportJob, type ImportWorkflow, type Json, type PayerRule } from "@/lib/import-workflows";
import { mailboxFor, type Mailbox, type Schedule, type SetupSettings } from "@/lib/group-settings";
import { gmailReadJobAction, gmailStatusAction } from "@/app/actions/gmail";
import { goalJobsAction, saveGoalImportsAction, sendToReviewAction } from "@/app/actions/import-setup";
import type { ImportRead, ImportRun } from "@/lib/server/gmail";
import { useUserCards } from "@/components/app/card-editor";
import type { CardMatch } from "@/lib/user-cards";
import { peso } from "@/lib/money";
import { blankRules, JsonView, missingRoles, MustContain, newRulesId, ReadList, ResultObject, RulesEditor, WorkflowInfo } from "./import-workflows";
import { cron, human, nextRuns, ScheduleFields, when } from "./schedule";
import { CAR_CREDIT, GMAIL_IMPORT_MAX, GMAIL_IMPORT_NOTE, GMAIL_TEST_DAYS, LOCALE, OWN_PREFIX, SAMPLE_PASTE_MIN, WORKFLOW_LIMITS } from "@/lib/constants";

// ---------- Gmail import jobs of one goal: each runs one workflow on the connected inbox, on its own schedule ----------
// A job holds its own filter and target fields, and maps each payer to a member.
// With a real connection, Run now reads the inbox on the server. Otherwise it is simulated on the fictional sample emails.
// Either way deposits go to Import review (sample goals) or straight into the goal's records (goals made in the preview).
export type ImportGoal = { id: string; members: string[]; money: boolean; created: boolean };
const note = (ref: string) => `${GMAIL_IMPORT_NOTE} · ${ref}`;
const newJobId = () => `ij-${Date.now().toString(36)}`;
/** Why a payment is not new: already a record of the goal, already in Import review (from any job), or found twice in this run. */
type Seen = "record" | "review" | "rejected" | "twice" | null;
type Row = { e: ImportRead; json: Json; deposit: boolean; member: string | null; payer: string | null; ref: string; seen: Seen };
type Known = { records: Set<string>; review: Set<string>; rejected: Set<string> };
const NONE: Known = { records: new Set(), review: new Set(), rejected: new Set() };
const refOf = (n: string) => (n.startsWith("Gmail import · ") ? n.slice("Gmail import · ".length) : null);

/** What one job finds in the inbox: every email its workflow reads, who paid, and whether it is new.
 *  known: references already in the goal's records or waiting in Import review, across all of its jobs. */
function runJob(job: ImportJob, w: ImportWorkflow, reads: ImportRead[], byCard: CardMatch, known: Known = NONE): Row[] {
  const here = new Set<string>();
  return reads.map((r) => {
    const ref = String(r.json.reference ?? r.json.messageId);
    const has = (keys: Set<string>) => keys.has(ref) || keys.has(r.id);
    const seen: Seen = has(known.rejected) ? "rejected" : has(known.review) ? "review" : has(known.records) ? "record" : here.has(ref) ? "twice" : null;
    here.add(ref);
    return { e: r, json: r.json, deposit: r.deposit, member: memberFor(job.map, r.json, byCard), payer: payerOf(w, r.json)?.value ?? null, ref, seen };
  });
}
/** What a workflow reads from the fictional sample inbox. */
const sampleReads = (w: ImportWorkflow): ImportRead[] => SAMPLE_EMAILS.flatMap((e) => {
  const r = runWorkflow(w, e, w.find);
  return r.step === 2 ? [{ id: e.id, received: e.received, json: r.json, deposit: r.deposit }] : [];
});
/** True when this goal reads a real inbox, false when it is simulated, null until the server answers. */
function useLiveInbox(entryKey: string, mailbox?: Mailbox) {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    gmailStatusAction(entryKey).then((r) => { if (on) setConnected(r.ok && !!r.data.connection); }, () => { if (on) setConnected(false); });
    return () => { on = false; };
  }, [entryKey, mailbox?.address]);
  return connected === null ? null : connected && mailbox?.method === "oauth";
}

interface PayerMapProps {
  w: ImportWorkflow;
  map: PayerRule[];
  setMap: (m: PayerRule[]) => void;
  members: string[];
  found: Row[];
  idPrefix: string;
}
// ---------- Payer → member rules ----------
function PayerMap({ w, map, setMap, members, found, idPrefix }: PayerMapProps) {
  const payerFields = w.fields.filter((f) => f.payer);
  const setRule = (i: number, patch: Partial<PayerRule>) => setMap(map.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const addRule = (field = payerFields[0]?.key ?? "", value = "") => setMap([...map, { field, value, member: members[0] ?? "" }]);
  const unmapped = [...new Map(found.filter((r) => r.deposit && !r.member).map((r) => payerOf(w, r.json)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [`${p.field}:${p.value}`, p])).values()];
  return (
    <div className="space-y-2">
      <ul className="space-y-2">{map.map((m, i) => (
        <li key={i} className="grid grid-cols-[9rem_1fr] items-center gap-2 sm:grid-cols-[10rem_1fr_auto_10rem_auto]">
          <NativeSelect id={`${idPrefix}-f-${i}`} aria-label={`Rule ${i + 1}: match by`} value={m.field} onChange={(e) => setRule(i, { field: e.target.value })}>
            {payerFields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
            {!payerFields.some((f) => f.key === m.field) && <option value={m.field}>{m.field} (no longer read)</option>}
          </NativeSelect>
          <Input aria-label={`Rule ${i + 1}: value`} value={m.value} maxLength={40} onChange={(e) => setRule(i, { value: e.target.value })} />
          <span className="hidden text-sm text-muted-foreground sm:block">→</span>
          <NativeSelect aria-label={`Rule ${i + 1}: member`} value={m.member} onChange={(e) => setRule(i, { member: e.target.value })}>{members.map((x) => <option key={x}>{x}</option>)}</NativeSelect>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove rule ${i + 1}`} onClick={() => setMap(map.filter((_, j) => j !== i))}><X aria-hidden /></Button>
        </li>
      ))}</ul>
      {map.length < WORKFLOW_LIMITS.rules && payerFields.length > 0 && <Button variant="outline" size="sm" onClick={() => addRule()}><Plus aria-hidden /> Add rule</Button>}
      {unmapped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Found in the inbox, not mapped:</span>
          {unmapped.map((p) => <Button key={`${p.field}:${p.value}`} variant="outline" size="xs" onClick={() => addRule(p.field, p.value)}><Plus aria-hidden /> {p.value}</Button>)}
        </div>
      )}
    </div>
  );
}

interface ImportJobDialogProps {
  job: ImportJob | null;
  /** The filter and fields the job runs now, when it has any. */
  rules?: ImportWorkflow;
  entryKey: string; mailbox?: Mailbox; members: string[]; live: boolean; onClose: () => void;
  /** rules: only when they changed. */
  onSave: (j: ImportJob, rules?: ImportWorkflow) => boolean;
}
type GmailTest = { run: ImportRun } | { error: string } | "testing" | null;
const JOB_STEPS = ["Paste an email", "Check what it reads", "Who paid and when"];
// ---------- Create or change an import job, all in one place ----------
// Pasting a sample sets the job up (lib/import-workflows.ts suggestRules); the steps are for checking it. The Result panel stays
// beside every step, so each change shows what it does. A saved job opens on step 2, because it has no sample to paste again.
function ImportJobDialog({ job, rules, entryKey, mailbox, members, live, onClose, onSave }: ImportJobDialogProps) {
  const cards = useUserCards();
  const [now] = useState(() => new Date());
  const [name, setName] = useState(job?.name ?? "");
  const [s, setS] = useState<Schedule>(job?.schedule ?? DEFAULT_IMPORT_SCHEDULE);
  const [w, setW] = useState<ImportWorkflow>(() => rules ?? blankRules());
  const [map, setMap] = useState<PayerRule[]>(() => paramRules({ w, map: job?.map ?? [], cards, members }));
  const [sample, setSample] = useState<SampleEmail>({ id: "sample", from: "", to: "", subject: "", received: `${TODAY} 00:00`, body: "" });
  const [gmail, setGmail] = useState<GmailTest>(null);
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState(rules ? 2 : 1);
  const test = useRef(0); // a changed filter makes any answer still on its way out of date
  const changed = !rules || JSON.stringify([w.find, w.fields]) !== JSON.stringify([rules.find, rules.fields]);
  const update = (next: ImportWorkflow) => {
    const payers = (x: ImportWorkflow) => x.fields.filter((f) => f.payer).map((f) => f.key).join();
    setW(next); test.current++; setGmail(null);
    if (payers(next) !== payers(w)) setMap(paramRules({ w: next, map: map.filter((r) => r.value.trim() && next.fields.some((f) => f.payer && f.key === r.field)), cards, members }));
  };
  const named = { ...w, name: name.trim() || rules?.name || "Import job" };
  const problems = workflowProblems(named, []);
  const draft: ImportJob = { id: job?.id ?? "", on: true, schedule: s, workflow: w.id, map };
  const byCard = cardMatch(w, cards, members);
  const gmailRows = gmail && gmail !== "testing" && "run" in gmail ? runJob(draft, w, gmail.run.reads, byCard) : [];
  const sampleRead = sample.body.trim() ? runWorkflow(w, sample, w.find) : null;
  const sampleRows = sampleRead?.step === 2 ? runJob(draft, w, [{ id: sample.id, received: sample.received, json: sampleRead.json, deposit: sampleRead.deposit }], byCard) : [];
  const proven = sampleRows.some((r) => r.deposit) || gmailRows.some((r) => r.deposit);
  const testGmail = () => {
    if (problems.find) return void setTried(true);
    const asked = ++test.current;
    setGmail("testing");
    const answer = (g: GmailTest) => { if (asked === test.current) setGmail(g); };
    gmailReadJobAction(entryKey, { ...named, id: w.id || OWN_PREFIX + "test" }, mailbox?.label ?? "", w.find.days || GMAIL_TEST_DAYS)
      .then((r) => answer(r.ok ? { run: r.data } : { error: r.error }), () => answer({ error: "Could not reach the server. Try again." }));
  };
  const save = () => {
    setTried(true);
    if (Object.keys(problems).length) { setStep(2); return void toast.error(missingRoles(w) ?? "Fix the highlighted fields first"); }
    if (changed && !proven) return void toast.error("Test this filter first", { description: "Paste a sample email or use Test on Gmail, so one email becomes a payment." });
    const saved = changed ? { ...named, id: w.id.startsWith(OWN_PREFIX) ? w.id : newRulesId(), about: "", status: "Published" as const, builtIn: false, updated: new Date().toISOString() } : undefined;
    const workflow = saved?.id ?? w.id, seen = saved?.updated ?? w.updated;
    if (onSave({ id: job?.id ?? newJobId(), ...(name.trim() && { name: name.trim() }), on: job?.on ?? true, schedule: s, workflow, map: map.filter((m) => m.value.trim()), seen }, saved)) {
      toast.success(job ? "Import job saved" : `${named.name} added`); onClose();
    }
  };
  const setUp = (from: SampleEmail) => { const { conds, fields } = suggestRules(from); update({ ...w, fields, find: { ...w.find, match: [conds] } }); };
  const setBody = (body: string) => {
    const next = { ...sample, body };
    setSample(next);
    const empty = !w.fields.length && !w.find.match.flat().some((c) => c.value.trim());
    if (!rules && empty && body.length - sample.body.length > SAMPLE_PASTE_MIN) setUp(next);
  };
  const missing = missingRoles(w);
  const email = sample.body.trim() ? sample : null;
  const result = sampleRows[0] ?? gmailRows[0];
  const last = step === JOB_STEPS.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{job ? `Edit ${job.name ?? rules?.name ?? "import job"}` : "New Gmail import job"}</DialogTitle>
          <nav aria-label="Setup steps"><ol className="flex flex-wrap gap-x-5 gap-y-1 pt-1">{JOB_STEPS.map((label, i) => (
            <li key={label}><button type="button" aria-current={step === i + 1 ? "step" : undefined} onClick={() => setStep(i + 1)} className={cn("flex items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", step === i + 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full text-xs", step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted")}>{i + 1}</span>{label}
            </button></li>
          ))}</ol></nav>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-5">
            {step === 1 && <>
              <div className="space-y-1.5">
                <Label htmlFor="ij-body">Paste one real payment email</Label>
                <Textarea id="ij-body" rows={14} autoFocus maxLength={WORKFLOW_LIMITS.body} value={sample.body} onChange={(e) => setBody(e.target.value)} placeholder="Open a payment alert in Gmail, select all of it, copy, and paste it here." />
                <p className="text-xs text-muted-foreground">{w.fields.length ? `Found ${w.fields.length} ${w.fields.length === 1 ? "value" : "values"} to read. It is only used to set up this job and is not saved.` : "It is only used to set up this job and is not saved."}</p>
              </div>
              {rules && email && <Button variant="outline" size="sm" onClick={() => setUp(sample)}><Sparkles aria-hidden /> Replace the setup using this email</Button>}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Add the sender and subject (optional)</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="ij-from">From</Label><Input id="ij-from" value={sample.from} onChange={(e) => setSample({ ...sample, from: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="ij-to">To</Label><Input id="ij-to" value={sample.to} onChange={(e) => setSample({ ...sample, to: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label htmlFor="ij-subject">Subject</Label><Input id="ij-subject" value={sample.subject} onChange={(e) => setSample({ ...sample, subject: e.target.value })} /></div>
                </div>
              </details>
            </>}
            {step === 2 && <>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">What to read from each email</h3>
                <ReadList w={w} onChange={update} email={email} json={result?.json} />
                {missing && <p className="text-xs text-warning">{missing}</p>}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Only import emails that contain all of these</h3>
                <MustContain w={w} onChange={update} email={email} />
                {tried && problems.find && <p role="alert" className="text-xs text-destructive">{problems.find}</p>}
              </section>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Advanced: OR conditions, patterns, Gmail label, how far back to look</summary>
                <div className="mt-3"><RulesEditor w={w} onChange={update} tried={tried} email={email} /></div>
              </details>
            </>}
            {step === 3 && <>
              <div className="space-y-1.5"><Label htmlFor="ij-name">Job name</Label><Input id="ij-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={rules?.name ?? "e.g. BPI transfers"} /></div>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Who each payer is</h3>
                {w.fields.some((f) => f.payer) ? <>
                  <PayerMap w={w} map={map} setMap={setMap} members={members} found={gmailRows.length ? gmailRows : sampleRows} idPrefix="ij-map" />
                  <p className="text-xs text-muted-foreground">Cards saved on a member fill in here. A rule always wins.</p>
                </> : <p className="text-xs text-warning">Go back to step 2 and pick which value is Who paid.</p>}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">When to pull new emails</h3>
                <ScheduleFields s={s} setS={setS} id="ij" />
                <p className="text-xs text-muted-foreground">Next pulls: {nextRuns(s, now).map(when).join(" · ")} (Asia/Manila)</p>
              </section>
            </>}
          </div>
          <aside className="min-w-0 space-y-4 rounded-lg bg-muted/30 p-3 lg:sticky lg:top-0 lg:self-start">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Result</h3>
              {result?.deposit && <p className="text-sm">{typeof result.json.amount === "number" ? peso(result.json.amount) : ""} from {result.payer ?? "?"} {result.member ? <>goes to <span className="font-medium">{result.member}</span></> : <span className="text-warning">has no member yet</span>}</p>}
              <ResultObject w={w} email={sample} />
            </section>
            <section className="space-y-2 border-t pt-3">
              <Button variant="outline" size="sm" className="w-full" disabled={!live || gmail === "testing"} onClick={testGmail}>{gmail === "testing" ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />} Test on Gmail</Button>
              <p className="text-xs text-muted-foreground">{live ? <>Runs on <span className="font-medium text-foreground">{mailbox?.address}</span>. Nothing is imported.</> : "Connect Gmail in Integrations to test on the real inbox."}</p>
              {gmail && gmail !== "testing" && "error" in gmail && <p role="alert" className="text-sm text-destructive">{gmail.error}</p>}
              {gmail && gmail !== "testing" && "run" in gmail && (gmailRows.length ? <>
                <p className="text-sm font-medium">{gmailRows.length} {gmailRows.length === 1 ? "email matches" : "emails match"}</p>
                <ul className="divide-y text-sm">{gmailRows.map((r) => (
                  <li key={r.e.id} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate"><span className="num">{isoDate(r.e)}</span> · {r.payer ?? "-"}</span>
                    <span className="shrink-0 text-right"><span className="num">{typeof r.json.amount === "number" ? peso(r.json.amount) : "-"}</span> {r.member ?? <span className="text-warning">No member</span>}</span>
                  </li>
                ))}</ul>
                {gmail.run.more && <p className="text-xs text-warning">More than {GMAIL_IMPORT_MAX} emails match. Only the newest are shown.</p>}
                {!email && <JsonView json={gmailRows[0].json} />}
              </> : <p className="text-sm text-muted-foreground">No email in the inbox matches this filter.</p>)}
            </section>
          </aside>
        </div>
        <DialogFooter className="items-center">
          {changed && <p role="status" className={cn("mr-auto text-xs", proven ? "text-success" : "text-muted-foreground")}>{proven ? "Test passed: an email becomes a payment." : "Saving needs one email that becomes a payment. Paste one or use Test on Gmail."}</p>}
          <Button variant="outline" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</Button>
          {!last && <Button variant={job ? "outline" : "default"} onClick={() => setStep(step + 1)}>Next</Button>}
          {(last || job) && <Button onClick={save}>{job ? "Save job" : "Add job"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RunDialogProps {
  /** The linked inbox to read, or null to simulate on the sample emails. */
  inbox: Mailbox | null;
  job: ImportJob;
  w: ImportWorkflow;
  goal: ImportGoal;
  goalName: string;
  entryKey: string;
  onClose: () => void;
}
// ---------- One run: what the job found, and where its new payments go ----------
// Goals made in the preview take mapped payments straight into their records; sample goals send every new payment to
// Import review, where an Owner confirms it (and picks the member when no rule matched). Each run is logged for the job card.
function RunDialog({ inbox, job, w, goal, goalName, entryKey, onClose }: RunDialogProps) {
  const records = useGoalRecords(goal.id);
  const review = useReviewItems();
  const runs = useJobRuns();
  const cards = useUserCards();
  const [run, setRun] = useState<ImportRun | null>(null);
  const [held, setHeld] = useState<Awaited<ReturnType<typeof refreshImported>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!inbox) return;
    let on = true;
    // Read together: new payments are only offered once we know what the server already holds.
    Promise.all([gmailReadJobAction(entryKey, w, inbox.label, inbox.days), refreshImported(entryKey, true)]).then(([r, h]) => { if (!on) return; if (r.ok) { setHeld(h); setRun(r.data); } else setError(r.error); }, () => { if (on) setError("Could not reach the server. Try again."); });
    return () => { on = false; };
  }, [entryKey, inbox, w]);
  const queue = held?.review ?? [];
  const reading = !!inbox && !run && !error;
  const rows = runJob(job, w, inbox ? run?.reads ?? [] : sampleReads(w), cardMatch(w, cards, goal.members), {
    records: new Set([...(held?.keys ?? []), ...records.flatMap((r) => [r.ref, refOf(r.note)].filter((x): x is string => !!x))]),
    review: new Set([...review.filter((r) => r.goalId === goal.id && r.status === "Pending Review"), ...queue.filter((r) => r.status === "Pending Review")].flatMap((r) => [r.ref, r.msg])),
    rejected: new Set(queue.filter((r) => r.status === "Rejected").flatMap((r) => [r.ref, r.msg])),
  });
  const fresh = rows.filter((r) => r.deposit && !r.seen);
  const ready = goal.created ? fresh.filter((r) => r.member) : fresh;
  const finish = (added: number) => {
    if (!inbox || run) addJobRun(runs, { jobId: job.id, entryKey, at: new Date().toISOString(), read: rows.length, added, duplicates: rows.filter((r) => r.seen).length, unmapped: fresh.filter((r) => !r.member).length });
    onClose();
  };
  const sendToOwners = async () => {
    const items = ready.map((r) => ({ member: r.member ?? "", day: isoDate(r.e), amount: r.json.amount as number, ref: r.ref, msg: r.e.id, payer: r.payer ?? "", job: job.name ?? w.name }));
    const res = await sendToReviewAction({ entry: entryKey, items }).catch(() => null);
    if (!res?.ok) return void toast.error(res?.error ?? "Could not reach the server. Nothing was sent; try again.");
    await refreshImported(entryKey).catch(() => {});
    toast.success(`${res.data.sent} ${res.data.sent === 1 ? "payment" : "payments"} sent to Import review`, { description: "The goal's Owners were notified. They count once confirmed." });
    finish(res.data.sent);
  };
  const add = () => {
    if (inbox && goal.id === CAR_CREDIT) return void sendToOwners();
    const failed = () => toast.error("Could not save. This browser's storage is full or blocked.");
    if (goal.created) {
      if (!writeRecords(goal.id, [...ready.map((r) => ({ id: newRecordId(), member: r.member!, date: isoDate(r.e), note: note(r.ref), ref: r.ref, amount: r.json.amount as number, direction: "in" as const })), ...records])) return failed();
      toast.success(`${ready.length} deposits added to ${goalName}`, { description: ready.map((r) => `${r.member} ${peso(r.json.amount as number)}`).join(" · ") });
    } else {
      const found = new Date().toISOString();
      const items: ReviewItem[] = ready.map((r) => ({ id: newReviewId(), goalId: goal.id, goal: goalName, job: job.name ?? w.name, amount: r.json.amount as number, date: isoDate(r.e), ref: r.ref, payer: r.payer ?? "", member: r.member ?? "", msg: r.e.id, found, status: "Pending Review" }));
      if (!saveReviewItems([...items, ...review])) return failed();
      toast.success(`${items.length} ${items.length === 1 ? "payment" : "payments"} sent to Import review`, { description: "Confirm them there before they count." });
    }
    finish(ready.length);
  };
  const status = (r: Row) => r.seen === "record" ? <Badge variant="secondary">Already added</Badge> : r.seen === "review" ? <Badge variant="secondary">In Import review</Badge> : r.seen === "rejected" ? <Badge variant="outline">Rejected</Badge> : r.seen === "twice" ? <Badge variant="outline">Duplicate</Badge>
    : !r.deposit ? <Badge variant="outline">Not a deposit</Badge> : r.member ? <Badge className="border-0 bg-success/15 text-success">New</Badge> : <Badge variant="outline" className="border-warning/40 text-warning">New · needs a member</Badge>;
  return (
    <Dialog open onOpenChange={(o) => !o && finish(0)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Run {job.name ?? w.name}</DialogTitle>
          <DialogDescription>Gmail search <code className="rounded bg-muted px-1 font-mono text-xs">{run?.query ?? gmailQuery(w.find)}</code> · {inbox ? `your real inbox, ${inbox.address}` : "simulated on the sample inbox"}. Payments already added, or already in Import review from any job, are skipped.</DialogDescription>
        </DialogHeader>
        {reading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Reading your inbox…</p>
          : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
          : rows.length ? <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Payer</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reference</TableHead><TableHead>Member</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.e.id}>
              <TableCell className="num">{isoDate(r.e)}</TableCell><TableCell>{r.payer ?? "-"}</TableCell>
              <TableCell className="num text-right">{typeof r.json.amount === "number" ? peso(r.json.amount) : "-"}</TableCell><TableCell className="font-mono text-xs">{r.ref}</TableCell>
              <TableCell>{r.member ?? <span className="text-warning">Not mapped</span>}</TableCell>
              <TableCell>{status(r)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div> : <p className="text-sm text-muted-foreground">No email matches this workflow&apos;s Where.</p>}
        {run?.more && <p className="text-xs text-warning">Only the newest {GMAIL_IMPORT_MAX} matching emails were read. Run it again after adding these, or narrow the workflow&apos;s Where.</p>}
        {goal.created && fresh.some((r) => !r.member) && <p className="text-xs text-warning">Payments with no member are not added. Add a payer rule to the job, then run it again.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(0)}>Close</Button>
          {goal.money && <Button disabled={!ready.length} onClick={add}>{goal.created ? `Add ${ready.length} ${ready.length === 1 ? "deposit" : "deposits"}` : `Send ${ready.length} to Import review`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ImportJobsProps {
  entryKey: string; goal: ImportGoal; goalName: string; settings: SetupSettings; editable: boolean; onChange: (s: SetupSettings) => void; creating?: boolean; onCreated?: () => void;
}
// creating: the Scheduled jobs tab's "New scheduled job" chose a Gmail import job; onCreated closes it.
export function ImportJobs({ entryKey, goal, goalName, settings, editable, onChange, creating, onCreated }: ImportJobsProps) {
  const common = useImportWorkflows().filter((w) => w.status === "Published");
  const own = useOwnWorkflows();
  const all = [...common, ...own];
  const jobs = importJobsFor(entryKey, settings);
  const mailbox = mailboxFor(entryKey, settings);
  const live = useLiveInbox(entryKey, mailbox);
  const [editing, setEditing] = useState<ImportJob | "new" | null>(null);
  const [running, setRunning] = useState<{ job: ImportJob; w: ImportWorkflow } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [reviewing, setReviewing] = useState<{ job: ImportJob; w: ImportWorkflow } | null>(null);
  const runs = useJobRuns();
  const cards = useUserCards();
  const [timer, setTimer] = useState(false);
  const saveJobs = (next: ImportJob[], changedRules?: ImportWorkflow) => {
    onChange({ ...settings, imports: next, serverImports: settings.serverImports || timer });
    const undo = (why: string) => { toast.error("Could not save the job", { description: why }); onChange({ ...settings, imports: jobs }); };
    const usedOwn = [...own.filter((w) => w.id !== changedRules?.id), ...(changedRules ? [changedRules] : [])].filter((w) => next.some((j) => j.workflow === w.id));
    saveGoalImportsAction(entryKey, next, usedOwn).then((r) => { if (!r.ok) undo(r.error); }, () => undo("The server could not be reached. Try again."));
    return true;
  };
  // A goal that runs on the timer but was never saved sends its list up, so the scheduler and the screens share one list.
  useEffect(() => {
    let on = true;
    goalJobsAction(entryKey).then((r) => {
      if (!on || !r.ok || !r.data.timer) return;
      setTimer(true);
      const fromServer = r.data.workflows; // a job's filter must also show on a device that did not write it
      if (fromServer.length) saveOwnWorkflows([...own.filter((w) => !fromServer.some((x) => x.id === w.id)), ...fromServer]);
      if (!r.data.jobs && editable) saveJobs(withTimerJobs(entryKey, jobs));
    }, () => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per goal
  }, [entryKey]);
  const setJob = (j: ImportJob, rules?: ImportWorkflow) => {
    if (rules && !saveOwnWorkflows([...own.filter((w) => w.id !== rules.id), rules])) return void toast.error("Could not save. This browser's storage is full or blocked."), false;
    if (jobs.some((x) => x.id === j.id)) return saveJobs(jobs.map((x) => (x.id === j.id ? j : x)), rules);
    if (jobs.length >= WORKFLOW_LIMITS.jobs) return void toast.error(`Up to ${WORKFLOW_LIMITS.jobs} Gmail import jobs per goal. Delete one first.`), false;
    return saveJobs([...jobs, j], rules);
  };

  if (!settings.integrations.includes("gmail")) return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><Mail className="mr-1.5 inline size-4" aria-hidden />Gmail import jobs need Gmail: connect it in <span className="font-medium text-foreground">Integrations</span> first.</p>;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="size-4" aria-hidden /> Gmail import jobs</CardTitle>
        <CardDescription>Each job reads {mailbox?.connected ? <span className="font-medium text-foreground">{mailbox.address}</span> : "the Gmail inbox"} on its schedule. Add one with New scheduled job.{timer && " The server runs jobs at 12:00 AM on their scheduled days and adds each new payment to this goal."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mailbox?.connected && <p className="flex items-center gap-2 rounded-lg border border-warning/40 p-2 text-sm text-warning"><TriangleAlert className="size-4 shrink-0" aria-hidden /> Gmail is not signed in yet, so these jobs cannot run. Finish the connection in Integrations → Gmail.</p>}
        {jobs.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">No Gmail import job yet. Click New scheduled job and pick Pull payments from Gmail, once for each bank or e-wallet your members pay through.</p>}
        <ul className="space-y-2">{jobs.map((j) => {
          const w = all.find((x) => x.id === j.workflow);
          const rows = w && !live ? runJob(j, w, sampleReads(w), cardMatch(w, cards, goal.members)) : []; // a real inbox is only read on Run now
          const last = runs.find((r) => r.jobId === j.id && r.entryKey === entryKey);
          const changed = !!w && !!j.seen && w.updated > j.seen;
          const unmapped = rows.filter((r) => r.deposit && !r.member).length;
          return (
            <li key={j.id} className={j.on ? "rounded-lg border p-3" : "rounded-lg border p-3 opacity-75"}>
              <div className="flex flex-wrap items-start gap-3">
                <Switch checked={j.on} disabled={!editable} onCheckedChange={(on) => { setJob({ ...j, on }); toast(`${j.name ?? w?.name ?? "Import job"} ${on ? "turned on" : "paused"}`); }} aria-label={`${j.name ?? w?.name}: ${j.on ? "on" : "off"}`} className="mt-1" />
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{j.name ?? w?.name ?? "Import job"}<Badge variant="outline" className="font-normal">Gmail import</Badge></p>
                  {!w && <p className="text-sm text-warning">Its filter is missing, so this job imports nothing. Edit it to set one.</p>}
                  {w && <p className="line-clamp-2 text-xs text-muted-foreground">Where {whereLabel(w.find)}</p>}
                  <p className="text-sm">{human(j.schedule)} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{cron(j.schedule)}</span></p>
                  {changed && (
                    <p className="flex flex-wrap items-center gap-x-2 rounded-md border border-info/40 bg-info/5 px-2 py-1 text-xs"><Info className="size-3.5 text-info" aria-hidden /> Its filter was updated {w!.updated.slice(0, 10)}.
                      <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setReviewing({ job: j, w: w! })}>Review</Button>
                      {editable && <Button variant="link" size="xs" className="h-auto px-0" onClick={() => { setJob({ ...j, seen: w!.updated }); toast("Marked as reviewed"); }}>Mark as reviewed</Button>}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{last
                    ? <>Last run {new Date(last.at).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {last.read} read · {last.added} {goal.created ? "added" : "sent to review"}{last.duplicates > 0 && ` · ${last.duplicates} skipped`}{last.unmapped > 0 && <span className="text-warning"> · {last.unmapped} without a member</span>}</>
                    : "Not run yet"}</p>
                  <p className="text-xs text-muted-foreground">{j.map.length} payer {j.map.length === 1 ? "rule" : "rules"}{unmapped > 0 && <span className="text-warning"> · {unmapped} found {unmapped === 1 ? "payment has" : "payments have"} no member</span>}</p>
                </div>
                {editable && <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col">
                  <Button variant="outline" size="sm" disabled={!j.on || !w || !mailbox?.connected || live === null} onClick={() => w && setRunning({ job: j, w })}><Play aria-hidden /> Run now</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(j)}><Pencil aria-hidden /> Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting({ name: j.name ?? w?.name ?? "this job", note: "It stops reading Gmail for this goal. Records already added stay.", remove: () => saveJobs(jobs.filter((x) => x.id !== j.id)) })}><Trash2 aria-hidden /> Delete</Button>
                </div>}
              </div>
            </li>
          );
        })}</ul>

      </CardContent>

      {(editing || creating) && <ImportJobDialog job={editing && editing !== "new" ? editing : null} rules={editing && editing !== "new" ? all.find((x) => x.id === editing.workflow) : undefined} entryKey={entryKey} mailbox={mailbox} members={goal.members} live={!!live} onClose={() => { setEditing(null); onCreated?.(); }} onSave={setJob} />}
      {running && <RunDialog inbox={live ? mailbox! : null} job={running.job} w={running.w} goal={goal} goalName={goalName} entryKey={entryKey} onClose={() => setRunning(null)} />}
      {reviewing && (
        <Dialog open onOpenChange={(o) => !o && setReviewing(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{reviewing.w.name} was updated</DialogTitle><DialogDescription>This is what {reviewing.job.name ?? "this job"} runs now. Check that its Where and fields still suit your inbox and payer rules.</DialogDescription></DialogHeader>
            <WorkflowInfo w={reviewing.w} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewing(null)}>Close</Button>
              {editable && <Button onClick={() => { setJob({ ...reviewing.job, seen: reviewing.w.updated }); setReviewing(null); toast("Marked as reviewed"); }}>Mark as reviewed</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {deleting && <ConfirmDelete item={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}
