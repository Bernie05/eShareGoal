"use client";

import { useState } from "react";
import { Plus, Search, Workflow, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FIELD_ROLES, FIELD_TYPES, fieldFor, FIND_FIELDS, FIND_OPS, findPairs, roleOf, suggestRules, withRole, gmailQuery, keyOf, runWorkflow, whereLabel, workflowProblems, type ExtractField, type FieldRole, type FieldSource, type FindCond, type FindStep, type ImportWorkflow, type Json, type RunResult } from "@/lib/import-workflows";
import { SAMPLE_EMAILS, type SampleEmail } from "@/lib/gmail-import";
import { cn } from "@/lib/utils";
import { OWN_PREFIX, WORKFLOW_LIMITS } from "@/lib/constants";

export const newRulesId = () => `${OWN_PREFIX}${Date.now().toString(36)}`;
export const blankRules = (): ImportWorkflow => ({
  id: "", name: "", about: "", status: "Draft", updated: new Date().toISOString(),
  find: { match: [[]], label: "", days: 30 },
  fields: [],
});
export const typeLabel = Object.fromEntries(FIELD_TYPES) as Record<ExtractField["type"], string>;

interface RunBadgeProps {
  r: RunResult;
}
// ---------- Shared with the Owner's Gmail import ----------
/** What happened to one email, as a short badge. */
function RunBadge({ r }: RunBadgeProps) {
  if (r.step === 1) return <Badge variant="outline" className="text-muted-foreground">Not matched</Badge>;
  return r.deposit ? <Badge className="border-0 bg-success/15 text-success">Deposit</Badge> : <Badge variant="outline">Not a deposit</Badge>;
}
const runWhy = (r: RunResult) => r.step === 1 ? r.why : r.why ? `Read: ${r.why}` : "Amount and payer found";
interface JsonViewProps {
  json: Json | Record<string, unknown>;
}
export const JsonView = ({ json }: JsonViewProps) => <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">{JSON.stringify(json, null, 2)}</pre>;
interface EmailTextProps {
  e: SampleEmail;
}
const EmailText = ({ e }: EmailTextProps) => <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">{`From: ${e.from}\nTo: ${e.to}\nSubject: ${e.subject}\n\n${e.body}`}</pre>;

/** Where, as one list of conditions joined by AND / OR (AND is checked first). Stored as groups: an OR starts a new group. */
type Row = { c: FindCond; or: boolean };
const PLACEHOLDER: Record<FindCond["field"], string> = { from: "notify@yourbank.com", to: "Bernie", subject: "Transfer Received", body: "Transfer From", text: "1000" };
interface WhereEditorProps {
  match: FindCond[][];
  onChange: (m: FindCond[][]) => void;
  disabled?: boolean;
  idPrefix: string;
}
function WhereEditor({ match, onChange, disabled, idPrefix }: WhereEditorProps) {
  const rows: Row[] = match.filter((g) => g.length).flatMap((g, gi) => g.map((c, ci) => ({ c, or: gi > 0 && ci === 0 })));
  const save = (next: Row[]) => onChange(next.reduce<FindCond[][]>((gs, r, i) => (i === 0 || !r.or ? (gs.length ? gs[gs.length - 1].push(r.c) : gs.push([r.c]), gs) : [...gs, [r.c]]), []));
  const set = (i: number, patch: Partial<FindCond>, or = rows[i].or) => save(rows.map((r, j) => (j === i ? { c: { ...r.c, ...patch }, or } : r)));
  const groups = rows.filter((r) => r.or).length + 1;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">{rows.map((r, i) => {
        const name = `condition ${i + 1}`;
        return (
          <li key={i} className={cn("grid grid-cols-[4.5rem_1fr_1fr] gap-2 sm:grid-cols-[4.5rem_7rem_8.5rem_1fr_auto]", r.or && "border-t border-dashed pt-2")}>
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
        <Button variant="outline" size="sm" disabled={rows.length >= WORKFLOW_LIMITS.conds} onClick={() => save([...rows, { c: { field: rows.length ? "body" : "from", op: "contains", value: "" }, or: false }])}><Plus aria-hidden /> Add condition</Button>
        {groups > 1 && <span className="text-xs text-muted-foreground">AND is checked before OR: A AND B OR C means (A and B) or C.</span>}
      </div>}
    </div>
  );
}

interface WorkflowInfoProps {
  w: ImportWorkflow;
}
/** What a workflow is, for an Owner choosing one: which emails it reads, what it reads from them, and an example. */
export function WorkflowInfo({ w }: WorkflowInfoProps) {
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

interface FieldFinderProps {
  email: SampleEmail | null;
  fields: ExtractField[];
  onAdd: (f: ExtractField) => void;
}
// ---------- Find fields: every "Label: value" in a test email, one click to read it into JSON ----------
function FieldFinder({ email, fields, onAdd }: FieldFinderProps) {
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
        <p className="text-xs text-muted-foreground">{email ? <>Find the values in <span className="font-medium text-foreground">{email.subject || "the pasted email"}</span>{email.id === "pasted" ? " (pasted)" : ""}</> : "Paste a sample email first to list its values."}</p>
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

interface SectionProps {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}
// ---------- Editor ----------
function Section({ n, title, hint, children }: SectionProps) {
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

const ROLE_HINT: Partial<Record<FieldRole, string>> = { amount: "Needed", payer: "Needed" };
interface ReadListProps {
  w: ImportWorkflow;
  onChange: (w: ImportWorkflow) => void;
  email: SampleEmail | null;
  /** Values read from the sample or Gmail test, shown beside each field. */
  json?: Json;
}
// ---------- Step 2: tick what to read, and say what each value is ----------
export function ReadList({ w, onChange, email, json }: ReadListProps) {
  const pairs = email ? findPairs(email.body) : [];
  const has = (after: string) => w.fields.some((f) => f.after.trim().toLowerCase() === after.toLowerCase());
  const set = (fields: ExtractField[]) => onChange({ ...w, fields });
  const rest = pairs.filter((p) => !has(p.after));
  const shown = (f: ExtractField) => pairs.find((p) => p.after === f.after)?.value ?? (json?.[f.key] != null ? String(json[f.key]) : f.source ? `Email ${f.source}` : `After “${f.after}”`);
  if (!w.fields.length && !rest.length) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Paste a sample email in step 1 and the values in it show up here.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {w.fields.map((f, i) => (
        <li key={f.key || i} className="flex items-center gap-3 px-3 py-2">
          <input type="checkbox" checked aria-label={`Stop reading ${f.label || f.key}`} className="size-4 shrink-0 accent-primary" onChange={() => set(w.fields.filter((_, j) => j !== i))} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.label || f.key}</span><span className="block truncate text-xs text-muted-foreground">{shown(f)}</span></span>
          <NativeSelect aria-label={`What ${f.label || f.key} is`} className="w-32 shrink-0" value={roleOf(f)} onChange={(e) => set(withRole(w.fields, i, e.target.value as FieldRole))}>{FIELD_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
        </li>
      ))}
      {rest.map((p) => (
        <li key={p.after} className="flex items-center gap-3 px-3 py-2">
          <input type="checkbox" checked={false} aria-label={`Read ${p.label}`} className="size-4 shrink-0 accent-primary" onChange={() => set([...w.fields, fieldFor(p, "other", w.fields)].slice(0, WORKFLOW_LIMITS.fields))} />
          <span className="min-w-0 flex-1 text-muted-foreground"><span className="block truncate text-sm">{p.label}</span><span className="block truncate text-xs">{p.value}</span></span>
        </li>
      ))}
    </ul>
  );
}
/** What still stops the job from working, in plain words, or null. */
export function missingRoles(w: ImportWorkflow) {
  const roles = w.fields.map(roleOf);
  const lack = (Object.keys(ROLE_HINT) as FieldRole[]).filter((r) => !roles.includes(r)).map((r) => FIELD_ROLES.find(([v]) => v === r)![1]);
  return lack.length ? `Pick which value is: ${lack.join(" and ")}.` : null;
}

interface MustContainProps {
  w: ImportWorkflow;
  onChange: (w: ImportWorkflow) => void;
  email: SampleEmail | null;
}
// ---------- Step 2: the emails to import, as a short list. Every line must be true (AND); Advanced has OR and the rest ----------
export function MustContain({ w, onChange, email }: MustContainProps) {
  const [text, setText] = useState("");
  const groups = w.find.match.filter((g) => g.some((c) => c.value.trim()));
  const conds = groups[0] ?? [];
  const setConds = (next: FindCond[]) => onChange({ ...w, find: { ...w.find, match: [next, ...groups.slice(1)] } });
  const same = (a: FindCond, b: FindCond) => a.field === b.field && a.op === b.op && a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
  const ideas = email ? suggestRules(email).conds.filter((c) => !conds.some((x) => same(x, c))) : [];
  const add = () => { if (text.trim() && conds.length < WORKFLOW_LIMITS.conds) { setConds([...conds, { field: "body", op: "contains", value: text.trim() }]); setText(""); } };
  const label = (c: FindCond) => (c.field === "body" && c.op === "contains" ? c.value : `${FIND_FIELDS.find(([f]) => f === c.field)?.[1]} ${FIND_OPS.find(([o]) => o === c.op)?.[1]} ${c.value}`);
  return (
    <div className="space-y-2">
      {conds.length > 0 && <ul className="divide-y rounded-lg border">{conds.map((c, i) => (
        <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{label(c)}</span>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.value}`} onClick={() => setConds(conds.filter((_, j) => j !== i))}><X aria-hidden /></Button>
        </li>
      ))}</ul>}
      {ideas.map((c) => <Button key={label(c)} variant="outline" size="xs" className="mr-1.5 max-w-full" onClick={() => setConds([...conds, c])}><Plus aria-hidden /><span className="truncate">{label(c)}</span></Button>)}
      <div className="flex gap-2">
        <Input aria-label="Text the email must contain" maxLength={WORKFLOW_LIMITS.condValue} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add text the email must contain" />
        <Button variant="outline" disabled={!text.trim()} onClick={add}><Plus aria-hidden /> Add</Button>
      </div>
      {groups.length > 1 && <p className="text-xs text-muted-foreground">This job also has OR conditions. They are under Advanced.</p>}
    </div>
  );
}

interface RulesEditorProps {
  w: ImportWorkflow;
  onChange: (w: ImportWorkflow) => void;
  tried: boolean;
  /** The pasted sample, or null: "Find fields" lists what is in it. */
  email: SampleEmail | null;
}
// ---------- A job's filter: which emails, and the target fields read from each ----------
export function RulesEditor({ w, onChange, tried, email: finderEmail }: RulesEditorProps) {
  const set = (patch: Partial<ImportWorkflow>) => onChange({ ...w, ...patch });
  const setFind = (patch: Partial<FindStep>) => set({ find: { ...w.find, ...patch } });
  const setField = (i: number, patch: Partial<ExtractField>) => set({ fields: w.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const problems = workflowProblems(w, []);
  const err = (k: string) => tried && problems[k] ? <p role="alert" className="text-xs text-destructive">{problems[k]}</p> : null;
  return (
    <div className="space-y-3">
            <Section n={1} title="Which emails" hint="Which emails are payments. Pick a field and how it must match, and join the conditions with AND or OR (for example skip statements and money sent with “Body does not contain”). Empty conditions are skipped.">
              <WhereEditor idPrefix="wf-where" match={w.find.match} onChange={(match) => setFind({ match })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="wf-label">Gmail label (optional)</Label><Input id="wf-label" value={w.find.label} onChange={(e) => setFind({ label: e.target.value })} placeholder="eShareGoal" /></div>
                <div className="space-y-1"><Label htmlFor="wf-days">Look back (days)</Label><Input id="wf-days" type="number" min={0} max={365} value={w.find.days} onChange={(e) => setFind({ days: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })} /></div>
              </div>
              {err("find")}
              <p className="text-xs text-muted-foreground">Gmail search: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{gmailQuery(w.find)}</code></p>
            </Section>

            <Section n={2} title="Target fields" hint="Each field becomes one JSON value. Most values come right after a label, on the same line (“Transfer From: …” or a table row “Transfer Amount ⇥ PHP 7,000.00”) or on the next line. Mark the fields that tell who paid.">
              <FieldFinder email={finderEmail} fields={w.fields} onAdd={(f) => w.fields.length < WORKFLOW_LIMITS.fields && set({ fields: [...w.fields, f] })} />
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
                        ? <div><Input aria-label={`Field ${i + 1}: pattern`} className="font-mono text-xs" maxLength={WORKFLOW_LIMITS.pattern} value={f.pattern} onChange={(e) => setField(i, { pattern: e.target.value })} placeholder={String.raw`PHP\s?([\d,.]+)`} />{err(`fields.${i}.pattern`)}</div>
                        : <div><Input aria-label={`Field ${i + 1}: label it comes after`} maxLength={60} value={f.after} onChange={(e) => setField(i, { after: e.target.value })} placeholder="Transfer From:" />{err(`fields.${i}.after`)}</div>}
                    </div>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={!!f.payer} onChange={(e) => setField(i, { payer: e.target.checked || undefined })} /> Identifies who paid (map it to a member below)</label>
                  </li>
                );
              })}</ul>
              {err("fields")}
              {w.fields.length < WORKFLOW_LIMITS.fields && <Button variant="outline" size="sm" onClick={() => set({ fields: [...w.fields, { key: "", label: "", type: "text", after: "" }] })}><Plus aria-hidden /> Add field</Button>}
              <p className="text-xs text-muted-foreground">Advanced patterns are regular expressions; the first ( ) group is the value. Amounts are stored in centavos. A field named <code className="font-mono">reference</code> is used to skip duplicates.</p>
            </Section>
    </div>
  );
}

interface ResultObjectProps {
  w: ImportWorkflow;
  email: SampleEmail;
}
/** What the job reads from the pasted sample: whether it passes the filter, and the JSON. */
export function ResultObject({ w, email }: ResultObjectProps) {
  if (!email.body.trim()) return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Paste a sample email to see what this job reads from it.</p>;
  const r = runWorkflow(w, email, w.find);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><RunBadge r={r} /> {runWhy(r)}</p>
      {r.step === 2 && <JsonView json={r.json} />}
    </div>
  );
}
