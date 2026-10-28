"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Info, Mail, Pencil, Play, Plus, Trash2, TriangleAlert, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete, type Deleting } from "@/components/app/confirm-delete";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newRecordId, useGoalRecords, writeRecords } from "@/components/app/records";
import { addJobRun, newReviewId, saveReviewItems, useJobRuns, useReviewItems, type ReviewItem } from "@/components/app/import-store";
import { OWN_PREFIX, saveOwnWorkflows, useImportWorkflows, useOwnWorkflows } from "@/components/app/workflow-store";
import { isoDate, SAMPLE_EMAILS } from "@/lib/gmail-import";
import { DEFAULT_IMPORT_SCHEDULE, gmailQuery, LIMITS, memberFor, runWorkflow, SAMPLE_IMPORT_JOBS, whereLabel, type ImportJob, type ImportWorkflow, type Json, type PayerRule } from "@/lib/import-workflows";
import { mailboxFor, type Schedule, type SetupSettings } from "@/lib/group-settings";
import { peso } from "@/lib/money";
import { blankWorkflow, WorkflowEditor, WorkflowInfo } from "./import-workflows";
import { cron, human, nextRuns, ScheduleFields, when } from "./schedule";

// ---------- Gmail import jobs of one goal: each runs one workflow on the connected inbox, on its own schedule ----------
// A job uses a common workflow (System Admin, published) or one of the Owner's own (sidebar → Workflows), and maps each payer to a member.
// Running is simulated: the "inbox" is the fictional sample emails, and deposits go to Import review (sample goals)
// or straight into the goal's records (goals made in the preview).
export type ImportGoal = { id: string; members: string[]; money: boolean; created: boolean };
const note = (ref: string) => `Gmail import · ${ref}`;
const newJobId = () => `ij-${Date.now().toString(36)}`;
const payerOf = (w: ImportWorkflow, json: Json) => { const f = w.fields.find((x) => x.payer && json[x.key] != null); return f ? { field: f.key, value: String(json[f.key]) } : null; };
/** Why a payment is not new: already a record of the goal, already in Import review (from any job), or found twice in this run. */
type Seen = "record" | "review" | "twice" | null;
type Row = { e: (typeof SAMPLE_EMAILS)[number]; json: Json; deposit: boolean; member: string | null; payer: string | null; ref: string; seen: Seen };
type Known = { records: Set<string>; review: Set<string> };
const NONE: Known = { records: new Set(), review: new Set() };
const refOf = (n: string) => (n.startsWith("Gmail import · ") ? n.slice("Gmail import · ".length) : null);

/** What one job finds in the inbox: every email its workflow reads, who paid, and whether it is new.
 *  known: references already in the goal's records or waiting in Import review, across all of its jobs. */
function runJob(job: ImportJob, w: ImportWorkflow, known: Known = NONE): Row[] {
  const here = new Set<string>();
  return SAMPLE_EMAILS.flatMap((e) => {
    const r = runWorkflow(w, e, w.find);
    if (r.step !== 2) return [];
    const ref = String(r.json.reference ?? r.json.messageId);
    const seen: Seen = known.records.has(ref) ? "record" : known.review.has(ref) ? "review" : here.has(ref) ? "twice" : null;
    here.add(ref);
    return [{ e, json: r.json, deposit: r.deposit, member: memberFor(job.map, r.json), payer: payerOf(w, r.json)?.value ?? null, ref, seen }];
  });
}

// ---------- Payer → member rules ----------
function PayerMap({ w, map, setMap, members, found, idPrefix }: { w: ImportWorkflow; map: PayerRule[]; setMap: (m: PayerRule[]) => void; members: string[]; found: Row[]; idPrefix: string }) {
  const payerFields = w.fields.filter((f) => f.payer);
  const setRule = (i: number, patch: Partial<PayerRule>) => setMap(map.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const addRule = (field = payerFields[0]?.key ?? "", value = "") => setMap([...map, { field, value, member: members[0] ?? "" }]);
  const unmapped = [...new Map(found.filter((r) => r.deposit && !memberFor(map, r.json)).map((r) => payerOf(w, r.json)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [`${p.field}:${p.value}`, p])).values()];
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
      {map.length < LIMITS.rules && payerFields.length > 0 && <Button variant="outline" size="sm" onClick={() => addRule()}><Plus aria-hidden /> Add rule</Button>}
      {unmapped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Found in the inbox, not mapped:</span>
          {unmapped.map((p) => <Button key={`${p.field}:${p.value}`} variant="outline" size="xs" onClick={() => addRule(p.field, p.value)}><Plus aria-hidden /> {p.value}</Button>)}
        </div>
      )}
    </div>
  );
}

// ---------- Create or change an import job ----------
function ImportJobDialog({ job, common, own, members, days, onClose, onSave }: {
  job: ImportJob | null; common: ImportWorkflow[]; own: ImportWorkflow[]; members: string[]; days: number; onClose: () => void; onSave: (j: ImportJob) => boolean;
}) {
  const all = [...common, ...own];
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date());
  const [name, setName] = useState(job?.name ?? "");
  const [wid, setWid] = useState(job && all.some((w) => w.id === job.workflow) ? job.workflow : all[0]?.id ?? "");
  const [s, setS] = useState<Schedule>(job?.schedule ?? DEFAULT_IMPORT_SCHEDULE);
  const [map, setMap] = useState<PayerRule[]>(job?.map ?? []);
  const w = all.find((x) => x.id === wid);
  const found = w ? runJob({ id: "", on: true, schedule: s, workflow: w.id, map }, w) : [];
  const save = () => {
    if (!w) return void toast.error("Pick a workflow first");
    if (onSave({ id: job?.id ?? newJobId(), ...(name.trim() && { name: name.trim() }), on: job?.on ?? true, schedule: s, workflow: w.id, map: map.filter((m) => m.value.trim()), seen: w.updated })) {
      toast.success(job ? "Import job saved" : `${name.trim() || w.name} added`); onClose();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job ? `Edit ${job.name ?? w?.name ?? "import job"}` : "New Gmail import job"}</DialogTitle>
          <DialogDescription>Runs a workflow on the connected Gmail inbox on a schedule, and adds each payment to the member who made it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ij-name">Name</Label><Input id="ij-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={w?.name ?? "e.g. BPI transfers"} /></div>
            <div className="space-y-1.5"><Label htmlFor="ij-wf">Workflow</Label>
              <NativeSelect id="ij-wf" value={wid} onChange={(e) => setWid(e.target.value)}>
                {!all.length && <option value="">No workflow yet</option>}
                {common.length > 0 && <optgroup label="Common (System Admin)">{common.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
                {own.length > 0 && <optgroup label="My workflows">{own.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>}
              </NativeSelect>
              <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setCreating(true)}><Plus aria-hidden /> Create a new workflow</Button>
            </div>
          </div>
          {w && <div className="rounded-lg border bg-muted/20 p-3"><WorkflowInfo w={w} /></div>}
          <section className="space-y-2">
            <h4 className="text-sm font-medium">When to pull new emails</h4>
            <ScheduleFields s={s} setS={setS} id="ij" />
            <p className="text-xs text-muted-foreground">Next pulls: {nextRuns(s, now).map(when).join(" · ")} (Asia/Manila)</p>
          </section>
          {w && <section className="space-y-1.5 rounded-lg border p-3">
            <h4 className="text-sm font-medium">What each pull does</h4>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Searches Gmail for new emails since the last pull (the first pull reads back {days} days): <code className="rounded bg-muted px-1 font-mono">{gmailQuery(w.find)}</code></li>
              <li>Keeps only the emails that match the workflow&apos;s Where: {whereLabel(w.find)}.</li>
              <li>Reads each one into JSON: {w.fields.map((f) => f.key).join(", ")}.</li>
              <li>Finds the member who paid with the rules below. Payments with no member wait for you.</li>
              <li>Sends each new payment to Import review for an Owner to confirm. A reference already added, or already waiting in review from any job, is skipped.</li>
            </ol>
          </section>}
          {w && <section className="space-y-2">
            <h4 className="text-sm font-medium">Map payers to members <span className="font-normal text-muted-foreground">· {w.fields.filter((f) => f.payer).map((f) => f.label || f.key).join(" or ")}</span></h4>
            <PayerMap w={w} map={map} setMap={setMap} members={members} found={found} idPrefix="ij-map" />
          </section>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!w} onClick={save}>{job ? "Save job" : "Add job"}</Button>
        </DialogFooter>
      </DialogContent>
      {creating && <WorkflowEditor owner initial={blankWorkflow()} all={all} onClose={() => setCreating(false)}
        onSave={(saved) => { const ok = saveOwnWorkflows([...own, saved]); if (ok) setWid(saved.id); return ok; }} />}
    </Dialog>
  );
}

// ---------- One run: what the job found, and where its new payments go ----------
// Goals made in the preview take mapped payments straight into their records; sample goals send every new payment to
// Import review, where an Owner confirms it (and picks the member when no rule matched). Each run is logged for the job card.
function RunDialog({ job, w, goal, goalName, entryKey, onClose }: { job: ImportJob; w: ImportWorkflow; goal: ImportGoal; goalName: string; entryKey: string; onClose: () => void }) {
  const records = useGoalRecords(goal.id);
  const review = useReviewItems();
  const runs = useJobRuns();
  const rows = runJob(job, w, {
    records: new Set(records.flatMap((r) => [r.ref, refOf(r.note)].filter((x): x is string => !!x))),
    review: new Set(review.filter((r) => r.goalId === goal.id && r.status !== "Rejected").map((r) => r.ref)),
  });
  const fresh = rows.filter((r) => r.deposit && !r.seen);
  const ready = goal.created ? fresh.filter((r) => r.member) : fresh;
  const finish = (added: number) => {
    addJobRun(runs, { jobId: job.id, entryKey, at: new Date().toISOString(), read: rows.length, added, duplicates: rows.filter((r) => r.seen).length, unmapped: fresh.filter((r) => !r.member).length });
    onClose();
  };
  const add = () => {
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
  const status = (r: Row) => r.seen === "record" ? <Badge variant="secondary">Already added</Badge> : r.seen === "review" ? <Badge variant="secondary">In Import review</Badge> : r.seen === "twice" ? <Badge variant="outline">Duplicate</Badge>
    : !r.deposit ? <Badge variant="outline">Not a deposit</Badge> : r.member ? <Badge className="border-0 bg-success/15 text-success">New</Badge> : <Badge variant="outline" className="border-warning/40 text-warning">New · needs a member</Badge>;
  return (
    <Dialog open onOpenChange={(o) => !o && finish(0)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Run {job.name ?? w.name}</DialogTitle>
          <DialogDescription>Gmail search <code className="rounded bg-muted px-1 font-mono text-xs">{gmailQuery(w.find)}</code> · simulated on the sample inbox. Payments already added, or already in Import review from any job, are skipped.</DialogDescription>
        </DialogHeader>
        {rows.length ? <div className="overflow-x-auto"><Table>
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
        {goal.created && fresh.some((r) => !r.member) && <p className="text-xs text-warning">Payments with no member are not added. Add a payer rule to the job, then run it again.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(0)}>Close</Button>
          {goal.money && <Button disabled={!ready.length} onClick={add}>{goal.created ? `Add ${ready.length} ${ready.length === 1 ? "deposit" : "deposits"}` : `Send ${ready.length} to Import review`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// creating: the Scheduled jobs tab's "New scheduled job" chose a Gmail import job; onCreated closes it.
export function ImportJobs({ entryKey, goal, goalName, settings, editable, onChange, creating, onCreated }: {
  entryKey: string; goal: ImportGoal; goalName: string; settings: SetupSettings; editable: boolean; onChange: (s: SetupSettings) => void; creating?: boolean; onCreated?: () => void;
}) {
  const common = useImportWorkflows().filter((w) => w.status === "Published");
  const own = useOwnWorkflows();
  const all = [...common, ...own];
  const jobs = settings.imports ?? SAMPLE_IMPORT_JOBS[entryKey] ?? [];
  const mailbox = mailboxFor(entryKey, settings);
  const [editing, setEditing] = useState<ImportJob | "new" | null>(null);
  const [running, setRunning] = useState<{ job: ImportJob; w: ImportWorkflow } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [reviewing, setReviewing] = useState<{ job: ImportJob; w: ImportWorkflow } | null>(null);
  const runs = useJobRuns();
  const saveJobs = (next: ImportJob[]) => { onChange({ ...settings, imports: next }); return true; };
  const setJob = (j: ImportJob) => {
    if (jobs.some((x) => x.id === j.id)) return saveJobs(jobs.map((x) => (x.id === j.id ? j : x)));
    if (jobs.length >= LIMITS.jobs) return void toast.error(`Up to ${LIMITS.jobs} Gmail import jobs per goal. Delete one first.`), false;
    return saveJobs([...jobs, j]);
  };

  if (!settings.integrations.includes("gmail")) return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><Mail className="mr-1.5 inline size-4" aria-hidden />Gmail import jobs need Gmail: connect it in <span className="font-medium text-foreground">Integrations</span> first.</p>;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="size-4" aria-hidden /> Gmail import jobs</CardTitle>
        <CardDescription>Each job runs a workflow on {mailbox?.connected ? <span className="font-medium text-foreground">{mailbox.address}</span> : "the Gmail inbox"} on its schedule. Add one with New scheduled job.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mailbox?.connected && <p className="flex items-center gap-2 rounded-lg border border-warning/40 p-2 text-sm text-warning"><TriangleAlert className="size-4 shrink-0" aria-hidden /> Gmail is not signed in yet, so these jobs cannot run. Finish the connection in Integrations → Gmail.</p>}
        {jobs.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">No Gmail import job yet. Click New scheduled job and pick Pull payments from Gmail, once for each bank or e-wallet your members pay through.</p>}
        <ul className="space-y-2">{jobs.map((j) => {
          const w = all.find((x) => x.id === j.workflow);
          const rows = w ? runJob(j, w) : [];
          const last = runs.find((r) => r.jobId === j.id && r.entryKey === entryKey);
          const changed = !!w && !!j.seen && w.updated > j.seen;
          const unmapped = rows.filter((r) => r.deposit && !r.member).length;
          return (
            <li key={j.id} className={j.on ? "rounded-lg border p-3" : "rounded-lg border p-3 opacity-75"}>
              <div className="flex flex-wrap items-start gap-3">
                <Switch checked={j.on} disabled={!editable} onCheckedChange={(on) => { setJob({ ...j, on }); toast(`${j.name ?? w?.name ?? "Import job"} ${on ? "turned on" : "paused"}`); }} aria-label={`${j.name ?? w?.name}: ${j.on ? "on" : "off"}`} className="mt-1" />
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{j.name ?? w?.name ?? "Import job"}<Badge variant="outline" className="font-normal">Gmail import</Badge></p>
                  {w ? <p className="flex flex-wrap items-center gap-1.5 text-sm"><Workflow className="size-3.5 text-muted-foreground" aria-hidden />{w.name}<Badge variant="secondary" className="font-normal">{w.id.startsWith(OWN_PREFIX) ? "My workflow" : "Common"}</Badge></p>
                    : <p className="text-sm text-warning">Its workflow was unpublished or deleted, so this job imports nothing. Edit it to pick another.</p>}
                  {w && <p className="line-clamp-2 text-xs text-muted-foreground">Where {whereLabel(w.find)}</p>}
                  <p className="text-sm">{human(j.schedule)} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{cron(j.schedule)}</span></p>
                  {changed && (
                    <p className="flex flex-wrap items-center gap-x-2 rounded-md border border-info/40 bg-info/5 px-2 py-1 text-xs"><Info className="size-3.5 text-info" aria-hidden /> Its workflow was updated {w!.updated.slice(0, 10)}.
                      <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setReviewing({ job: j, w: w! })}>Review</Button>
                      {editable && <Button variant="link" size="xs" className="h-auto px-0" onClick={() => { setJob({ ...j, seen: w!.updated }); toast("Marked as reviewed"); }}>Mark as reviewed</Button>}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{last
                    ? <>Last run {new Date(last.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {last.read} read · {last.added} {goal.created ? "added" : "sent to review"}{last.duplicates > 0 && ` · ${last.duplicates} skipped`}{last.unmapped > 0 && <span className="text-warning"> · {last.unmapped} without a member</span>}</>
                    : "Not run yet"}</p>
                  <p className="text-xs text-muted-foreground">{j.map.length} payer {j.map.length === 1 ? "rule" : "rules"}{unmapped > 0 && <span className="text-warning"> · {unmapped} found {unmapped === 1 ? "payment has" : "payments have"} no member</span>}</p>
                </div>
                {editable && <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col">
                  <Button variant="outline" size="sm" disabled={!j.on || !w || !mailbox?.connected} onClick={() => w && setRunning({ job: j, w })}><Play aria-hidden /> Run now</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(j)}><Pencil aria-hidden /> Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting({ name: j.name ?? w?.name ?? "this job", note: "It stops reading Gmail for this goal. Records already added stay. The workflow stays available.", remove: () => saveJobs(jobs.filter((x) => x.id !== j.id)) })}><Trash2 aria-hidden /> Delete</Button>
                </div>}
              </div>
            </li>
          );
        })}</ul>

        <p className="border-t pt-3 text-xs text-muted-foreground">Workflows hold the logic each pull runs. Use the System Admin&apos;s common ones or make your own in <Link href="/design-preview/workflows" className="font-medium text-foreground underline underline-offset-2">Workflows</Link>.</p>
      </CardContent>

      {(editing || creating) && <ImportJobDialog job={editing && editing !== "new" ? editing : null} common={common} own={own} members={goal.members} days={mailbox?.days ?? 30} onClose={() => { setEditing(null); onCreated?.(); }} onSave={setJob} />}
      {running && <RunDialog job={running.job} w={running.w} goal={goal} goalName={goalName} entryKey={entryKey} onClose={() => setRunning(null)} />}
      {reviewing && (
        <Dialog open onOpenChange={(o) => !o && setReviewing(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{reviewing.w.name} was updated</DialogTitle><DialogDescription>This is the workflow {reviewing.job.name ?? "this job"} runs now. Check that its Where and fields still suit your inbox and payer rules.</DialogDescription></DialogHeader>
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
