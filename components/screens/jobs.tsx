"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, Inbox, Mail, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { newJobId, saveCustomJobs, useCustomJobs, type CustomJob } from "@/components/app/custom-jobs";
import { Button } from "@/components/ui/button";
import { ConfirmDelete, type Deleting } from "@/components/app/confirm-delete";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/primitives";
import { JOBS, jobsFor, lockedFor, removedJobs, type JobId, type JobSetting, type Schedule, type SetupSettings, type Target } from "@/lib/group-settings";
import { EMAIL_JOBS, PLACEHOLDERS, renderEmail, type EmailTemplate } from "@/lib/email-templates";
import { useEmailTemplates } from "@/components/app/email-store";
import { useSendEmail } from "@/components/app/view-as";
import { overdueRunAction } from "@/app/actions/jobs";
import { peso } from "@/lib/money";
import type { OverdueLine } from "@/lib/server/overdue";
import { EmailPreview } from "./email-templates";
import { cron, human, ScheduleFields } from "./schedule";
import { ImportJobs, type ImportGoal } from "./import-jobs";
import { CAR_CREDIT_ENTRY, MAX_BODY } from "@/lib/constants";

// FICTIONAL run history per goal. Only Family's Car Credit has run anything in the sample data.
const SAMPLE_RUNS: Record<string, { last: Partial<Record<JobId, [string, boolean]>>; runs: [string, string, boolean, string][] }> = {
  [CAR_CREDIT_ENTRY]: {
    last: { "due-reminders": ["Oct 25, 9:00 AM", true], "overdue-check": ["Oct 26, 12:00 AM", true] },
    runs: [
      ["Oct 26, 12:00 AM", "Overdue check", true, "0 installments overdue"],
      ["Oct 25, 9:00 AM", "Due date reminders", true, "3 reminders sent to Bernz, Babylyn and Billy (Nov share due Nov 1, installment 12/60 due Nov 5)"],
      ["Oct 25, 8:00 AM", "Bank transfers (Gmail import)", true, "2 candidates, 1 duplicate skipped"],
      ["Oct 19, 8:00 AM", "Bank transfers (Gmail import)", false, "1 email could not be parsed"],
    ],
  },
};

interface EditScheduleProps {
  name: string;
  schedule: Schedule;
  onSave: (s: Schedule) => void;
}
function EditSchedule({ name, schedule, onSave }: EditScheduleProps) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(schedule);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setS(schedule); setOpen(true); }}><Pencil aria-hidden /> Edit schedule</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit schedule</DialogTitle><DialogDescription>{name} · times are Asia/Manila</DialogDescription></DialogHeader>
          <ScheduleFields s={s} setS={setS} id="j" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(s); setOpen(false); toast.success("Schedule saved"); }}>Save schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Mail = Pick<EmailTemplate, "subject" | "format" | "body" | "images">;
/** What a job of the Owner's sends: the template with this job's own subject and text, where it has them. */
const mailOf = (j: Pick<CustomJob, "subject" | "body">, t: EmailTemplate): Mail => ({ subject: j.subject ?? t.subject, body: j.body ?? t.body, format: t.format, images: t.images });
const TO = { all: "Every member", unpaid: "Members who have not paid this month's share" } as const;

interface CustomJobDialogProps {
  job: CustomJob | null;
  templates: EmailTemplate[];
  onClose: () => void;
  onSave: (j: CustomJob) => boolean;
}
// Create or change one of the Owner's jobs: pick a template the System Admin published, see it as members will,
// and change its subject or text for this job only (the Admin's template stays as it is).
function CustomJobDialog({ job, templates, onClose, onSave }: CustomJobDialogProps) {
  const kept = templates.find((t) => t.id === job?.template); // gone when the Admin unpublished it: start from another
  const first = kept ?? templates[0];
  const start = job && kept ? mailOf(job, kept) : first;
  const [name, setName] = useState(job?.name ?? "");
  const [tplId, setTplId] = useState(first?.id ?? "");
  const [to, setTo] = useState<CustomJob["to"]>(job?.to ?? "all");
  const [s, setS] = useState<Schedule>(job?.schedule ?? { freq: "monthly", time: "09:00", weekday: 1, day: 1 });
  const [subject, setSubject] = useState(start?.subject ?? "");
  const [body, setBody] = useState(start?.body ?? "");
  const [tried, setTried] = useState(false);
  const t = templates.find((x) => x.id === tplId);
  const pick = (id: string) => { const n = templates.find((x) => x.id === id); setTplId(id); if (n) { setSubject(n.subject); setBody(n.body); } };
  const edited = !!t && (subject !== t.subject || body !== t.body);
  const errors = { name: name.trim().length < 3 ? "Use at least 3 characters." : "", subject: subject.trim() ? "" : "Enter a subject.", body: body.trim() ? "" : "Enter the email text." };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <p role="alert" className="text-xs text-destructive">{errors[k]}</p> : null;
  const save = () => {
    setTried(true);
    if (!t || Object.values(errors).some(Boolean)) return;
    const next: CustomJob = { id: job?.id ?? newJobId(), name: name.trim(), on: job?.on ?? true, schedule: s, template: t.id, to,
      ...(subject !== t.subject && { subject }), ...(body !== t.body && { body }) };
    if (onSave(next)) { toast.success(job ? "Scheduled job saved" : `${next.name} created`); onClose(); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader><DialogTitle>{job ? "Edit scheduled job" : "New scheduled job"}</DialogTitle><DialogDescription>Sends an email from one of the System Admin&apos;s templates. Your changes apply to this job only. Times are Asia/Manila.</DialogDescription></DialogHeader>
        {!templates.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No published email templates yet. The System Admin creates them in Email templates.</p> : (
          <div className="grid max-h-[70vh] gap-4 overflow-y-auto lg:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="cj-name">Job name</Label><Input id="cj-name" maxLength={60} placeholder="e.g. Mid-month share reminder" value={name} onChange={(e) => setName(e.target.value)} />{err("name")}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="cj-tpl">Email template</Label>
                  <NativeSelect id="cj-tpl" value={tplId} onChange={(e) => pick(e.target.value)}>{templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.builtIn ? " (built in)" : ""}</option>)}</NativeSelect>
                </div>
                <div className="space-y-1.5"><Label htmlFor="cj-to">Send to</Label>
                  <NativeSelect id="cj-to" value={to} onChange={(e) => setTo(e.target.value as CustomJob["to"])}><option value="all">{TO.all}</option><option value="unpaid">{TO.unpaid}</option></NativeSelect>
                </div>
              </div>
              <ScheduleFields s={s} setS={setS} id="cj" />
              <div className="space-y-1.5"><Label htmlFor="cj-subject">Subject</Label><Input id="cj-subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />{err("subject")}</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="cj-body">Email text{t?.format === "html" && " (HTML)"}</Label>
                  {edited && <Button variant="ghost" size="sm" onClick={() => t && pick(t.id)}><RotateCcw aria-hidden /> Use the template&apos;s text</Button>}
                </div>
                <Textarea id="cj-body" rows={8} maxLength={MAX_BODY} className="font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
                {err("body")}
                <p className="text-xs text-muted-foreground">Filled in when it sends: {PLACEHOLDERS.map(([k]) => `{{${k}}}`).join(" ")}</p>
              </div>
            </div>
            <div className="flex min-h-96 flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">Preview {edited ? <Badge variant="secondary">Changed for this job</Badge> : <Badge variant="outline">As the Admin wrote it</Badge>}</p>
              {t && <EmailPreview t={{ subject, body, format: t.format, images: t.images }} className="flex-1" />}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!templates.length}>{job ? "Save job" : "Create job"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GroupJobsProps {
  entryKey: string;
  target: Target;
  goal: ImportGoal;
  goalName: string;
  settings: SetupSettings;
  editable: boolean;
  onChange: (s: SetupSettings) => void;
}
// ---------- Scheduled jobs (cron) of one goal. Owners and the System Admin change them; Members only view ----------
// Which jobs exist depends on the goal: Gmail jobs need Gmail connected to it, due-date jobs need a loan goal.
const DELIVERY: Record<OverdueLine["delivery"], string> = { sent: "email sent", test: "test email sent to you", "not-sent": "email not sent", already: "already notified" };
/** Runs the real overdue check and shows who owes what. Emails go out only when the email service is set up. */
async function runOverdue() {
  const r = await overdueRunAction();
  if (!r.ok) return void toast.error(r.error);
  const { lines } = r.data;
  if (!lines.length) return void toast.success("Overdue check: everyone has paid");
  toast(`Overdue check: ${lines.length} unpaid`, { duration: 15_000, description: lines.map((l) => `${l.member} · ${peso(l.amount)} · ${l.month} · ${DELIVERY[l.delivery]}`).join("\n") });
}

export function GroupJobs({ entryKey, target, goal, goalName, settings, editable, onChange }: GroupJobsProps) {
  const jobs = jobsFor(settings, target);
  const sample = SAMPLE_RUNS[entryKey];
  const update = (id: JobId, patch: Partial<JobSetting>) => {
    const j = jobs.find((x) => x.id === id)!;
    onChange({ ...settings, jobs: { ...settings.jobs, [id]: { on: j.on, schedule: j.schedule, template: j.template, ...patch } } });
  };
  const emails = useEmailTemplates();
  const send = useSendEmail();
  const [previewing, setPreviewing] = useState<{ name: string; mail: Mail } | null>(null);
  const custom = useCustomJobs(entryKey);
  const [editing, setEditing] = useState<CustomJob | "new" | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [newImport, setNewImport] = useState(false);
  const gmail = settings.integrations.includes("gmail");
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const removed = removedJobs(settings, target);
  const restore = (id: JobId) => onChange({ ...settings, jobs: { ...settings.jobs, [id]: { ...settings.jobs[id]!, removed: undefined } } });
  const published = emails.filter((t) => t.status === "Published");
  const saveJobs = (list: CustomJob[]) => saveCustomJobs(entryKey, list) || (toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed."), false);
  const setJob = (j: CustomJob) => saveJobs(custom.some((x) => x.id === j.id) ? custom.map((x) => (x.id === j.id ? j : x)) : [...custom, j]);
  // The template an email job sends: the Owner's pick while it is still published, else the job's built-in one.
  const templateOf = (id: JobId, picked?: string) => {
    const fallback = emails.find((t) => t.id === EMAIL_JOBS[id]);
    const t = picked ? emails.find((x) => x.id === picked && x.status === "Published") : undefined;
    return t ?? fallback;
  };
  const choices = (id: JobId) => emails.filter((t) => t.status === "Published" && (t.purpose === id || t.purpose === "any"));
  const missing = lockedFor(JOBS, settings, target);
  return (
    <div className="space-y-3">
      {editable && <div className="flex justify-end"><Button size="sm" onClick={() => setChoosing(true)}><Plus aria-hidden /> New scheduled job</Button></div>}
      <ImportJobs entryKey={entryKey} goal={goal} goalName={goalName} settings={settings} editable={editable} onChange={onChange} creating={newImport} onCreated={() => setNewImport(false)} />
      {jobs.length + custom.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No other scheduled jobs for this goal yet.</p>}
      <div className="space-y-3">
        {jobs.map((j) => {
          const last = sample?.last[j.id];
          return (
            <Card key={j.id} size="sm" className={j.on ? undefined : "opacity-75"}>
              <CardContent className="flex flex-wrap items-start gap-4">
                <Switch checked={j.on} disabled={!editable} onCheckedChange={(on) => { update(j.id, { on }); toast(`${j.name} ${on ? "turned on" : "paused"}`); }} aria-label={`${j.name}: ${j.on ? "on" : "off"}`} className="mt-1" />
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="font-medium">{j.name}</p>
                  <p className="text-sm text-muted-foreground">{j.what}</p>
                  <p className="text-sm">{human(j.schedule)} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{cron(j.schedule)}</span></p>
                  {EMAIL_JOBS[j.id] && (() => {
                    const t = templateOf(j.id, j.template);
                    return (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                        <Mail className="size-4 text-muted-foreground" aria-hidden />
                        <label htmlFor={`${entryKey}-tpl-${j.id}`} className="text-muted-foreground">Email template</label>
                        {editable
                          ? <NativeSelect id={`${entryKey}-tpl-${j.id}`} className="h-8 w-56" value={t?.id ?? ""} onChange={(e) => { update(j.id, { template: e.target.value === EMAIL_JOBS[j.id] ? undefined : e.target.value }); toast.success("Email template saved"); }}>
                              {choices(j.id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.builtIn ? " (built in)" : ""}</option>)}
                            </NativeSelect>
                          : <span id={`${entryKey}-tpl-${j.id}`} className="font-medium">{t?.name ?? "None"}</span>}
                        {t && <Button variant="ghost" size="sm" onClick={() => setPreviewing({ name: t.name, mail: t })}><Eye aria-hidden /> Preview</Button>}
                        {j.template && t?.id !== j.template && <span className="text-xs text-warning">The chosen template was unpublished; the built-in one is sent.</span>}
                      </div>
                    );
                  })()}
                </div>
                <dl className="grid w-full gap-1 text-sm sm:w-auto sm:min-w-44">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Next run</dt><dd>{j.on ? "On schedule" : "Paused"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last run</dt><dd>{last?.[0] ?? "Not run yet"}</dd></div>
                  {last && <div className="flex justify-end"><StatusBadge status={last[1] ? "Success" : "Failed"} /></div>}
                </dl>
                {editable && <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col">
                  <Button variant="outline" size="sm" disabled={!j.on} onClick={() => { if (j.id === "overdue-check") return void runOverdue(); const t = EMAIL_JOBS[j.id] && templateOf(j.id, j.template); if (t) send("the group's members", renderEmail(t).subject); else toast(`${j.name} started (simulated)`); }}><Play aria-hidden /> Run now</Button>
                  <EditSchedule name={j.name} schedule={j.schedule} onSave={(schedule) => update(j.id, { schedule })} />
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting({ name: j.name, note: "It stops running for this goal. You can restore it later from the bottom of this list.", remove: () => { update(j.id, { removed: true }); return true; } })}><Trash2 aria-hidden /> Delete</Button>
                </div>}
              </CardContent>
            </Card>
          );
        })}
        {custom.map((j) => {
          const t = emails.find((x) => x.id === j.template && x.status === "Published");
          const mail = t && mailOf(j, t);
          return (
            <Card key={j.id} size="sm" className={j.on ? undefined : "opacity-75"}>
              <CardContent className="flex flex-wrap items-start gap-4">
                <Switch checked={j.on} disabled={!editable} onCheckedChange={(on) => { if (setJob({ ...j, on })) toast(`${j.name} ${on ? "turned on" : "paused"}`); }} aria-label={`${j.name}: ${j.on ? "on" : "off"}`} className="mt-1" />
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{j.name}<Badge variant="outline" className="font-normal">Created by an Owner</Badge></p>
                  <p className="text-sm text-muted-foreground">Emails {TO[j.to].toLowerCase()}.</p>
                  <p className="text-sm">{human(j.schedule)} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{cron(j.schedule)}</span></p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                    <Mail className="size-4 text-muted-foreground" aria-hidden />
                    {t ? <>
                      <span className="font-medium">{t.name}</span>
                      {(j.subject !== undefined || j.body !== undefined) && <Badge variant="secondary">Changed for this job</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => setPreviewing({ name: j.name, mail: mail! })}><Eye aria-hidden /> Preview</Button>
                    </> : <span className="text-xs text-warning">Its template was unpublished or deleted, so this job sends nothing. Edit it to pick another.</span>}
                  </div>
                </div>
                <dl className="grid w-full gap-1 text-sm sm:w-auto sm:min-w-44">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Next run</dt><dd>{j.on ? "On schedule" : "Paused"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last run</dt><dd>Not run yet</dd></div>
                </dl>
                {editable && <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col">
                  <Button variant="outline" size="sm" disabled={!j.on || !mail} onClick={() => mail && send(j.to === "all" ? "the group's members" : "members who have not paid", renderEmail(mail).subject)}><Play aria-hidden /> Run now</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(j)}><Pencil aria-hidden /> Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting({ name: j.name, note: "It stops running and is removed from this goal. The email template stays available.", remove: () => saveJobs(custom.filter((x) => x.id !== j.id)) })}><Trash2 aria-hidden /> Delete</Button>
                </div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {choosing && (
        <Dialog open onOpenChange={(o) => !o && setChoosing(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>New scheduled job</DialogTitle><DialogDescription>What should run on a schedule for {goalName}?</DialogDescription></DialogHeader>
            <div role="list" className="grid gap-2">
              {([
                ["import", Inbox, "Pull payments from Gmail", "Pick a workflow (common or your own), set when to pull, and map each payer to a member.", gmail ? null : "Connect Gmail in Integrations first."],
                ["email", Mail, "Email members", "Pick an email template the System Admin published and when to send it.", null],
              ] as const).map(([kind, Icon, title, hint, why]) => (
                <button key={kind} type="button" role="listitem" disabled={!!why} onClick={() => { setChoosing(false); if (kind === "import") setNewImport(true); else setEditing("new"); }}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                  <span><span className="block font-medium">{title}</span><span className="block text-xs text-muted-foreground">{hint}</span>{why && <span className="block text-xs text-warning">{why}</span>}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {editing && <CustomJobDialog job={editing === "new" ? null : editing} templates={published} onClose={() => setEditing(null)} onSave={setJob} />}
      {deleting && <ConfirmDelete item={deleting} onClose={() => setDeleting(null)} />}
      {previewing && (
        <Dialog open onOpenChange={(o) => !o && setPreviewing(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>{previewing.name}</DialogTitle><DialogDescription>What members get, with sample values. The System Admin manages templates.</DialogDescription></DialogHeader>
            <EmailPreview t={previewing.mail} className="h-[60vh]" />
          </DialogContent>
        </Dialog>
      )}
      {removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Deleted from this goal:</span>
          {removed.map((j) => editable
            ? <Button key={j.id} variant="outline" size="xs" onClick={() => { restore(j.id); toast.success(`${j.name} restored`); }}><RotateCcw aria-hidden /> Restore {j.name}</Button>
            : <Badge key={j.id} variant="outline">{j.name}</Badge>)}
        </div>
      )}
      {missing.length > 0 && <p className="text-xs text-muted-foreground">Not available here: {missing.map((j) => `${j.name} (${j.why})`).join(" · ")}.</p>}
      {sample && <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle><CardDescription>Latest first. Failed runs retry on the next schedule.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {sample.runs.map(([at, job, ok, note]) => (
              <li key={at + job} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-36 text-muted-foreground">{at}</span><span className="flex-1 font-medium">{job}</span>
                <span className="text-muted-foreground">{note}</span><StatusBadge status={ok ? "Success" : "Failed"} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>}
    </div>
  );
}
