// Goal setup: what each goal (sub group) is connected to (integrations), what runs on its own (scheduled jobs) and what
// the group's Owners are told about (notifications). Listed on the parent group's page, one row per goal; there is no
// group-wide setup. Kept in a cookie in the preview (no backend yet), parsed defensively.
import { parseImportJobs, type ImportJob } from "./import-workflows";
import { CAR_CREDIT_ENTRY, SAMPLE_INBOX, SAMPLE_INBOX_SINCE } from "./constants";

export type Freq = "hourly" | "daily" | "weekly" | "monthly";
export type Schedule = { freq: Freq; time: string; weekday: number; day: number };
export type ServiceId = "gmail" | "calendar" | "sheets";
export type JobId = "due-reminders" | "overdue-check";
export type NotifyKey = "due" | "imports" | "milestones" | "members" | "email";
// imports: the goal's Gmail import jobs, each a workflow + schedule + who each payer is (see lib/import-workflows.ts).
// serverImports: they came from the database, so the cookie does not keep them. Set on the server, never read from the cookie.
// mailbox: the Gmail inbox the import jobs read. No password or token is ever kept here: Google sign-in keeps its refresh
// token on the server, encrypted; an IMAP app password is sent once and kept there too (both simulated in the preview).
// jobs[id].template: the email template an email job sends (lib/email-templates.ts); none = its built-in one.
// removed: the Owner deleted this built-in job from the goal; it does not run and can be restored.
export type JobSetting = { on: boolean; schedule: Schedule; template?: string; removed?: boolean };
export type MailboxMethod = "oauth" | "imap";
// connected: date signed in; tested: when Test connection last passed (ISO).
export type Mailbox = { method: MailboxMethod; address: string; label: string; days: number; connected?: string; tested?: string };
export type SetupSettings = { integrations: ServiceId[]; jobs: Partial<Record<JobId, JobSetting>>; notify: Partial<Record<NotifyKey, boolean>>; imports?: ImportJob[]; mailbox?: Mailbox; serverImports?: boolean };
/** The goal a setting applies to. `loan`: the goal has installments, so due-date jobs and reminders apply. */
export type Target = { loan: boolean };

/** Key of one goal's setup: "family~car-credit". */
export const settingsKey = (groupId: string, goalId: string) => `${groupId}~${goalId}`;

export const SERVICES: { id: ServiceId; name: string; what: string }[] = [
  { id: "gmail", name: "Gmail", what: "Connects the inbox that receives bank and e-wallet alerts. Gmail import jobs (Scheduled jobs) read it." },
  { id: "calendar", name: "Google Calendar", what: "Adds this goal's due dates and deadline to the group calendar." },
  { id: "sheets", name: "Google Sheets", what: "Copies this goal's records to a sheet, updated daily." },
];

const at = (freq: Freq, time: string, weekday = 1, day = 1): Schedule => ({ freq, time, weekday, day });
/** Jobs of a goal. `needs`: only with that integration connected. `loan`: only for loan goals. */
export const JOBS: { id: JobId; name: string; what: string; needs?: ServiceId; loan?: boolean; on: boolean; schedule: Schedule }[] = [
  { id: "due-reminders", name: "Due date reminders", what: "Notifies every member of the group 10 days before their monthly share and the installment are due.", loan: true, on: true, schedule: at("daily", "09:00") },
  { id: "overdue-check", name: "Overdue check", what: "Marks unpaid installments as overdue after the due date and emails the members who have not paid.", loan: true, on: true, schedule: at("daily", "00:00") },
];

export const NOTIFY: { key: NotifyKey; label: string; hint?: string; needs?: ServiceId; loan?: boolean }[] = [
  { key: "due", label: "Payment due reminders", loan: true },
  { key: "imports", label: "New import candidates", needs: "gmail" },
  { key: "milestones", label: "Goal milestones", hint: "25%, 50%, 75% and reached." },
  { key: "members", label: "Participant updates", hint: "Who joins or leaves this goal." },
  { key: "email", label: "Also send by email", hint: "To each Owner's account email." },
];

const blank = (): SetupSettings => ({ integrations: [], jobs: {}, notify: {} });
// The sample data starts set up: Family's Car Credit imports from Gmail and emails its Owners.
const SAMPLE: Record<string, SetupSettings> = { [CAR_CREDIT_ENTRY]: { ...blank(), integrations: ["gmail"], notify: { email: true }, mailbox: { method: "oauth", address: SAMPLE_INBOX, label: "", days: 30, connected: SAMPLE_INBOX_SINCE } } };
export const settingsFor = (all: Record<string, SetupSettings>, key: string) => all[key] ?? SAMPLE[key] ?? blank();
/** The inbox a goal's import jobs read: its own, or the sample one (Car Credit saved before mailboxes existed). */
export const mailboxFor = (key: string, s: SetupSettings) => (s.integrations.includes("gmail") ? s.mailbox ?? SAMPLE[key]?.mailbox : undefined);

interface AppliesInput {
  needs?: ServiceId;
  loan?: boolean;
}
const applies = (x: AppliesInput, s: SetupSettings, t: Target) => (!x.needs || s.integrations.includes(x.needs)) && (!x.loan || t.loan);
/** Jobs that apply to this entry right now, with its own on/off and schedule. Deleted ones are left out. */
export const jobsFor = (s: SetupSettings, t: Target) =>
  JOBS.filter((j) => applies(j, s, t) && !s.jobs[j.id]?.removed).map((j) => ({ ...j, on: s.jobs[j.id]?.on ?? j.on, schedule: s.jobs[j.id]?.schedule ?? j.schedule, template: s.jobs[j.id]?.template }));
/** Built-in jobs the Owner deleted from this entry. */
export const removedJobs = (s: SetupSettings, t: Target) => JOBS.filter((j) => applies(j, s, t) && s.jobs[j.id]?.removed);
/** Notification options that apply to this entry, with their current value (on unless turned off; email is opt-in). */
export const notifyFor = (s: SetupSettings, t: Target) =>
  NOTIFY.filter((n) => applies(n, s, t)).map((n) => ({ ...n, on: s.notify[n.key] ?? n.key !== "email" }));
/** Jobs (or notification options) that do not apply yet, with what would unlock them. */
export const lockedFor = <T extends { needs?: ServiceId; loan?: boolean }>(list: T[], s: SetupSettings, t: Target) =>
  list.filter((x) => !applies(x, s, t)).map((x) => ({ ...x, why: x.needs ? "connect Gmail" : "loan goals only" }));

const FREQS: Freq[] = ["hourly", "daily", "weekly", "monthly"];
export const okSchedule = (s: unknown): s is Schedule => {
  const x = s as Schedule;
  return !!x && FREQS.includes(x.freq) && /^\d{2}:\d{2}$/.test(x.time) && Number.isInteger(x.weekday) && x.weekday >= 0 && x.weekday <= 6 && Number.isInteger(x.day) && x.day >= 1 && x.day <= 28;
};
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;
export const okEmail = (v: string) => EMAIL.test(v.trim());
function parseMailbox(m: unknown): Mailbox | undefined {
  const x = m as Mailbox;
  if (!x || (x.method !== "oauth" && x.method !== "imap") || typeof x.address !== "string") return undefined;
  return { method: x.method, address: x.address.slice(0, 254), label: typeof x.label === "string" ? x.label.slice(0, 40) : "", days: Number.isInteger(x.days) ? Math.min(365, Math.max(1, x.days)) : 30,
    ...(typeof x.connected === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.connected) && { connected: x.connected }),
    ...(typeof x.tested === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x.tested) && { tested: x.tested }) };
}
export function parseGroupSettings(raw?: string): Record<string, SetupSettings> {
  try {
    const all: unknown = JSON.parse(decodeURIComponent(raw ?? "{}"));
    if (!all || typeof all !== "object" || Array.isArray(all)) return {};
    return Object.fromEntries(Object.entries(all as Record<string, SetupSettings>)
      .filter(([k, s]) => /^(family|my-[a-z0-9-]{1,60})~[a-z0-9-]{1,80}$/.test(k) && s && Array.isArray(s.integrations)).slice(0, 30)
      .map(([k, s]) => [k, {
        integrations: s.integrations.filter((x) => SERVICES.some((v) => v.id === x)),
        jobs: Object.fromEntries(Object.entries(s.jobs ?? {}).filter(([id, v]) => JOBS.some((j) => j.id === id) && typeof v?.on === "boolean" && okSchedule(v.schedule))
          .map(([id, v]) => [id, { on: v!.on, schedule: v!.schedule, ...(typeof v!.template === "string" && /^et-[a-z0-9-]{1,60}$/.test(v!.template) ? { template: v!.template } : {}), ...(v!.removed === true ? { removed: true } : {}) }])),
        notify: Object.fromEntries(Object.entries(s.notify ?? {}).filter(([id, v]) => NOTIFY.some((n) => n.key === id) && typeof v === "boolean")),
        imports: parseImportJobs(s.imports, (v) => (okSchedule(v) ? v : undefined)),
        mailbox: parseMailbox(s.mailbox),
      }]));
  } catch { return {}; }
}
