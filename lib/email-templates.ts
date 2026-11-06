import type { JobId } from "./group-settings";

// Email templates the System Admin writes; scheduled jobs (Group setup → Jobs) send them through Gmail.
// A template is HTML or plain text with {{placeholders}}, and may carry images. In HTML an image is shown with
// <img src="cid:file-name.jpg"> (inline, as Gmail sends it); in plain text images go as attachments.
export type EmailFormat = "html" | "text";
export type EmailImage = { id: string; name: string; dataUrl: string };
/** Which job can use it; "any" fits every email job. */
export type EmailPurpose = "any" | Extract<JobId, "due-reminders" | "overdue-check">;
export type EmailTemplate = {
  id: string; name: string; purpose: EmailPurpose;
  subject: string; format: EmailFormat; body: string;
  images: EmailImage[];
  status: "Published" | "Draft";
  updated: string;   // ISO date
  builtIn?: boolean; // ships with the app: can be copied, not edited or deleted
};

export const PURPOSES: [EmailPurpose, string][] = [
  ["due-reminders", "Due date reminders"], ["overdue-check", "Overdue check"], ["any", "Any email job"],
];
/** Jobs that send email, and the built-in template each uses until the Owner picks another. */
export const EMAIL_JOBS: Partial<Record<JobId, string>> = { "due-reminders": "et-due", "overdue-check": "et-overdue" };

// What a job fills in when it sends. The preview uses the sample values.
export const PLACEHOLDERS: [string, string, string][] = [
  ["member", "Member's name", "Babylyn"],
  ["group", "Group", "Family"],
  ["goal", "Goal", "Car Credit"],
  ["amount", "Amount due", "₱8,000.00"],
  ["due_date", "Due date", "Nov 1, 2026"],
  ["month", "Month", "November"],
  ["owner", "Group Owner", "Bernz"],
  ["paid_this_month", "Paid this month", "₱8,000.00"],
  ["advance", "Advance", "₱0.00"],
  ["link", "Link to the goal", "https://esharegoal.example/goal/car-credit"],
];
export const SAMPLE_VALUES = Object.fromEntries(PLACEHOLDERS.map(([k, , v]) => [k, v]));


const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Fills the placeholders and returns the subject and the email as HTML (plain text is wrapped and escaped).
 * Values are escaped in HTML, so a member's name can never add markup. `cid:` images become their data URLs for
 * the preview; the real send attaches them inline instead. Unknown {{names}} are left as they are, so typos show.
 */
export function renderEmail(t: Pick<EmailTemplate, "subject" | "format" | "body" | "images">, values: Record<string, string> = SAMPLE_VALUES) {
  const fill = (s: string, html: boolean) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in values ? (html ? esc(values[k]) : values[k]) : m));
  const subject = fill(t.subject, false);
  let html = t.format === "html" ? fill(t.body, true) : `<pre style="font:14px/1.6 system-ui,sans-serif;white-space:pre-wrap;margin:0">${esc(fill(t.body, false))}</pre>`;
  for (const img of t.images) html = html.split(`cid:${img.name}`).join(img.dataUrl);
  return { subject, html, text: t.format === "text" ? fill(t.body, false) : undefined };
}
/** Placeholders written in the template that no job fills in (likely typos). */
export const unknownPlaceholders = (t: Pick<EmailTemplate, "subject" | "body">) =>
  [...new Set([...`${t.subject} ${t.body}`.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))].filter((k) => !(k in SAMPLE_VALUES));

const card = (inner: string) => `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px">eShareGoal · {{group}} / {{goal}}</p>
${inner}
  <p style="font-size:12px;color:#9ca3af;margin-top:24px">You get this because you are a member of {{group}}. The group Owner sets these reminders.</p>
</div>`;

export const BUILT_IN_EMAILS: EmailTemplate[] = [
  { id: "et-due", name: "Payment due reminder", purpose: "due-reminders", builtIn: true, status: "Published", updated: "2026-10-01", images: [], format: "html",
    subject: "Reminder: your {{month}} share for {{goal}} is due {{due_date}}",
    body: card(`  <h1 style="font-size:20px;margin:0 0 8px">Hi {{member}}, your share is coming up</h1>
  <p style="margin:0 0 16px">Your <b>{{month}}</b> share of <b>{{amount}}</b> for {{goal}} is due on <b>{{due_date}}</b>.</p>
  <p style="margin:0 0 16px">After you pay, submit the transaction with the receipt so {{owner}} can approve it.</p>
  <a href="{{link}}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open {{goal}}</a>`) },
  { id: "et-overdue", name: "Overdue notice", purpose: "overdue-check", builtIn: true, status: "Published", updated: "2026-10-01", images: [], format: "text",
    subject: "{{goal}}: your {{month}} share is overdue",
    body: "Hi {{member}},\n\nYour {{month}} share of {{amount}} for {{goal}} was due on {{due_date}} and has not been paid yet.\n\nPlease pay as soon as you can, then submit the receipt in eShareGoal: {{link}}\n\nThank you,\n{{owner}}" },
];

export const isEmailTemplate = (x: unknown): x is EmailTemplate => {
  const t = x as EmailTemplate;
  return typeof t?.id === "string" && typeof t.name === "string" && typeof t.subject === "string" && typeof t.body === "string"
    && (t.format === "html" || t.format === "text") && PURPOSES.some(([p]) => p === t.purpose) && (t.status === "Published" || t.status === "Draft")
    && Array.isArray(t.images) && t.images.every((i) => typeof i?.name === "string" && typeof i.dataUrl === "string" && i.dataUrl.startsWith("data:image/"));
};
