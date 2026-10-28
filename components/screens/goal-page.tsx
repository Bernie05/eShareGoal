"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChartColumn, ImageUp, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ProgressBar, StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { templateIcon } from "@/components/app/dashboard-preview";
import {
  MAX_PROOF_UPLOAD, newRecordId, newSubmissionId, PAYMENT_METHODS, shrinkImage, useGoalRecords, useGoalSubmissions, writeRecords, writeSubmissions, type GoalRecord, type Submission,
} from "@/components/app/records";
import { OwnerOnly, RoleBadge, useCreatedGoals, useMe, useSaveCreatedGoals, ViewAsProvider } from "@/components/app/view-as";
import { Textarea } from "@/components/ui/textarea";
import { FilePicker } from "@/components/app/file-picker";
import { Approvals, approvalGoalOf, MySubmissionsCard, ReviewDialog } from "@/components/app/approvals";
import type { ViewAs } from "@/lib/view-as";
import { MyGoalChart } from "./charts";
import { participantsOf, scopeOf, targetOf, type CreatedGoal } from "@/lib/created-goals";
import { widget, type FieldKind, type WidgetId } from "@/lib/goal-templates";
import { addMonths, fmtDate, peso } from "@/lib/money";
import { TODAY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const fmtValue = (kind: FieldKind, v: string) => (kind === "money" ? peso(Math.round(Number(v.replace(/,/g, "")) * 100)) : kind === "date" ? fmtDate(v) : v);
const Empty = ({ children }: { children: ReactNode }) => <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground"><ChartColumn className="size-4 shrink-0" aria-hidden />{children}</p>;
const months = Array.from({ length: 6 }, (_, i) => addMonths("2026-05-01", i).slice(0, 7)); // May-Oct 2026
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });

/** Everything the dashboard shows, worked out from the goal's records. */
// "single": one shared target for the group. "each": every participant has their own copy of the target,
// so progress is per person and the goal's overall progress is the average of theirs.
function summarize(g: CreatedGoal, records: GoalRecord[], members: string[]) {
  const m = g.template.measure;
  const target = targetOf(g);
  const each = scopeOf(g) === "each";
  const people = each ? participantsOf(g, members) : members;
  const mineOnly = each ? records.filter((r) => people.includes(r.member)) : records;
  const unitTarget = target ? (target.money ? Math.round(target.value * 100) : target.value) : 0; // per person (each) or for the group (single)
  const goalTarget = each ? unitTarget * people.length : unitTarget;
  const signed = (r: GoalRecord) => (r.direction === "out" ? -r.amount : r.amount);
  const tasks = mineOnly.filter((r) => r.title);
  const done = m === "checklist" ? tasks.filter((t) => t.done).length : m === "money" ? mineOnly.reduce((s, r) => s + signed(r), 0) : mineOnly.reduce((s, r) => s + r.amount, 0);
  const total = m === "checklist" ? tasks.length : goalTarget;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const byMember = people.map((name) => {
    const mine = mineOnly.filter((r) => r.member === name);
    const value = m === "checklist" ? mine.filter((r) => r.done).length : m === "money" && each ? mine.reduce((s, r) => s + signed(r), 0) : mine.filter((r) => r.direction !== "out").reduce((s, r) => s + r.amount, 0);
    const own = m === "checklist" ? mine.filter((r) => r.title).length : unitTarget; // a person's own target in an "each" goal
    const pct = each && own > 0 ? clamp((value / own) * 100) : 0;
    return { name, value, count: mine.length, latest: mine.map((r) => r.date).sort().at(-1) ?? "", pct, reached: each && own > 0 && value >= own };
  });
  const pct = each ? (byMember.length ? clamp(byMember.reduce((s, b) => s + b.pct, 0) / byMember.length) : 0) : total > 0 ? clamp((done / total) * 100) : 0;
  const reached = byMember.filter((b) => b.reached).length;
  const unit = g.values["Unit"] ?? g.values["Unit (kg, workouts…)"] ?? "";
  const show = (n: number) => (m === "money" ? peso(n) : m === "checklist" ? `${n} ${n === 1 ? "task" : "tasks"}` : `${n.toLocaleString("en-PH")}${unit ? ` ${unit}` : ""}`);
  return { m, target, goalTarget, unitTarget, done, total, pct, byMember, show, tasks, signed, each, people, reached };
}

// ---------- Add or edit a record (Owner only) ----------
function RecordDialog({ g, members, record, open, onClose }: { g: CreatedGoal; members: string[]; record: GoalRecord | null; open: boolean; onClose: () => void }) {
  const records = useGoalRecords(g.id);
  const m = g.template.measure;
  const blank: GoalRecord = { id: "", member: members[0] ?? "", date: TODAY, note: "", amount: 0, direction: m === "money" ? "in" : undefined, title: m === "checklist" ? "" : undefined, done: m === "checklist" ? false : undefined };
  const [r, setR] = useState<GoalRecord>(record ?? blank);
  const [amount, setAmount] = useState(record ? (m === "money" ? (record.amount / 100).toFixed(2) : String(record.amount)) : "");
  const [tried, setTried] = useState(false);
  const errors = {
    title: m === "checklist" && !r.title?.trim() ? "Enter what needs to be done." : "",
    amount: m === "checklist" ? "" : !/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, "")) || Number(amount.replace(/,/g, "")) <= 0 ? (m === "money" ? "Enter an amount like 1500 or 1500.50." : "Enter a number above 0.") : "",
    date: !r.date ? "Pick a date." : "",
  };
  const submit = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const value = m === "checklist" ? 0 : m === "money" ? Math.round(Number(amount.replace(/,/g, "")) * 100) : Number(amount);
    const saved: GoalRecord = { ...r, id: r.id || newRecordId(), amount: value, note: r.note.trim(), title: r.title?.trim() };
    const ok = writeRecords(g.id, record ? records.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...records]);
    if (!ok) return toast.error("Could not save. This browser's storage is full or blocked (private mode), and nothing was changed.");
    toast.success(record ? "Record updated" : "Record added");
    onClose();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <p role="alert" className="text-xs text-destructive">{errors[k]}</p> : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{record ? "Edit" : "Add"} {m === "checklist" ? "task" : "record"}</DialogTitle><DialogDescription>{g.name}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {m === "checklist" && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rec-title">Task</Label><Input id="rec-title" value={r.title ?? ""} onChange={(e) => setR({ ...r, title: e.target.value })} />{err("title")}</div>}
          <div className="space-y-1.5"><Label htmlFor="rec-member">{m === "checklist" ? "Assigned to" : "Member"}</Label><NativeSelect id="rec-member" value={r.member} onChange={(e) => setR({ ...r, member: e.target.value })}>{members.map((x) => <option key={x}>{x}</option>)}</NativeSelect></div>
          {m === "money" && <div className="space-y-1.5"><Label htmlFor="rec-dir">Type</Label><NativeSelect id="rec-dir" value={r.direction} onChange={(e) => setR({ ...r, direction: e.target.value as "in" | "out" })}><option value="in">Deposit (money in)</option><option value="out">Payment or expense (money out)</option></NativeSelect></div>}
          {m !== "checklist" && <div className="space-y-1.5"><Label htmlFor="rec-amount">{m === "money" ? "Amount (₱)" : `Value${g.values["Unit"] ?? g.values["Unit (kg, workouts…)"] ? ` (${g.values["Unit"] ?? g.values["Unit (kg, workouts…)"]})` : ""}`}</Label><Input id="rec-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />{err("amount")}</div>}
          <div className="space-y-1.5"><Label htmlFor="rec-date">{m === "checklist" ? "Due date" : "Date"}</Label><Input id="rec-date" type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />{err("date")}</div>
          {m === "checklist" && <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={!!r.done} onChange={(e) => setR({ ...r, done: e.target.checked })} className="size-4 accent-primary" />Done</label>}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rec-note">Note (optional)</Label><Input id="rec-note" value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}>{record ? "Save changes" : "Add"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- A Member submits a transaction with a receipt image; nothing changes until the Owner approves it ----------
function SubmitDialog({ g, me, open, onClose }: { g: CreatedGoal; me: string; open: boolean; onClose: () => void }) {
  const subs = useGoalSubmissions(g.id);
  const m = g.template.measure;
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState("");
  const [proofErr, setProofErr] = useState("");
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [tried, setTried] = useState(false);
  const errors = {
    amount: !/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, "")) || Number(amount.replace(/,/g, "")) <= 0 ? (m === "money" ? "Enter an amount like 1500 or 1500.50." : "Enter a number above 0.") : "",
    date: !date ? "Pick a date." : date > TODAY ? "The date cannot be in the future." : "",
    proof: proofErr || (!proof ? "Attach a photo or screenshot of the receipt." : ""),
  };
  const pick = async (file?: File) => {
    setProofErr(""); setProof(""); setFileName(file?.name ?? "");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProofErr("Choose an image file (JPG, PNG, WebP or HEIC).");
    if (file.size > MAX_PROOF_UPLOAD) return setProofErr("The image is over 10 MB. Choose a smaller one.");
    setReading(true);
    try { setProof(await shrinkImage(file)); } catch { setProofErr("This image could not be read. Try a JPG or PNG."); } finally { setReading(false); }
  };
  const submit = () => {
    setTried(true);
    if (reading || Object.values(errors).some(Boolean)) return;
    const s: Submission = {
      id: newSubmissionId(), member: me, date, note: note.trim().slice(0, 200), method, ref: ref.trim() || undefined, proof, submitted: new Date().toISOString(), status: "Pending",
      amount: m === "money" ? Math.round(Number(amount.replace(/,/g, "")) * 100) : Number(amount), direction: m === "money" ? direction : undefined,
    };
    if (!writeSubmissions(g.id, [s, ...subs])) return toast.error("Not enough browser storage for this image", { description: "Try a smaller image, or ask the Owner to review the waiting ones first." });
    toast.success("Sent to the group Owner for approval", { description: "It is added to the goal once they approve it." });
    onClose();
  };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <p role="alert" className="text-xs text-destructive">{errors[k]}</p> : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Submit a transaction</DialogTitle><DialogDescription>{g.name} · the Owner checks the receipt before it counts.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {m === "money" && <div className="space-y-1.5"><Label htmlFor="sub-dir">Type</Label><NativeSelect id="sub-dir" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}><option value="in">Deposit (money in)</option><option value="out">Payment or expense (money out)</option></NativeSelect></div>}
          <div className="space-y-1.5"><Label htmlFor="sub-amount">{m === "money" ? "Amount (₱)" : `Value${g.values["Unit"] ?? g.values["Unit (kg, workouts…)"] ? ` (${g.values["Unit"] ?? g.values["Unit (kg, workouts…)"]})` : ""}`}</Label><Input id="sub-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />{err("amount")}</div>
          <div className="space-y-1.5"><Label htmlFor="sub-date">Date</Label><Input id="sub-date" type="date" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} />{err("date")}</div>
          <div className="space-y-1.5"><Label htmlFor="sub-method">Payment method</Label><NativeSelect id="sub-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((x) => <option key={x}>{x}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="sub-ref">Reference number (optional)</Label><Input id="sub-ref" maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 1234 5678 9012" /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sub-proof">Receipt image</Label>
            <FilePicker id="sub-proof" fileName={fileName} onPick={pick} invalid={tried && !!errors.proof} />
            {reading ? <p className="text-xs text-muted-foreground">Preparing the image…</p> : err("proof")}
            {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
            {proof && <img src={proof} alt="Receipt preview" className="max-h-48 rounded-lg border object-contain" />}
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sub-note">Note (optional)</Label><Textarea id="sub-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the Owner should know" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={reading}><ImageUp aria-hidden /> Submit for approval</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit the goal itself (Owner only) ----------
function EditGoalDialog({ g, members, open, onClose }: { g: CreatedGoal; members: string[]; open: boolean; onClose: () => void }) {
  const all = useCreatedGoals();
  const save = useSaveCreatedGoals();
  const [name, setName] = useState(g.name);
  const [status, setStatus] = useState(g.status);
  const [values, setValues] = useState(g.values);
  const [scope, setScope] = useState(scopeOf(g));
  const [people, setPeople] = useState(participantsOf(g, members));
  const missing = g.template.fields.filter((f) => f.required && !values[f.label]?.trim()).map((f) => f.label);
  const nameErr = name.trim().length < 3 ? "Use at least 3 characters." : "";
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (nameErr || missing.length || (scope === "each" && !people.length)) return;
    save(all.map((x) => (x.id === g.id ? { ...x, name: name.trim(), status, scope, participants: scope === "each" && people.length < members.length ? people : undefined, values: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())) } : x)));
    toast.success("Goal updated"); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit goal</DialogTitle><DialogDescription>{g.template.name} template. Records are kept.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="eg-name">Goal name</Label><Input id="eg-name" value={name} onChange={(e) => setName(e.target.value)} />{tried && nameErr && <p role="alert" className="text-xs text-destructive">{nameErr}</p>}</div>
          {g.template.fields.map((f) => {
            const id = `eg-${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <div key={f.label} className="space-y-1.5">
                <Label htmlFor={id}>{f.label}{f.kind === "money" && " (₱)"}{!f.required && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
                <Input id={id} type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"} value={values[f.label] ?? ""} readOnly={f.mode === "locked"} className={cn(f.mode === "locked" && "bg-muted/50")} onChange={(e) => setValues({ ...values, [f.label]: e.target.value })} />
                {f.mode === "locked" && <p className="text-xs text-muted-foreground">Set by the System Admin.</p>}
                {tried && missing.includes(f.label) && <p role="alert" className="text-xs text-destructive">Enter {f.label.toLowerCase()}.</p>}
              </div>
            );
          })}
          <div className="space-y-1.5"><Label htmlFor="eg-status">Status</Label><NativeSelect id="eg-status" value={status} onChange={(e) => setStatus(e.target.value as CreatedGoal["status"])}><option>Active</option><option>Paused</option></NativeSelect></div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Who is this goal for?</legend>
            <div className="flex flex-wrap gap-2">{([["single", "One shared goal"], ["each", "Each member has their own goal"]] as const).map(([v, l]) => (
              <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", scope === v && "border-primary bg-primary/5")}><input type="radio" name="eg-scope" checked={scope === v} onChange={() => setScope(v)} className="accent-primary" />{l}</label>
            ))}</div>
            {scope === "each" && <div className="flex flex-wrap gap-2">{members.map((m) => (
              <label key={m} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm", people.includes(m) && "border-primary bg-primary/5")}><input type="checkbox" checked={people.includes(m)} onChange={(e) => setPeople(e.target.checked ? [...people, m] : people.filter((x) => x !== m))} className="accent-primary" />{m}</label>
            ))}</div>}
            {tried && scope === "each" && !people.length && <p role="alert" className="text-xs text-destructive">Pick at least one member.</p>}
          </fieldset>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save changes</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One dashboard section, filled from the records. */
function Section({ id, g, members, records, onEdit, onDelete, onAdd, onProof }: { id: WidgetId; g: CreatedGoal; members: string[]; records: GoalRecord[]; onEdit: (r: GoalRecord) => void; onDelete: (r: GoalRecord) => void; onAdd: () => void; onProof: (submissionId: string) => void }) {
  const subs = useGoalSubmissions(g.id);
  const s = summarize(g, records, members);
  const w = widget(id);
  const card = (body: ReactNode) => <Card className={cn(w.wide && "md:col-span-2")}><CardHeader><CardTitle>{w.label}</CardTitle></CardHeader><CardContent>{body}</CardContent></Card>;
  const none = records.length === 0;
  const addBtn = <OwnerOnly><Button variant="outline" size="sm" onClick={onAdd}><Plus aria-hidden /> Add {s.m === "checklist" ? "a task" : "a record"}</Button></OwnerOnly>;
  const rowActions = (r: GoalRecord) => (
    <OwnerOnly><span className="flex justify-end gap-1">
      <Button variant="ghost" size="icon-sm" aria-label={`Edit record of ${fmtDate(r.date)}`} onClick={() => onEdit(r)}><Pencil aria-hidden /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete record of ${fmtDate(r.date)}`} onClick={() => onDelete(r)}><Trash2 aria-hidden /></Button>
    </span></OwnerOnly>
  );

  switch (id) {
    case "stats":
      return s.each ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 md:col-span-2">
          <StatCard label="Reached their goal" value={`${s.reached} of ${s.people.length}`} tone={s.reached > 0 ? "success" : undefined} hint="Members who hit their own target" />
          <StatCard label={s.m === "checklist" ? "Tasks each" : `${s.target?.label ?? "Target"} (each)`} value={s.m === "checklist" ? "Own tasks" : s.unitTarget ? s.show(s.unitTarget) : "-"} hint="Every member has the same target" />
          <StatCard label="Average progress" value={`${s.pct}%`} hint="Across all participants" />
          <StatCard label={s.m === "money" ? "Saved by everyone" : s.m === "checklist" ? "Tasks done" : "Logged by everyone"} value={s.m === "checklist" ? `${s.done} of ${s.total}` : s.show(s.done)} hint={none ? "No records yet" : `${records.length} ${records.length === 1 ? "record" : "records"}`} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 md:col-span-2">
          <StatCard label={s.m === "money" ? "Saved so far" : s.m === "checklist" ? "Tasks done" : "Logged so far"} value={s.m === "checklist" ? `${s.done} of ${s.total}` : s.show(s.done)} tone={s.done > 0 ? "success" : undefined} hint={none ? "No records yet" : `${records.length} ${records.length === 1 ? "record" : "records"}`} />
          {s.target && <StatCard label={s.target.label} value={s.show(s.goalTarget)} hint="One target for the whole group" />}
          {s.target && <StatCard label="Remaining" value={s.show(Math.max(0, s.goalTarget - s.done))} hint={`${s.pct}% done`} />}
          <StatCard label="Members" value={members.length} hint="Everyone in the group" />
        </div>
      );
    case "progress":
      return s.each ? (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex justify-between gap-2"><span>Each member&apos;s progress</span><span className="num text-sm font-normal text-muted-foreground">Average {s.pct}%</span></CardTitle></CardHeader>
          <CardContent><ul className="space-y-3 text-sm">{s.byMember.map((b) => (
            <li key={b.name} className="space-y-1">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{b.name}{b.reached && <StatusBadge status="Completed" />}</span><span className="num text-muted-foreground">{s.m === "checklist" ? `${b.value} done` : `${s.show(b.value)} of ${s.show(s.unitTarget)}`} · {b.pct}%</span></div>
              <ProgressBar value={b.pct} label={`${b.name} progress`} />
            </li>
          ))}</ul></CardContent>
        </Card>
      ) : <Card className="md:col-span-2"><CardContent className="space-y-2"><div className="flex justify-between text-sm"><span className="font-medium">{s.total ? `Progress to ${s.m === "checklist" ? `${s.total} tasks` : s.show(s.goalTarget)}` : "Progress"}</span><span className="num">{s.pct}%</span></div><ProgressBar value={s.pct} label="Progress" /></CardContent></Card>;
    case "monthly":
    case "checkins": {
      const data = months.map((mo) => ({ month: monthLabel(mo), value: records.filter((r) => r.date.startsWith(mo) && r.direction !== "out").reduce((t, r) => t + (id === "checkins" ? 1 : s.m === "money" ? r.amount / 100 : r.amount), 0) }));
      return card(none ? <Empty>{w.what}. The chart fills in as records are added.</Empty> : <MyGoalChart data={data} unit={s.m === "money" && id === "monthly" ? "peso" : "count"} label={id === "checkins" ? "Check-ins per month" : s.m === "money" ? "Deposits per month" : "Logged per month"} />);
    }
    case "inout": {
      const rows = months.map((mo) => { const xs = records.filter((r) => r.date.startsWith(mo)); return { mo, inn: xs.filter((r) => r.direction !== "out").reduce((t, r) => t + r.amount, 0), out: xs.filter((r) => r.direction === "out").reduce((t, r) => t + r.amount, 0) }; }).filter((x) => x.inn || x.out);
      return card(rows.length ? <ul className="divide-y text-sm">{rows.map((x) => <li key={x.mo} className="flex justify-between gap-2 py-2"><span>{monthLabel(x.mo)}</span><span className={toneText.success}>+{peso(x.inn)}</span><span className={toneText.danger}>-{peso(x.out)}</span></li>)}</ul> : <Empty>Deposits against payments, per month.</Empty>);
    }
    case "byMember": {
      const sum = s.byMember.reduce((t, b) => t + b.value, 0);
      return card(sum === 0 ? <Empty>{w.what}. It fills in as records are added.</Empty> : <ul className="space-y-2 text-sm">{s.byMember.map((b) => { const p = Math.round((b.value / sum) * 100); return <li key={b.name} className="space-y-1"><div className="flex justify-between"><span>{b.name}</span><span className="num">{s.show(b.value)} · {p}%</span></div><ProgressBar value={p} label={`${b.name} share`} tone="primary" /></li>; })}</ul>);
    }
    case "contributions":
    case "leaderboard": {
      const rows = id === "leaderboard" ? [...s.byMember].sort((a, b) => (s.each ? b.pct - a.pct : 0) || b.value - a.value) : s.byMember;
      return card(
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow>{id === "leaderboard" && <TableHead>#</TableHead>}<TableHead>Member</TableHead><TableHead className="text-right">{s.m === "money" ? "Deposited" : s.m === "checklist" ? "Done" : "Logged"}</TableHead>{s.each && <TableHead className="text-right">Own goal</TableHead>}<TableHead className="text-right">Records</TableHead><TableHead>Latest</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((b, i) => <TableRow key={b.name}>{id === "leaderboard" && <TableCell className="num">{i + 1}</TableCell>}<TableCell>{b.name}</TableCell><TableCell className="num text-right">{s.show(b.value)}</TableCell>{s.each && <TableCell className={cn("num text-right", b.reached && toneText.success)}>{b.pct}%</TableCell>}<TableCell className="num text-right">{b.count}</TableCell><TableCell>{b.latest ? fmtDate(b.latest) : "-"}</TableCell></TableRow>)}</TableBody>
        </Table></div>,
      );
    }
    case "schedule": {
      const monthly = Number((g.values["Monthly amortization"] ?? "").replace(/,/g, ""));
      const first = g.values["First due date"];
      const paid = records.filter((r) => r.direction === "out").length;
      return card(first && monthly > 0
        ? <ul className="divide-y text-sm">{[0, 1, 2, 3].map((i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Installment {i + 1}</span><span className="text-muted-foreground">{fmtDate(addMonths(first, i))}</span><span className="num">{peso(Math.round(monthly * 100))}</span><StatusBadge status={i < paid ? "Confirmed" : "Pending"} /></li>)}</ul>
        : <Empty>Add a monthly amount and first due date to see the schedule.</Empty>);
    }
    case "milestones":
      if (s.each) return card(s.unitTarget || s.m === "checklist"
        ? <ul className="space-y-2 text-sm">{[25, 50, 75, 100].map((p) => { const n = s.byMember.filter((b) => b.pct >= p).length; const all = n === s.people.length && n > 0; return <li key={p} className="flex items-center gap-3"><span className={cn("size-4 rounded-full border-2", all ? "border-success bg-success" : n > 0 && "border-success")} aria-hidden /><span className="flex-1">{s.m === "checklist" ? `${p}% of own tasks` : s.show(Math.round((s.unitTarget * p) / 100))} ({p}%)</span><span className="num text-xs text-muted-foreground">{n} of {s.people.length} members</span></li>; })}</ul>
        : <Empty>Milestones appear once the goal has a target.</Empty>);
      return card(s.total
        ? <ul className="space-y-2 text-sm">{[25, 50, 75, 100].map((p) => { const ok = s.pct >= p; return <li key={p} className="flex items-center gap-3"><span className={cn("size-4 rounded-full border-2", ok && "border-success bg-success")} aria-label={ok ? "Done" : "Upcoming"} /><span className={cn("flex-1", ok && "text-muted-foreground")}>{s.m === "checklist" ? `${p}% of tasks` : s.show(Math.round((s.goalTarget * p) / 100))} ({p}%)</span><span className="text-xs text-muted-foreground">{ok ? "Done" : "Upcoming"}</span></li>; })}</ul>
        : <Empty>Milestones appear once the goal has a target.</Empty>);
    case "tasks":
      return card(
        <div className="space-y-3">
          {s.tasks.length === 0 ? <Empty>No tasks yet.</Empty> : <ul className="divide-y text-sm">{s.tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
              <OwnerOnly fallback={<span className={cn("size-4 rounded border", t.done && "bg-success")} aria-label={t.done ? "Done" : "Not done"} />}>
                <input type="checkbox" checked={!!t.done} aria-label={`Mark ${t.title} as ${t.done ? "not done" : "done"}`} onChange={() => writeRecords(g.id, records.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} className="size-4 accent-primary" />
              </OwnerOnly>
              <span className={cn("min-w-0 flex-1", t.done && "text-muted-foreground line-through")}>{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.member} · due {fmtDate(t.date)}</span>{rowActions(t)}
            </li>
          ))}</ul>}
          {addBtn}
        </div>,
      );
    case "records":
      return card(
        <div className="space-y-3">
          {none ? <Empty>No records yet. They appear here as the Owner adds or approves them.</Empty> : (
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>{s.m === "checklist" ? "Task" : "Member"}</TableHead><TableHead className="text-right">{s.m === "checklist" ? "Status" : "Amount"}</TableHead><TableHead>Note</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{[...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="num">{fmtDate(r.date)}</TableCell>
                  <TableCell>{s.m === "checklist" ? `${r.title} (${r.member})` : r.member}</TableCell>
                  <TableCell className={cn("num text-right", s.m === "money" && (r.direction === "out" ? toneText.danger : toneText.success))}>{s.m === "checklist" ? (r.done ? "Done" : "Open") : s.m === "money" ? `${r.direction === "out" ? "-" : "+"}${peso(r.amount)}` : s.show(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.note || "-"}</TableCell>
                  <TableCell><span className="flex items-center justify-end gap-1">
                    {r.proofOf && subs.some((x) => x.id === r.proofOf) && <Button variant="ghost" size="icon-sm" aria-label={`Receipt for the record of ${fmtDate(r.date)}`} title="Approved with a receipt" onClick={() => onProof(r.proofOf!)}><Receipt aria-hidden /></Button>}
                    {rowActions(r)}
                  </span></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div>
          )}
          {addBtn}
        </div>,
      );
  }
}

// ---------- A goal created from a template: its dashboard is the template's sections, in order ----------
// role: the viewer's role in this goal's group. Owners add records and edit or delete the goal; Members and the System Admin only view.
export function CreatedGoalScreen({ goal: g, groupName, members, role }: { goal: CreatedGoal; groupName: string; members: string[]; role: ViewAs }) {
  const all = useCreatedGoals();
  const save = useSaveCreatedGoals();
  const records = useGoalRecords(g.id);
  const [confirm, setConfirm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [recordDialog, setRecordDialog] = useState<{ record: GoalRecord | null } | null>(null);
  const [deleting, setDeleting] = useState<GoalRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null); // submission id, from a receipt in the records table
  const approval = approvalGoalOf(g, groupName);
  const me = useMe();
  // Members submit transactions with a receipt for the Owner to approve. Checklists have no values to submit;
  // in an "each" goal only the members taking part can submit.
  const canSubmit = role === "member" && !!me && g.template.measure !== "checklist" && g.status === "Active"
    && (scopeOf(g) === "single" ? members.includes(me) : participantsOf(g, members).includes(me));
  const Icon = templateIcon[g.template.icon];
  const details = g.template.fields.filter((f) => g.values[f.label]);
  // Records must always be manageable, so add the list at the end when the template has no section for it.
  const listId: WidgetId = g.template.measure === "checklist" ? "tasks" : "records";
  const manager: WidgetId[] = g.template.widgets.includes(listId) ? [] : [listId];
  return (
    <ViewAsProvider value={role}>
      <PageHeader
        title={g.name}
        description={`${groupName} · ${g.template.name} goal · created ${fmtDate(g.created)}`}
        actions={<OwnerOnly fallback={canSubmit ? <Button onClick={() => setSubmitting(true)}><ImageUp aria-hidden /> Submit a transaction</Button> : role === "admin" && <Approvals goals={[approval]} />}>
          <Approvals goals={[approval]} />
          <Button onClick={() => setRecordDialog({ record: null })}><Plus aria-hidden /> Add {g.template.measure === "checklist" ? "a task" : "a record"}</Button>
          <Button variant="outline" onClick={() => setEditingGoal(true)}><Pencil aria-hidden /> Edit goal</Button>
          <Button variant="outline" onClick={() => setConfirm(true)}><Trash2 aria-hidden /> Delete goal</Button>
        </OwnerOnly>}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
        <StatusBadge status={g.status} />
        <Badge variant="secondary">{scopeOf(g) === "each" ? `One goal per member · ${participantsOf(g, members).length} taking part` : "One shared goal"}</Badge>
        {details.map((f) => <Badge key={f.label} variant="outline" className="font-normal">{f.label}: {fmtValue(f.kind, g.values[f.label])}</Badge>)}
        <RoleBadge />
        {role !== "owner" && !canSubmit && <Badge variant="secondary">View only</Badge>}
      </div>
      {role === "member" && <MySubmissionsCard goal={approval} me={me} />}
      <div className="grid gap-4 md:grid-cols-2">
        {[...g.template.widgets, ...manager].map((id) => <Section key={id} id={id} g={g} members={members} records={records} onAdd={() => setRecordDialog({ record: null })} onEdit={(r) => setRecordDialog({ record: r })} onDelete={setDeleting} onProof={setReviewing} />)}
      </div>

      {submitting && me && <SubmitDialog g={g} me={me} open onClose={() => setSubmitting(false)} />}
      {reviewing && <ReviewDialog key={reviewing} goal={approval} id={reviewing} onClose={() => setReviewing(null)} />}

      {recordDialog && <RecordDialog key={recordDialog.record?.id ?? "new"} g={g} members={scopeOf(g) === "each" ? participantsOf(g, members) : members} record={recordDialog.record} open onClose={() => setRecordDialog(null)} />}
      {editingGoal && <EditGoalDialog g={g} members={members} open onClose={() => setEditingGoal(false)} />}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this record?</DialogTitle><DialogDescription>{deleting && `${deleting.title ?? deleting.member} · ${fmtDate(deleting.date)}. Totals and charts update right away.`}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={() => { writeRecords(g.id, records.filter((x) => x.id !== deleting!.id)); toast("Record deleted"); setDeleting(null); }}>Delete record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {g.name}?</DialogTitle><DialogDescription>{records.length ? `Its ${records.length} ${records.length === 1 ? "record is" : "records are"} deleted too.` : "It has no records yet, so nothing else is lost."}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="destructive" onClick={() => { writeRecords(g.id, []); writeSubmissions(g.id, []); save(all.filter((x) => x.id !== g.id), `/design-preview/group?group=${g.groupId}`); toast(`${g.name} deleted`); }}>Delete goal</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ViewAsProvider>
  );
}

/** Progress line for a created goal, worded like the sample goals ("₱4,500 of ₱9,000", "3 of 5 tasks"). */
function useGoalLine(g: CreatedGoal, members: string[]) {
  const records = useGoalRecords(g.id);
  const s = summarize(g, records, members);
  const metric = s.each ? `${s.reached} of ${s.people.length} members reached ${s.m === "checklist" ? "their tasks" : s.unitTarget ? s.show(s.unitTarget) : "their goal"}` : s.m === "checklist" ? `${s.done} of ${s.total} tasks done` : s.total ? `${s.show(s.done)} of ${s.show(s.goalTarget)}` : records.length ? `${s.show(s.done)} so far` : "No records yet";
  return { records, s, metric };
}
const goalHref = (g: CreatedGoal) => `/design-preview/my-goal?goal=${g.id}`;

/** Same card as the sample goals (icon, status, name, type, progress), for goals created in the preview. */
export function CreatedGoalCard({ g, members = ["Bernz"] }: { g: CreatedGoal; members?: string[] }) {
  const Icon = templateIcon[g.template.icon];
  const { s, metric } = useGoalLine(g, members);
  return (
    <Link href={goalHref(g)} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full transition-colors group-hover:bg-accent/40">
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
            <StatusBadge status={g.status} />
          </div>
          <div><p className="font-medium">{g.name}</p><p className="text-xs text-muted-foreground">{g.template.name} · created {fmtDate(g.created)}</p></div>
          <ProgressBar value={s.pct} label={`${g.name} progress`} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>{metric}</span><span className="num font-medium text-foreground">{s.pct}%</span></div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Same row as the sample goals on My Groups: name, bar, percent. */
export function CreatedGoalProgressRow({ g, members }: { g: CreatedGoal; members: string[] }) {
  const { s } = useGoalLine(g, members);
  return <li className="flex items-center gap-3 text-sm"><span className="w-40 truncate">{g.name}</span><div className="flex-1"><ProgressBar value={s.pct} label={`${g.name} progress`} /></div><span className="num w-9 text-right text-xs text-muted-foreground">{s.pct}%</span></li>;
}

/** Same Dashboard accordion item as the sample goals: progress in the header, a small dashboard inside. */
export function CreatedGoalAccordionItem({ g, members, panelClass }: { g: CreatedGoal; members: string[]; panelClass: string }) {
  const Icon = templateIcon[g.template.icon];
  const { records, s, metric } = useGoalLine(g, members);
  const data = months.map((mo) => ({ month: monthLabel(mo), value: records.filter((r) => r.date.startsWith(mo) && r.direction !== "out").reduce((t, r) => t + (s.m === "money" ? r.amount / 100 : s.m === "checklist" ? 1 : r.amount), 0) }));
  const recent = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return (
    <AccordionItem value={g.id} className="rounded-lg border not-last:border-b">
      <AccordionTrigger className="min-w-0 items-center gap-3 px-3 py-2.5 hover:no-underline">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-center gap-2">{g.name}<StatusBadge status={g.status} /></span>
          <span className="flex items-center gap-3"><span className="block h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-success" style={{ width: `${s.pct}%` }} /></span><span className="num w-24 text-right text-xs text-muted-foreground">{s.pct}% done</span></span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{metric}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className={`px-3 pt-1 pb-3 ${panelClass}`}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={s.m === "money" ? "Saved so far" : s.m === "checklist" ? "Tasks done" : "Logged so far"} value={s.m === "checklist" ? `${s.done} of ${s.total}` : s.show(s.done)} hint={`${records.length} ${records.length === 1 ? "record" : "records"}`} />
            <StatCard label={s.each ? "Reached their goal" : s.target?.label ?? "Target"} value={s.each ? `${s.reached} of ${s.people.length}` : s.total ? (s.m === "checklist" ? `${s.total} tasks` : s.show(s.goalTarget)) : "-"} hint={s.total ? `${s.pct}% done` : "No target set"} />
            <StatCard label="Members" value={members.length} hint="Everyone in the group" />
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            <Card size="sm" className="lg:col-span-3"><CardHeader><CardTitle>{s.m === "money" ? "Deposits" : s.m === "checklist" ? "Tasks" : "Logged"} per month</CardTitle></CardHeader><CardContent>{records.length ? <MyGoalChart data={data} unit={s.m === "money" ? "peso" : "count"} label={`${g.name} per month`} /> : <Empty>The chart fills in as records are added.</Empty>}</CardContent></Card>
            <Card size="sm" className="lg:col-span-2"><CardHeader><CardTitle>Recent records</CardTitle></CardHeader><CardContent className="space-y-3">
              {recent.length ? <ul className="space-y-2">{recent.map((r) => <li key={r.id} className="flex items-start justify-between gap-3"><span>{r.title ?? `${r.member}${s.m === "money" ? ` · ${r.direction === "out" ? "-" : "+"}${peso(r.amount)}` : s.m === "count" ? ` · ${s.show(r.amount)}` : ""}`}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.date)}</span></li>)}</ul> : <p className="text-muted-foreground">No records yet.</p>}
              <Link href={goalHref(g)} className={buttonVariants({ variant: "outline", size: "sm" })}>Open {g.name}</Link>
            </CardContent></Card>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
