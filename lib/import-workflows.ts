// Import workflows: which payment emails Gmail import reads (Where), and how it reads them into JSON.
// The System Admin builds and publishes the common ones (Workflows screen); an Owner may also make the goal's own.
// A goal's Gmail import jobs (Goal setup → Scheduled jobs) each run one workflow on a schedule and map payers to members;
// Goal setup → Integrations → Gmail only connects the inbox they read.
import type { SampleEmail } from "./gmail-import";
import type { Schedule } from "./group-settings";

/** Step 1, Where: which emails. An email is read when ANY group matches, and a group matches when ALL its conditions do,
 *  e.g. [[To contains Bernie], [Subject contains Sample, Body contains 1000]] = To: Bernie OR (Subject: Sample AND 1000).
 *  Empty conditions are skipped. label and days only go into the Gmail search (the sample inbox is all recent and unlabeled). */
export type FindField = "from" | "to" | "subject" | "body" | "text";
export type FindOp = "contains" | "not_contains" | "starts_with" | "is";
export type FindCond = { field: FindField; op: FindOp; value: string };
export type FindStep = { match: FindCond[][]; label: string; days: number };
/** Step 2: one JSON value. Read as the text after `after` (to the end of that line), or by an advanced `pattern`. */
export type FieldType = "money" | "text" | "last4" | "date";
/** source: read the whole email header instead of the text (the To address is often who paid, on "transfer sent" emails). */
export type FieldSource = "from" | "to" | "subject";
export type ExtractField = { key: string; label: string; type: FieldType; after: string; pattern?: string; source?: FieldSource; payer?: boolean };
export type ImportWorkflow = {
  id: string; name: string; about: string;
  find: FindStep; fields: ExtractField[];
  status: "Published" | "Draft"; updated: string; builtIn?: boolean;
  by?: string; // an Owner's own workflow: who made it (the System Admin sees Owners' workflows read-only)
};

/** A goal's Gmail import job: one workflow run on a schedule, and which payer value is which member.
 *  To change a common workflow for one inbox, the Owner copies it into their own (Workflows page). */
export type PayerRule = { field: string; value: string; member: string };
// seen: the workflow's `updated` when the job was saved or last reviewed; a newer one means the workflow changed since.
export type ImportJob = { id: string; name?: string; on: boolean; schedule: Schedule; workflow: string; map: PayerRule[]; seen?: string };
export const DEFAULT_IMPORT_SCHEDULE: Schedule = { freq: "daily", time: "08:00", weekday: 1, day: 1 };

export const FIND_FIELDS: [FindField, string][] = [["from", "From"], ["to", "To (receiver)"], ["subject", "Subject"], ["body", "Body"], ["text", "Anywhere"]];
export const FIND_OPS: [FindOp, string][] = [["contains", "contains"], ["not_contains", "does not contain"], ["starts_with", "starts with"], ["is", "is exactly"]];
export const FIELD_TYPES: [FieldType, string][] = [["money", "Amount (₱)"], ["text", "Text"], ["last4", "Last digits"], ["date", "Date"]];
export const LIMITS = { workflows: 20, groups: 5, conds: 12, fields: 15, pattern: 200, body: 10_000, jobs: 8, rules: 10 };
const cond = (field: FindField, op: FindOp, value: string): FindCond => ({ field, op, value });

export const BUILT_IN_WORKFLOWS: ImportWorkflow[] = [
  { id: "wf-bank", name: "Bank transfer (sample bank)", about: "InstaPay and PESONet transfers received, from the bank's notification emails.", builtIn: true, status: "Published", updated: "2026-10-01",
    find: { match: [[cond("from", "contains", "notify@example-bank.test"), cond("subject", "contains", "Transfer Received"), cond("body", "contains", "Transfer From"), cond("body", "not_contains", "statement")]], label: "", days: 30 },
    fields: [
      { key: "amount", label: "Amount", type: "money", after: "", pattern: String.raw`(?:PHP|₱)\s?([\d,]+(?:\.\d{2})?)` },
      { key: "sender", label: "Sender name", type: "text", after: "Transfer From:", payer: true },
      { key: "account", label: "Account (last 4)", type: "last4", after: "From Account:", payer: true },
      { key: "reference", label: "Reference", type: "text", after: "Reference No.:" },
      { key: "date", label: "Date", type: "date", after: "Date:" },
    ] },
  { id: "wf-wallet", name: "E-wallet money received (sample)", about: "Money received in the e-wallet. Emails about money sent are skipped.", builtIn: true, status: "Published", updated: "2026-10-01",
    find: { match: [[cond("from", "contains", "no-reply@example-wallet.test"), cond("subject", "contains", "money"), cond("body", "starts_with", "You have received")]], label: "", days: 30 },
    fields: [
      { key: "amount", label: "Amount", type: "money", after: "received PHP" },
      { key: "sender", label: "Sender name", type: "text", after: "from", payer: true },
      { key: "mobile", label: "Mobile (last 4)", type: "last4", after: "Sender mobile:", payer: true },
      { key: "reference", label: "Reference", type: "text", after: "Ref. No." },
    ] },
];

// Family's Car Credit starts with an import job for each sample workflow, its members mapped.
export const SAMPLE_IMPORT_JOBS: Record<string, ImportJob[]> = {
  "family~car-credit": [
    { id: "ij-bank", name: "Bank transfers", on: true, schedule: DEFAULT_IMPORT_SCHEDULE, workflow: "wf-bank", map: [{ field: "sender", value: "BERNARDO SANTOS", member: "Bernz" }, { field: "account", value: "7710", member: "Babylyn" }, { field: "sender", value: "WILLIAM SANTOS", member: "Billy" }] },
    { id: "ij-wallet", name: "E-wallet received", on: true, schedule: { ...DEFAULT_IMPORT_SCHEDULE, time: "08:05" }, workflow: "wf-wallet", map: [{ field: "mobile", value: "3302", member: "Billy" }] },
  ],
};

// ---------- Running a workflow on one email ----------
const lower = (s: string) => s.toLowerCase();
const filled = (g: FindCond[]) => g.filter((c) => c.value.trim());
const condText = (c: FindCond, e: SampleEmail) => {
  const body = e.body.slice(0, LIMITS.body);
  return c.field === "text" ? `${e.subject}\n${body}` : c.field === "body" ? body : e[c.field];
};
function condPasses(c: FindCond, e: SampleEmail) {
  const t = lower(condText(c, e).trim()), v = lower(c.value.trim());
  return c.op === "contains" ? t.includes(v) : c.op === "not_contains" ? !t.includes(v) : c.op === "starts_with" ? t.startsWith(v) : t === v;
}
const condLabel = (c: FindCond) => `${c.field === "to" ? "To" : FIND_FIELDS.find(([f]) => f === c.field)![1]} ${FIND_OPS.find(([o]) => o === c.op)![1]} "${c.value.trim()}"`;
/** The groups as words: A AND B, OR C. */
export const whereLabel = (f: FindStep) => f.match.map(filled).filter((g) => g.length).map((g) => g.map(condLabel).join(" AND ")).join(", OR ") || "No conditions";
/** Why Where would read (nearly) every email, or null. Every group needs a filled condition other than "does not contain". */
function findProblem(f: FindStep): string | null {
  const groups = f.match.map(filled).filter((g) => g.length);
  if (!groups.length) return "Add at least one condition, so not every email is read.";
  if (groups.some((g) => g.every((c) => c.op === "not_contains"))) return "Each group needs a condition other than “does not contain”, or it reads nearly every email.";
  return null;
}

/** A pattern the Admin may save, or why not. Long ones and repeats inside repeats ((a+)+) could freeze the import. */
function patternProblem(p: string): string | null {
  if (p.length > LIMITS.pattern) return `Keep it under ${LIMITS.pattern} characters.`;
  if (/\([^)]*[+*}][^)]*\)\s*[+*{]/.test(p)) return "Repeats inside repeats, like (a+)+, can freeze the import. Simplify it.";
  try { new RegExp(p, "i"); } catch { return "This is not a valid pattern."; }
  return null;
}

const SEP = /^[\s:：=|\-–—]+/; // what sits between a label and its value: "Label: v", "Label\tv", "Label - v"
const alnum = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
/** The value after a label, read the way most notification emails write it: on the same line ("Amount: PHP 1.00",
 *  "Amount<tab>PHP 1.00" from a table), or on the next line when the label is alone. A label at the start of a line
 *  wins over one inside a sentence, so "Transfer Amount" is not read from "…your Transfer Amount is shown below". */
function afterLabel(label: string, body: string): string | null {
  const l = lower(label.trim());
  if (!l) return null;
  const lines = body.split(/\r?\n/);
  const whole = (line: string, at: number) => at >= 0 && !(alnum(l.at(-1)) && alnum(line[at + l.length])) && !(at > 0 && alnum(l[0]) && alnum(line[at - 1]));
  let i = lines.findIndex((x) => whole(x, lower(x.trimStart()).startsWith(l) ? x.length - x.trimStart().length : -1));
  let at = i >= 0 ? lines[i].length - lines[i].trimStart().length : -1;
  if (i < 0) i = lines.findIndex((x) => { const a = lower(x).indexOf(l); return whole(x, a) && ((at = a), true); });
  if (i < 0) return null;
  const rest = lines[i].slice(at + l.length).replace(SEP, "").trim();
  return rest || lines.slice(i + 1).find((x) => x.trim())?.trim() || null;
}
/** The address in a From/To header: "BPI Online <a@b.test>" → a@b.test. */
const address = (h: string) => h.match(/<([^>]+)>/)?.[1] ?? h;
function raw(f: ExtractField, e: SampleEmail, body: string): string | null {
  if (f.source) return f.source === "subject" ? e.subject : address(e[f.source]);
  if (f.pattern) {
    if (patternProblem(f.pattern)) return null;
    const m = body.match(new RegExp(f.pattern, "i"));
    return m ? (m[1] ?? m[0]) : null;
  }
  return afterLabel(f.after, body);
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** A date as banks write it: "Sunday, Aug 23 2026; 08:47:44 PM (GMT +8)" → 2026-08-23. Null when it is not one. */
function readDate(v: string): string | null {
  const t = v.replace(/\([^)]*\)/g, " ").replace(/\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b\.?,?/gi, " ").replace(/[;,]/g, " ").replace(/\s+/g, " ").trim();
  const d = new Date(t);
  return /\d{4}/.test(t) && !Number.isNaN(d.getTime()) ? iso(d) : null;
}
/** One JSON value, by its type. Money is in centavos, like every record. */
function value(f: ExtractField, e: SampleEmail, body: string): string | number | null {
  const v = raw(f, e, body)?.trim();
  if (!v) return null;
  if (f.type === "money") { const n = v.match(/\d[\d,]*(?:\.\d{1,2})?/)?.[0]; return n ? Math.round(Number(n.replace(/,/g, "")) * 100) : null; }
  // Masked accounts often show only 3 digits (XXXX-XXXX-091): up to the last 4, at least 3.
  if (f.type === "last4") { const d = v.match(/\d+(?!.*\d)/)?.[0] ?? ""; return d.length >= 3 ? d.slice(-4) : null; }
  if (f.type === "date") return readDate(v) ?? v.slice(0, 40);
  return v.slice(0, 80);
}

/** "Label: value" pairs in an email, to offer as JSON fields. Reads "Label: v", "Label<tab>v" and "Label  v" (2+ spaces). */
type FoundPair = { label: string; after: string; value: string; type: FieldType };
export function findPairs(body: string): FoundPair[] {
  const seen = new Set<string>();
  return body.slice(0, LIMITS.body).split(/\r?\n/).flatMap((line) => {
    const m = line.trim().match(/^([\p{L}][\p{L}\p{N} .'’/&#-]{1,38}?)(?:\s*:\s+|\s*:$|\t+|\s{2,})(.*)$/u);
    if (!m || m[1].split(/\s+/).length > 6 || seen.has(lower(m[1].trim()))) return [];
    const label = m[1].trim().replace(/[.:]$/, ""), value = m[2].trim();
    if (!value) return [];
    seen.add(lower(m[1].trim()));
    const type: FieldType = /^(PHP|₱|P)\s?\d/i.test(value) ? "money" : readDate(value) ? "date" : /[X*•]{2,}/i.test(value) && /\d{3}/.test(value) ? "last4" : "text";
    return [{ label, after: m[1].trim(), value: value.slice(0, 80), type }];
  });
}
/** A JSON key from a label: "Transaction Ref No." → transaction_ref_no. */
export const keyOf = (label: string) => lower(label).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1").slice(0, 30) || "field";

export type Json = Record<string, string | number | null>;
export type RunResult =
  | { step: 1; why: string }                                 // not matched by Where
  | { step: 2; json: Json; deposit: boolean; why?: string }; // read into JSON

/** Runs the workflow's two steps on one email. `find`: Where as the goal uses it. */
export function runWorkflow(w: Pick<ImportWorkflow, "fields">, e: SampleEmail, find: FindStep): RunResult {
  const groups = find.match.map(filled).filter((g) => g.length);
  if (!groups.length) return { step: 1, why: "No conditions yet" };
  if (!groups.some((g) => g.every((c) => condPasses(c, e)))) {
    if (groups.length > 1) return { step: 1, why: `Matches none of the ${groups.length} groups` };
    return { step: 1, why: `Needs ${condLabel(groups[0].find((c) => !condPasses(c, e))!)}` };
  }
  const body = e.body.slice(0, LIMITS.body);
  const json: Json = { messageId: e.id, ...Object.fromEntries(w.fields.map((f) => [f.key, value(f, e, body)])) };
  const amount = typeof json.amount === "number" && json.amount > 0;
  const payer = w.fields.some((f) => f.payer && json[f.key] != null);
  return { step: 2, json, deposit: amount && payer, why: !amount ? "No amount found" : !payer ? "No payer found" : undefined };
}

// Gmail search has no "starts with", "is exactly" or body-only search: those search for the words, and the import
// then checks each email it gets back exactly (runWorkflow).
const term = (c: FindCond) => {
  const v = c.value.trim().replace(/[()"]/g, "");
  return (c.op === "not_contains" ? "-" : "") + (c.field === "text" || c.field === "body" ? `"${v}"` : c.field === "subject" ? `subject:("${v}")` : `${c.field}:(${v})`);
};
/** The Gmail search Where becomes, e.g. (to:(Bernie) OR (subject:("Sample") "1000")) newer_than:30d. */
export function gmailQuery(f: FindStep) {
  const groups = f.match.map(filled).filter((g) => g.length).map((g) => g.map(term));
  const match = groups.length > 1 ? `(${groups.map((g) => (g.length > 1 ? `(${g.join(" ")})` : g[0])).join(" OR ")})` : groups[0]?.join(" ");
  return [match, f.label.trim() && `label:${f.label.trim().replace(/\s+/g, "-")}`, f.days > 0 && `newer_than:${f.days}d`].filter(Boolean).join(" ") || "(every email)";
}
/** Which member a JSON belongs to: the first rule whose payer field equals its value (case does not matter). */
export const memberFor = (map: PayerRule[], json: Json) =>
  map.find((r) => r.value.trim() && json[r.field] != null && lower(String(json[r.field])) === lower(r.value.trim()))?.member ?? null;

// ---------- Checking what is stored ----------
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const KEY = /^[a-z][a-z0-9_]{0,29}$/;
const days = (v: unknown) => (Number.isInteger(v) ? Math.min(365, Math.max(0, v as number)) : undefined);
const isCond = (c: unknown): c is FindCond => {
  const x = c as FindCond;
  return FIND_FIELDS.some(([f]) => f === x?.field) && FIND_OPS.some(([o]) => o === x.op) && typeof x.value === "string";
};
const parseMatch = (m: unknown): FindCond[][] =>
  Array.isArray(m) ? m.filter(Array.isArray).slice(0, LIMITS.groups).map((g: unknown[]) => g.filter(isCond).slice(0, LIMITS.conds).map((c) => ({ field: c.field, op: c.op, value: c.value.slice(0, 80) }))) : [[]];
/** Problems that stop a workflow from being saved, by field ("name", "fields.2.key"…). */
export function workflowProblems(w: ImportWorkflow, all: ImportWorkflow[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!w.name.trim()) e.name = "Give the workflow a name.";
  else if (all.some((x) => x.id !== w.id && lower(x.name.trim()) === lower(w.name.trim()))) e.name = "Another workflow has this name.";
  const fp = findProblem(w.find);
  if (fp) e.find = fp;
  w.fields.forEach((f, i) => {
    if (!KEY.test(f.key)) e[`fields.${i}.key`] = "Lowercase letters, digits and _, starting with a letter.";
    else if (w.fields.findIndex((x) => x.key === f.key) !== i) e[`fields.${i}.key`] = "Already used.";
    if (f.source) { /* the whole header: nothing to fill in */ }
    else if (f.pattern !== undefined) { const p = f.pattern.trim() ? patternProblem(f.pattern) : "Write the pattern, or switch back to text after a label."; if (p) e[`fields.${i}.pattern`] = p; }
    else if (!f.after.trim()) e[`fields.${i}.after`] = "Write the label the value comes after.";
  });
  if (!w.fields.some((f) => f.key === "amount" && f.type === "money")) e.fields = "Add a field with key amount and type Amount.";
  else if (!w.fields.some((f) => f.payer)) e.fields = "Mark at least one field as identifying the payer.";
  return e;
}

/** A workflow read back from storage, or null when it is not one. */
export function parseWorkflow(x: unknown): ImportWorkflow | null {
  const w = x as ImportWorkflow;
  if (typeof w?.id !== "string" || !/^wf-[a-z0-9-]{1,60}$/.test(w.id) || typeof w.name !== "string" || !w.find || !Array.isArray(w.fields)) return null;
  return {
    id: w.id, name: str(w.name, 60), about: str(w.about, 200), status: w.status === "Published" ? "Published" : "Draft", updated: str(w.updated, 24),
    ...(typeof w.by === "string" && w.by.trim() && { by: w.by.slice(0, 60) }),
    find: { match: parseMatch(w.find.match), label: str(w.find.label, 40), days: days(w.find.days) ?? 30 },
    fields: w.fields.filter((f) => typeof f?.key === "string" && FIELD_TYPES.some(([t]) => t === f.type)).slice(0, LIMITS.fields)
      .map((f) => ({ key: str(f.key, 30), label: str(f.label, 40), type: f.type, after: str(f.after, 60), ...(typeof f.pattern === "string" && { pattern: f.pattern.slice(0, LIMITS.pattern) }),
        ...((f.source === "from" || f.source === "to" || f.source === "subject") && { source: f.source }), ...(f.payer === true && { payer: true }) })),
  };
}

/** A goal's import jobs from the settings cookie. schedule: the settings' own schedule check (lib/group-settings.ts). */
export function parseImportJobs(jobs: unknown, schedule: (v: unknown) => Schedule | undefined): ImportJob[] | undefined {
  if (!Array.isArray(jobs)) return undefined;
  return jobs.filter((j) => typeof j?.workflow === "string" && /^wf-[a-z0-9-]{1,60}$/.test(j.workflow) && Array.isArray(j.map)).slice(0, LIMITS.jobs).map((j, i) => ({
    id: typeof j.id === "string" && /^ij-[a-z0-9-]{1,40}$/.test(j.id) ? j.id : `ij-${i + 1}`,
    ...(typeof j.name === "string" && j.name.trim() && { name: j.name.slice(0, 60) }),
    on: j.on !== false, schedule: schedule(j.schedule) ?? DEFAULT_IMPORT_SCHEDULE, workflow: j.workflow, ...(typeof j.seen === "string" && { seen: j.seen.slice(0, 24) }),
    map: (j.map as PayerRule[]).filter((r) => typeof r?.field === "string" && typeof r.value === "string" && typeof r.member === "string").slice(0, LIMITS.rules)
      .map((r) => ({ field: r.field.slice(0, 30), value: r.value.slice(0, 40), member: r.member.slice(0, 40) })),
  }));
}

/** How many import jobs run each workflow, over every goal's setup (the sample goal counts until it is saved). */
export function jobCounts(all: Record<string, { imports?: ImportJob[] }>) {
  const counts: Record<string, number> = {};
  const jobs = [...Object.values(all).flatMap((s) => s.imports ?? []), ...Object.entries(SAMPLE_IMPORT_JOBS).filter(([k]) => !all[k]?.imports).flatMap(([, j]) => j)];
  for (const j of jobs) counts[j.workflow] = (counts[j.workflow] ?? 0) + 1;
  return counts;
}

/** A pasted email with private details hidden, for saving as a test email: the name part of email addresses, and long
 *  numbers such as account, card, mobile or confirmation numbers (7+ digits; the last 4 stay, so last-digits fields still
 *  read). Amounts are short, so they stay. n: how many were hidden. */
export function maskPrivate(text: string): { text: string; n: number } {
  let n = 0;
  const out = text
    .replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@/g, (_, first: string) => { n++; return `${first}***@`; })
    .replace(/\d{7,}/g, (d) => { n++; return "•".repeat(d.length - 4) + d.slice(-4); });
  return { text: out, n };
}
