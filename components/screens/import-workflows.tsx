"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, EyeOff, FlaskConical, Pencil, Plus, Save, Search, Trash2, Users, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, StatusBadge } from "@/components/app/primitives";
import { useAccount } from "@/components/app/view-as";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ACCOUNTS } from "@/lib/accounts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { isTestEmail, newTestEmailId, OWN_PREFIX, useOwnWorkflows, saveImportWorkflows, saveTestEmails, TEST_EMAIL_LIMIT, useImportWorkflows, useTestEmails } from "@/components/app/workflow-store";
import { FIELD_TYPES, FIND_FIELDS, FIND_OPS, findPairs, gmailQuery, keyOf, maskPrivate, LIMITS, runWorkflow, whereLabel, workflowProblems, type ExtractField, type FieldSource, type FindCond, type FindStep, type ImportWorkflow, type Json, type RunResult } from "@/lib/import-workflows";
import { SAMPLE_EMAILS, type SampleEmail } from "@/lib/gmail-import";
import { TODAY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const newId = (name: string, own?: boolean) => `${own ? OWN_PREFIX : "wf-"}${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workflow"}-${Date.now().toString(36).slice(-4)}`;
export const blankWorkflow = (): ImportWorkflow => ({
  id: "", name: "", about: "", status: "Draft", updated: new Date().toISOString(),
  find: { match: [[{ field: "from", op: "contains", value: "" }, { field: "subject", op: "contains", value: "" }, { field: "body", op: "contains", value: "" }]], label: "", days: 30 },
  fields: [{ key: "amount", label: "Amount", type: "money", after: "" }, { key: "sender", label: "Sender name", type: "text", after: "", payer: true }, { key: "reference", label: "Reference", type: "text", after: "" }],
});
export const typeLabel = Object.fromEntries(FIELD_TYPES) as Record<ExtractField["type"], string>;

// ---------- Shared with the Owner's Gmail import ----------
/** What happened to one email, as a short badge. */
function RunBadge({ r }: { r: RunResult }) {
  if (r.step === 1) return <Badge variant="outline" className="text-muted-foreground">Not matched</Badge>;
  return r.deposit ? <Badge className="border-0 bg-success/15 text-success">Deposit</Badge> : <Badge variant="outline">Not a deposit</Badge>;
}
const runWhy = (r: RunResult) => r.step === 1 ? r.why : r.why ? `Read: ${r.why}` : "Amount and payer found";
const JsonView = ({ json }: { json: Json | Record<string, unknown> }) => <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{JSON.stringify(json, null, 2)}</pre>;
const EmailText = ({ e }: { e: SampleEmail }) => <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">{`From: ${e.from}\nTo: ${e.to}\nSubject: ${e.subject}\n\n${e.body}`}</pre>;

/** Where, as one list of conditions joined by AND / OR (AND is checked first). Stored as groups: an OR starts a new group. */
type Row = { c: FindCond; or: boolean };
const PLACEHOLDER: Record<FindCond["field"], string> = { from: "notify@yourbank.com", to: "Bernie", subject: "Transfer Received", body: "Transfer From", text: "1000" };
function WhereEditor({ match, onChange, disabled, idPrefix }: { match: FindCond[][]; onChange: (m: FindCond[][]) => void; disabled?: boolean; idPrefix: string }) {
  const rows: Row[] = match.filter((g) => g.length).flatMap((g, gi) => g.map((c, ci) => ({ c, or: gi > 0 && ci === 0 })));
  const save = (next: Row[]) => onChange(next.reduce<FindCond[][]>((gs, r, i) => (i === 0 || !r.or ? (gs.length ? gs[gs.length - 1].push(r.c) : gs.push([r.c]), gs) : [...gs, [r.c]]), []));
  const set = (i: number, patch: Partial<FindCond>, or = rows[i].or) => save(rows.map((r, j) => (j === i ? { c: { ...r.c, ...patch }, or } : r)));
  const groups = rows.filter((r) => r.or).length + 1;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">{rows.map((r, i) => {
        const name = `condition ${i + 1}`;
        return (
          <li key={i} className={cn("grid grid-cols-[4.5rem_1fr_1fr] gap-2 sm:grid-cols-[4.5rem_9rem_10rem_1fr_auto]", r.or && "border-t border-dashed pt-2")}>
            {i === 0
              ? <span className="flex h-8 items-center px-1 text-xs font-medium text-muted-foreground">Where</span>
              : <NativeSelect aria-label={`Join ${name}`} value={r.or ? "or" : "and"} disabled={disabled} onChange={(e) => set(i, {}, e.target.value === "or")}><option value="and">AND</option><option value="or">OR</option></NativeSelect>}
            <NativeSelect aria-label={`Field, ${name}`} value={r.c.field} disabled={disabled} onChange={(e) => set(i, { field: e.target.value as FindCond["field"] })}>{FIND_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
            <NativeSelect aria-label={`Operator, ${name}`} value={r.c.op} disabled={disabled} onChange={(e) => set(i, { op: e.target.value as FindCond["op"] })}>{FIND_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
            <Input id={`${idPrefix}-${i}`} aria-label={`Value, ${name}`} className="col-span-2 sm:col-span-1" maxLength={80} value={r.c.value} disabled={disabled} onChange={(e) => set(i, { value: e.target.value })} placeholder={PLACEHOLDER[r.c.field]} />
            {!disabled && <Button variant="ghost" size="icon-sm" className="justify-self-end" aria-label={`Remove ${name}`} onClick={() => save(rows.filter((_, j) => j !== i).map((x, j) => (j === 0 ? { ...x, or: false } : x)))}><X aria-hidden /></Button>}
          </li>
        );
      })}</ul>
      {!rows.length && <p className="text-xs text-muted-foreground">No conditions yet.</p>}
      {!disabled && <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={rows.length >= LIMITS.conds} onClick={() => save([...rows, { c: { field: rows.length ? "body" : "from", op: "contains", value: "" }, or: false }])}><Plus aria-hidden /> Add condition</Button>
        {groups > 1 && <span className="text-xs text-muted-foreground">AND is checked before OR: A AND B OR C means (A and B) or C.</span>}
      </div>}
    </div>
  );
}

/** The two steps of a workflow, read-only. `find`: Where as a goal uses it. */
export function WorkflowSteps({ w, find = w.find }: { w: ImportWorkflow; find?: FindStep }) {
  return (
    <ol className="space-y-2 text-sm">
      <li><span className="font-medium">1. Where</span> <span className="text-muted-foreground">{whereLabel(find)}</span></li>
      <li><span className="font-medium">2. JSON</span> <span className="text-muted-foreground">{w.fields.map((f) => `${f.key}${f.payer ? " (payer)" : ""}`).join(", ")}</span></li>
    </ol>
  );
}

/** What a workflow is, for an Owner choosing one: which emails it reads, what it reads from them, and an example. */
export function WorkflowInfo({ w }: { w: ImportWorkflow }) {
  const example = SAMPLE_EMAILS.map((e) => ({ e, r: runWorkflow(w, e, w.find) })).find((x) => x.r.step === 2 && x.r.deposit);
  const payers = w.fields.filter((f) => f.payer).map((f) => f.label || f.key);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Workflow className="size-3.5" aria-hidden /></span>
        <div className="min-w-0"><p className="font-medium">{w.name}</p>{w.about && <p className="text-xs text-muted-foreground">{w.about}</p>}</div>
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[7rem_1fr]">
        <dt className="font-medium">Reads emails where</dt><dd className="text-muted-foreground">{whereLabel(w.find)}</dd>
        <dt className="font-medium">Reads</dt><dd className="text-muted-foreground">{w.fields.map((f) => f.label || f.key).join(", ")}</dd>
        <dt className="font-medium">Who paid, by</dt><dd className="text-muted-foreground">{payers.join(" or ") || "-"} <span className="text-foreground">· you map each one to a member</span></dd>
      </dl>
      {example && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">See an example email and what it reads</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2"><EmailText e={example.e} />{example.r.step === 2 && <JsonView json={example.r.json} />}</div>
        </details>
      )}
    </div>
  );
}

// ---------- Test panel: run the workflow on the sample inbox or a pasted email ----------
type Source = "inbox" | "paste";
// samples: also list the built-in sample emails (the card's Test); the editor shows only the Admin's own emails.
function TestPanel({ w, source, setSource, pasted, setPasted, samples = true }: { w: ImportWorkflow; source: Source; setSource: (s: Source) => void; pasted: SampleEmail; setPasted: (e: SampleEmail) => void; samples?: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const saved = useTestEmails();
  const isSaved = saved.some((e) => e.id === pasted.id);
  const changed = isSaved && JSON.stringify(saved.find((e) => e.id === pasted.id)) !== JSON.stringify(pasted);
  const emails = source === "inbox" ? [...(samples ? SAMPLE_EMAILS : []), ...saved] : [pasted];
  const rows = emails.map((e) => ({ e, r: runWorkflow(w, e, w.find) }));
  const shown = rows.find((x) => x.e.id === pick) ?? rows.find((x) => x.r.step === 2) ?? rows[0];
  const store = (next: SampleEmail[], done: string) => { if (!saveTestEmails(next)) return void toast.error("Could not save. This browser's storage is full or blocked."); toast.success(done); };
  const saveNew = () => {
    if (!pasted.body.trim()) return void toast.error("Paste the email text first");
    if (saved.length >= TEST_EMAIL_LIMIT) return void toast.error(`Up to ${TEST_EMAIL_LIMIT} saved test emails. Delete one first.`);
    const e = { ...pasted, id: newTestEmailId(), subject: pasted.subject.trim() || "(no subject)" };
    store([...saved, e], `"${e.subject}" saved as a test email`); setPasted(e);
  };
  // Hides email names and long numbers before the email is kept (it may be a real one). Values the workflow reads stay readable.
  const hidePrivate = () => {
    const parts = [maskPrivate(pasted.from), maskPrivate(pasted.to), maskPrivate(pasted.subject), maskPrivate(pasted.body)];
    const n = parts.reduce((t, x) => t + x.n, 0);
    if (!n) return void toast("Nothing private found", { description: "Names in the text are not detected: remove them yourself." });
    setPasted({ ...pasted, from: parts[0].text, to: parts[1].text, subject: parts[2].text, body: parts[3].text });
    toast.success(`Hid ${n} private ${n === 1 ? "detail" : "details"}`, { description: "Email names and long numbers (last 4 digits kept). Check names yourself." });
  };
  const load = (id: string) => { const e = saved.find((x) => x.id === id); if (e) setPasted(e); };
  const edit = (e: SampleEmail) => { setPasted(e); setSource("paste"); };
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Test on" className="flex w-fit rounded-lg border p-0.5">
        {([["inbox", !samples ? `Saved emails (${saved.length})` : saved.length ? `Sample inbox + ${saved.length} saved` : "Sample inbox"], ["paste", "Paste an email"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={source === v} onClick={() => setSource(v)} className={cn("rounded-md px-2.5 py-1 text-xs", source === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{l}</button>
        ))}
      </div>
      {source === "paste" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1"><Label htmlFor="wt-load">Saved test emails</Label>
            <NativeSelect id="wt-load" value={isSaved ? pasted.id : ""} onChange={(e) => (e.target.value ? load(e.target.value) : setPasted({ ...pasted, id: "pasted" }))}>
              <option value="">{saved.length ? "New email (not saved)" : "None saved yet"}</option>
              {saved.map((e) => <option key={e.id} value={e.id}>{e.subject}</option>)}
            </NativeSelect>
          </div>
          {isSaved
            ? <>
              <Button variant="outline" size="sm" disabled={!changed} onClick={() => store(saved.map((e) => (e.id === pasted.id ? pasted : e)), `"${pasted.subject}" updated`)}><Save aria-hidden /> Save changes</Button>
              <Button variant="outline" size="sm" onClick={saveNew}><Copy aria-hidden /> Save as new</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(true)}><Trash2 aria-hidden /> Delete</Button>
            </>
            : <Button variant="outline" size="sm" onClick={saveNew}><Save aria-hidden /> Save as test email</Button>}
          <Button variant="ghost" size="sm" disabled={!pasted.body.trim() && !pasted.from && !pasted.to} onClick={hidePrivate}><EyeOff aria-hidden /> Hide private details</Button>
        </div>
      )}
      {source === "paste" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="wt-from">From</Label><Input id="wt-from" value={pasted.from} onChange={(e) => setPasted({ ...pasted, from: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="wt-to">To</Label><Input id="wt-to" value={pasted.to} onChange={(e) => setPasted({ ...pasted, to: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="wt-subject">Subject</Label><Input id="wt-subject" value={pasted.subject} onChange={(e) => setPasted({ ...pasted, subject: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="wt-body">Email text</Label><Textarea id="wt-body" rows={5} maxLength={LIMITS.body} value={pasted.body} onChange={(e) => setPasted({ ...pasted, body: e.target.value })} placeholder="Paste the text of a real notification email (remove anything private first)" /></div>
        </div>
      )}
      {!rows.length ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No saved emails yet. Paste a real notification email under <span className="font-medium text-foreground">Paste an email</span>, then save it.</p>
      : <p className="text-xs text-muted-foreground">{rows.filter((x) => x.r.step === 2).length} of {rows.length} match Where · <span className="font-medium text-foreground">{rows.filter((x) => x.r.step === 2 && x.r.deposit).length} deposits</span></p>}
      {source === "inbox" && rows.length > 0 && (
        <ul className="divide-y rounded-lg border">{rows.map(({ e, r }) => (
          <li key={e.id}>
            <div className={cn("flex items-center hover:bg-accent/40", shown?.e.id === e.id && "bg-accent/50")}>
              <button type="button" onClick={() => setPick(e.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm">
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate">{e.subject}</span>{isTestEmail(e.id) && <Badge variant="secondary" className="shrink-0">Saved</Badge>}</span><span className="block truncate text-xs text-muted-foreground">{e.from} · {runWhy(r)}</span></span>
                <RunBadge r={r} />
              </button>
              {isTestEmail(e.id) && <Button variant="ghost" size="icon-sm" className="mr-2" aria-label={`Edit saved email ${e.subject}`} onClick={() => edit(e)}><Pencil aria-hidden /></Button>}
            </div>
          </li>
        ))}</ul>
      )}
      {deleting && (
        <Dialog open onOpenChange={(o) => !o && setDeleting(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete the test email &quot;{pasted.subject}&quot;?</DialogTitle><DialogDescription>It is removed from every workflow&apos;s test. Workflows and goals are not changed.</DialogDescription></DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { store(saved.filter((e) => e.id !== pasted.id), "Test email deleted"); setPasted({ ...pasted, id: "pasted" }); setDeleting(false); }}><Trash2 aria-hidden /> Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {shown && (
        <div className="grid gap-3 xl:grid-cols-2">
          {source === "inbox" && <div className="min-w-0 space-y-1"><p className="text-xs font-medium text-muted-foreground">Email</p><EmailText e={shown.e} /></div>}
          <div className={cn("min-w-0 space-y-1", source === "paste" && "xl:col-span-2")}>
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">JSON <RunBadge r={shown.r} /></p>
            {shown.r.step === 2 ? <JsonView json={shown.r.json} /> : <p className="rounded-lg bg-muted/50 p-3 text-xs">{runWhy(shown.r)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Find fields: every "Label: value" in a test email, one click to read it into JSON ----------
function FieldFinder({ email, fields, onAdd }: { email: SampleEmail | null; fields: ExtractField[]; onAdd: (f: ExtractField) => void }) {
  const [open, setOpen] = useState(false);
  const pairs = email ? findPairs(email.body) : [];
  const has = (after: string) => fields.some((f) => !f.source && f.pattern === undefined && f.after.trim().toLowerCase() === after.toLowerCase());
  const add = (label: string, after: string, type: ExtractField["type"], extra: Partial<ExtractField> = {}) => {
    // The first amount found becomes "amount" (the deposit); a key already used gets a number.
    let key = type === "money" && !fields.some((f) => f.key === "amount") ? "amount" : keyOf(label);
    for (let n = 2; fields.some((f) => f.key === key); n++) key = `${keyOf(label).slice(0, 27)}_${n}`;
    onAdd({ key, label, type, after, ...extra });
  };
  return (
    <div className="rounded-lg border border-dashed p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{email ? <>Find the values in <span className="font-medium text-foreground">{email.subject || "the pasted email"}</span>{email.id === "pasted" ? " (pasted)" : ""}</> : "Paste an email in the test, or match one with Where, to find its values."}</p>
        {email && <Button variant="outline" size="xs" onClick={() => setOpen(!open)}><Search aria-hidden /> {open ? "Hide" : `Find fields (${pairs.length})`}</Button>}
      </div>
      {open && email && (
        <ul className="mt-2 divide-y text-sm">
          {pairs.map((p) => (
            <li key={p.after} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1"><span className="block truncate">{p.label}</span><span className="block truncate font-mono text-xs text-muted-foreground">{p.value}</span></span>
              <Badge variant="outline" className="shrink-0">{typeLabel[p.type]}</Badge>
              {has(p.after) ? <span className="w-14 text-right text-xs text-success">Added</span> : <Button variant="ghost" size="xs" className="w-14" onClick={() => add(p.label, p.after, p.type)}><Plus aria-hidden /> Add</Button>}
            </li>
          ))}
          {(["to", "from"] as const).map((src) => (
            <li key={src} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1"><span className="block truncate">Email {src === "to" ? "To (receiver)" : "From (sender)"}</span><span className="block truncate font-mono text-xs text-muted-foreground">{email[src]}</span></span>
              <Badge variant="outline" className="shrink-0">Header</Badge>
              {fields.some((f) => f.source === src) ? <span className="w-14 text-right text-xs text-success">Added</span> : <Button variant="ghost" size="xs" className="w-14" onClick={() => add(`${src === "to" ? "Payer" : "Sender"} email`, "", "text", { source: src, ...(src === "to" && { payer: true }) })}><Plus aria-hidden /> Add</Button>}
            </li>
          ))}
          {!pairs.length && <li className="py-1.5 text-xs text-muted-foreground">No “Label: value” lines found. Use Text after a label or an advanced pattern below.</li>}
        </ul>
      )}
    </div>
  );
}

/** Runs a workflow on the sample inbox, saved emails or one pasted. Nothing is imported. */
export function TestDialog({ w, onClose }: { w: ImportWorkflow; onClose: () => void }) {
  const [source, setSource] = useState<Source>("inbox");
  const [pasted, setPasted] = useState<SampleEmail>({ id: "pasted", from: "", to: "", subject: "", received: `${TODAY} 00:00`, body: "" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Test {w.name}</DialogTitle><DialogDescription>Runs the workflow on sample emails, your saved ones or one you paste. Nothing is imported.</DialogDescription></DialogHeader>
        <WorkflowSteps w={w} />
        <TestPanel w={w} source={source} setSource={setSource} pasted={pasted} setPasted={setPasted} />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Editor ----------
function Section({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

// The workflow editor: the System Admin's common workflows (Draft / Publish) and a goal's own (owner: one Save; only that goal uses it).
// onSave: stores the workflow; false when it could not be saved.
export function WorkflowEditor({ initial, all, onClose, onSave, owner }: { initial: ImportWorkflow; all: ImportWorkflow[]; onClose: () => void; onSave: (w: ImportWorkflow) => boolean; owner?: boolean }) {
  const [w, setW] = useState(initial);
  const [tried, setTried] = useState(false);
  const account = useAccount();
  const tests = useTestEmails();
  const [source, setSource] = useState<Source>(() => (tests.length ? "inbox" : "paste"));
  const first = (f: FindCond["field"]) => initial.find.match[0]?.find((c) => c.field === f && c.op !== "not_contains")?.value ?? "";
  const [pasted, setPasted] = useState<SampleEmail>({ id: "pasted", from: first("from"), to: first("to"), subject: first("subject"), received: `${TODAY} 00:00`, body: "" });
  const set = (patch: Partial<ImportWorkflow>) => setW((x) => ({ ...x, ...patch }));
  const setFind = (patch: Partial<FindStep>) => set({ find: { ...w.find, ...patch } });
  const setField = (i: number, patch: Partial<ExtractField>) => set({ fields: w.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const problems = workflowProblems(w, all);
  const err = (k: string) => tried && problems[k] ? <p role="alert" className="text-xs text-destructive">{problems[k]}</p> : null;
  // The test that saving (Owner) or publishing (Admin) needs: every test email, saved or pasted, whichever tab is open.
  const runs = [...tests, ...(pasted.body.trim() ? [pasted] : [])].map((e) => runWorkflow(w, e, w.find));
  const deposits = runs.filter((r) => r.step === 2 && r.deposit).length;
  const read = runs.find((r) => r.step === 2);
  const untested = deposits ? null
    : !runs.length ? "There is no test email yet. Paste a real payment email under Test → Paste an email."
    : !read ? `None of your ${runs.length} test ${runs.length === 1 ? "email matches" : "emails match"} Where (${runs[0].step === 1 ? runs[0].why : ""}). Check the conditions.`
    : read.why === "No amount found" ? "An email matches Where, but no amount was read. Add a field with key amount and type Amount that finds it."
    : "An email matches Where, but no payer was read. Tick “Identifies who paid” on a field that finds the sender (or use Email To/From).";
  // Fields are found in the pasted email, or else the first test email that matches Where.
  const finderEmail = pasted.body.trim() ? pasted : tests.find((e) => runWorkflow(w, e, w.find).step === 2) ?? null;

  const save = (status: ImportWorkflow["status"]) => {
    setTried(true);
    if (Object.keys(problems).length) return void toast.error("Fix the highlighted fields first");
    if (status === "Published" && untested) return void toast.error(`${owner ? "Saving" : "Publishing"} needs one test email that becomes a deposit`, { description: untested });
    const saved: ImportWorkflow = { ...w, name: w.name.trim(), id: w.id || newId(w.name, owner), status, updated: new Date().toISOString(), builtIn: false, by: owner ? ACCOUNTS[account].name : undefined };
    if (!onSave(saved)) return void toast.error("Could not save. This browser's storage is full or blocked.");
    toast.success(owner ? `${saved.name} saved` : status === "Published" ? `${saved.name} published` : `${saved.name} saved as a draft`, { description: owner ? "Use it in this goal's Gmail import jobs." : status === "Published" ? "Owners can use it in their Gmail import jobs now." : "Owners do not see drafts." });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? `Edit ${initial.name}` : owner ? "New workflow for this goal" : "New import workflow"}</DialogTitle>
          <DialogDescription>Say which emails are payments, then read them into JSON so each payment can be matched to a member.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="wf-name">Name</Label><Input id="wf-name" maxLength={60} value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. BPI InstaPay received" />{err("name")}</div>
              <div className="space-y-1.5"><Label htmlFor="wf-about">Description</Label><Input id="wf-about" maxLength={200} value={w.about} onChange={(e) => set({ about: e.target.value })} placeholder={owner ? "What it is for" : "Shown to Owners when they pick it"} /></div>
            </div>

            <Section n={1} title="Where" hint="Which emails are payments. Pick a field and how it must match, and join the conditions with AND or OR (for example skip statements and money sent with “Body does not contain”). Empty conditions are skipped.">
              <WhereEditor idPrefix="wf-where" match={w.find.match} onChange={(match) => setFind({ match })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="wf-label">Gmail label (optional)</Label><Input id="wf-label" value={w.find.label} onChange={(e) => setFind({ label: e.target.value })} placeholder="eShareGoal" /></div>
                <div className="space-y-1"><Label htmlFor="wf-days">Look back (days)</Label><Input id="wf-days" type="number" min={0} max={365} value={w.find.days} onChange={(e) => setFind({ days: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })} /></div>
              </div>
              {err("find")}
              <p className="text-xs text-muted-foreground">Gmail search: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{gmailQuery(w.find)}</code></p>
            </Section>

            <Section n={2} title="Read into JSON" hint="Each field becomes one JSON value. Most values come right after a label, on the same line (“Transfer From: …” or a table row “Transfer Amount ⇥ PHP 7,000.00”) or on the next line. Mark the fields that tell who paid.">
              <FieldFinder email={finderEmail} fields={w.fields} onAdd={(f) => w.fields.length < LIMITS.fields && set({ fields: [...w.fields, f] })} />
              <ul className="space-y-2">{w.fields.map((f, i) => {
                const by = f.source ?? (f.pattern !== undefined ? "pattern" : "after");
                return (
                  <li key={i} className="space-y-2 rounded-lg bg-muted/30 p-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]">
                      <div><Input aria-label={`Field ${i + 1}: JSON key`} className="font-mono text-xs" maxLength={30} value={f.key} onChange={(e) => setField(i, { key: e.target.value })} placeholder="key" />{err(`fields.${i}.key`)}</div>
                      <Input aria-label={`Field ${i + 1}: label`} maxLength={40} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Label" />
                      <NativeSelect aria-label={`Field ${i + 1}: type`} value={f.type} onChange={(e) => setField(i, { type: e.target.value as ExtractField["type"] })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove field ${f.key || i + 1}`} onClick={() => set({ fields: w.fields.filter((_, j) => j !== i) })}><X aria-hidden /></Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <NativeSelect aria-label={`Field ${i + 1}: read by`} value={by} onChange={(e) => { const v = e.target.value; setField(i, v === "pattern" ? { pattern: "", source: undefined } : v === "after" ? { pattern: undefined, source: undefined } : { pattern: undefined, source: v as FieldSource }); }}>
                        <option value="after">Text after a label</option><option value="pattern">Advanced pattern</option>
                        <option value="to">Email To (receiver)</option><option value="from">Email From (sender)</option><option value="subject">Email Subject</option>
                      </NativeSelect>
                      {f.source
                        ? <p className="flex h-8 items-center text-xs text-muted-foreground">{f.source === "subject" ? "The whole subject line." : `The ${f.source === "to" ? "receiver's" : "sender's"} email address.`}</p>
                        : by === "pattern"
                        ? <div><Input aria-label={`Field ${i + 1}: pattern`} className="font-mono text-xs" maxLength={LIMITS.pattern} value={f.pattern} onChange={(e) => setField(i, { pattern: e.target.value })} placeholder={String.raw`PHP\s?([\d,.]+)`} />{err(`fields.${i}.pattern`)}</div>
                        : <div><Input aria-label={`Field ${i + 1}: label it comes after`} maxLength={60} value={f.after} onChange={(e) => setField(i, { after: e.target.value })} placeholder="Transfer From:" />{err(`fields.${i}.after`)}</div>}
                    </div>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={!!f.payer} onChange={(e) => setField(i, { payer: e.target.checked || undefined })} /> Identifies who paid (Owners map it to a member)</label>
                  </li>
                );
              })}</ul>
              {err("fields")}
              {w.fields.length < LIMITS.fields && <Button variant="outline" size="sm" onClick={() => set({ fields: [...w.fields, { key: "", label: "", type: "text", after: "" }] })}><Plus aria-hidden /> Add field</Button>}
              <p className="text-xs text-muted-foreground">Advanced patterns are regular expressions; the first ( ) group is the value. Amounts are stored in centavos. A field named <code className="font-mono">reference</code> is used to skip duplicates.</p>
            </Section>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium"><FlaskConical className="size-4" aria-hidden /> Test</p>
            <TestPanel w={w} source={source} setSource={setSource} pasted={pasted} setPasted={setPasted} samples={false} />
          </div>
        </div>
        <DialogFooter className="items-center">
          <p role="status" className={cn("mr-auto text-xs", untested ? "text-warning" : "text-success")}>
            {untested ? `Before ${owner ? "saving" : "publishing"}: ${untested}` : `Test passed: ${deposits} ${deposits === 1 ? "email becomes a deposit" : "emails become deposits"}.`}
          </p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {owner
            ? <Button onClick={() => save("Published")}>Save workflow</Button>
            : <><Button variant="outline" onClick={() => save("Draft")}>Save as draft</Button><Button onClick={() => save("Published")}>Publish</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- System Admin: the workflows Gmail import jobs run ----------
// Two sections: the common workflows (built in and the Admin's own, which Owners can use) and the Owners' own workflows,
// read-only here so the Admin can check them (test, or copy one into the common list as a draft).
// inUse: workflow id -> how many import jobs use it (read on the server from every goal's setup).
export function ImportWorkflowsScreen({ inUse }: { inUse: Record<string, number> }) {
  const all = useImportWorkflows();
  const owners = useOwnWorkflows();
  const [editing, setEditing] = useState<ImportWorkflow | null>(null);
  const [testing, setTesting] = useState<ImportWorkflow | null>(null);
  const [deleting, setDeleting] = useState<ImportWorkflow | null>(null);
  const custom = all.filter((w) => !w.builtIn).length;
  const toggle = (w: ImportWorkflow) => {
    if (!saveImportWorkflows(all.map((x) => (x.id === w.id ? { ...x, status: x.status === "Published" ? "Draft" : "Published", updated: new Date().toISOString() } : x)))) return;
    toast(w.status === "Published" ? `${w.name} unpublished` : `${w.name} published`);
  };
  return (
    <>
      <PageHeader title="Workflows" description="Which emails are payments (Where), and how Gmail import reads them into JSON. Common workflows: Owners use the published ones in their goals' Gmail import jobs (or make their own) and map each payer to a member."
        actions={<Button disabled={custom >= LIMITS.workflows} onClick={() => setEditing(blankWorkflow())}><Plus aria-hidden /> New workflow</Button>} />
      <Accordion multiple defaultValue={["common"]} className="gap-3">
      <AccordionItem value="common" className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
      <AccordionTrigger className="items-center gap-3 px-4 py-3 hover:no-underline">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Workflow className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium">Common workflows <span className="font-normal text-muted-foreground">· {all.length}</span></span><span className="block text-xs font-normal text-muted-foreground">Built in and made by you. Owners can use the published ones in their import jobs.</span></span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pt-1 pb-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {all.map((w) => {
          const uses = inUse[w.id] ?? 0;
          return (
            <Card key={w.id} className={cn("h-full", w.status === "Draft" && "opacity-90")}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Workflow className="size-4" aria-hidden /></span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {w.builtIn && <Badge variant="outline" className="text-muted-foreground">Built in</Badge>}
                    <StatusBadge status={w.status === "Published" ? "Active" : "Paused"} />
                  </span>
                </div>
                <div className="min-w-0"><p className="font-medium">{w.name}</p>{w.about && <p className="text-sm text-muted-foreground">{w.about}</p>}</div>
                <WorkflowSteps w={w} />
                <p className="text-xs text-muted-foreground">{w.status === "Draft" ? "Draft: Owners do not see it" : uses ? `Used by ${uses} import ${uses === 1 ? "job" : "jobs"}` : "Not used by an import job yet"} · {w.fields.length} JSON fields ({w.fields.filter((f) => f.payer).map((f) => typeLabel[f.type].toLowerCase()).join(", ") || "no"} payer)</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTesting(w)}><FlaskConical aria-hidden /> Test</Button>
                  {!w.builtIn && <Button variant="outline" size="sm" onClick={() => setEditing(w)}><Pencil aria-hidden /> Edit</Button>}
                  <Button variant="outline" size="sm" disabled={custom >= LIMITS.workflows} onClick={() => setEditing({ ...w, id: "", builtIn: false, name: `${w.name} (copy)`, status: "Draft" })}><Copy aria-hidden /> Duplicate</Button>
                  {!w.builtIn && <Button variant="outline" size="sm" disabled={uses > 0 && w.status === "Published"} title={uses > 0 ? "A goal uses it: remove it there first" : undefined} onClick={() => toggle(w)}>{w.status === "Published" ? "Unpublish" : "Publish"}</Button>}
                  {!w.builtIn && <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={uses > 0} title={uses > 0 ? "A goal uses it: remove it there first" : undefined} onClick={() => setDeleting(w)}><Trash2 aria-hidden /> Delete</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </AccordionContent>
      </AccordionItem>

      <AccordionItem value="owners" className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
      <AccordionTrigger className="items-center gap-3 px-4 py-3 hover:no-underline">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Users className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium">Owners&apos; workflows <span className="font-normal text-muted-foreground">· {owners.length}</span></span><span className="block text-xs font-normal text-muted-foreground">Made by group Owners for their own import jobs. Read-only: test them, or copy a good one into the common list.</span></span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pt-1 pb-4">
        {owners.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No Owner has made a workflow yet.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {owners.map((w) => {
            const uses = inUse[w.id] ?? 0;
            return (
              <Card key={w.id} className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Workflow className="size-4" aria-hidden /></span>
                    <Badge variant="secondary">By {w.by ?? "an Owner"}</Badge>
                  </div>
                  <div className="min-w-0"><p className="font-medium">{w.name}</p>{w.about && <p className="text-sm text-muted-foreground">{w.about}</p>}</div>
                  <WorkflowSteps w={w} />
                  <p className="text-xs text-muted-foreground">{uses ? `Used by ${uses} import ${uses === 1 ? "job" : "jobs"}` : "Not used by an import job yet"} · updated {w.updated.slice(0, 10)} · {w.fields.length} JSON fields</p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setTesting(w)}><FlaskConical aria-hidden /> Test</Button>
                    <Button variant="outline" size="sm" disabled={custom >= LIMITS.workflows} title="Copies it into Common workflows as a draft; the Owner's stays as it is" onClick={() => setEditing({ ...w, id: "", builtIn: false, by: undefined, name: `${w.name} (from ${w.by ?? "an Owner"})`, status: "Draft" })}><Copy aria-hidden /> Make it common</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Preview: Owners&apos; workflows are kept in this browser, so you see the ones made here. The real app reads them from every Owner&apos;s account.</p>
      </AccordionContent>
      </AccordionItem>
      </Accordion>
      {editing && <WorkflowEditor key={editing.id || "new"} initial={editing} all={all} onClose={() => setEditing(null)}
        onSave={(saved) => saveImportWorkflows(editing.id ? all.map((x) => (x.id === editing.id ? saved : x)) : [...all, saved])} />}
      {testing && <TestDialog w={testing} onClose={() => setTesting(null)} />}
      {deleting && <ConfirmDelete item={{ name: deleting.name, note: "Owners can no longer use it in an import job. No import job uses it now.", remove: () => saveImportWorkflows(all.filter((x) => x.id !== deleting.id)) || (toast.error("Could not save. This browser's storage is full or blocked."), false) }} onClose={() => setDeleting(null)} />}
    </>
  );
}
