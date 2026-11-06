import "server-only";
import { z } from "zod";
import { db, type Db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { DEFAULT_APP_URL, RESEND_API_URL } from "@/lib/constants";

// Shared by the server services (lib/server/*): readable errors, input checks, the audit trail and outgoing email.

/** A problem the person can fix ("Use at least 3 characters."); shown as is. Anything else shows a generic message. */
export class UserError extends Error { constructor(message: string) { super(message); this.name = "UserError"; } }

/** Parses untrusted input with a zod schema; the first problem becomes a UserError. */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Check the form and try again.");
  return r.data;
}

export const email = z.string().trim().toLowerCase().email("Enter a valid email.").max(254);
export const uuid = z.string().uuid("Not found.");
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-29.");
/** Pesos typed by a person → integer centavos. */
export const pesos = z.coerce.number().finite().nonnegative("Use 0 or more.").max(1_000_000_000, "That amount is too large.").transform((n) => Math.round(n * 100));

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
interface AuditInput {
  actorId: string | null;
  action: string;
  groupId?: string | null;
  goalId?: string | null;
  detail?: Record<string, unknown>;
}
/** One row in the audit log. Pass the transaction when inside one, so the row is kept or dropped with the change. */
export async function audit(entry: AuditInput, tx: Db | Tx = db) {
  await tx.insert(auditLog).values({ actorId: entry.actorId, action: entry.action, groupId: entry.groupId ?? null, goalId: entry.goalId ?? null, detail: entry.detail ?? {} });
}

/** Development only: every email goes to this address instead of the real person. Production always ignores it. */
export const mailTestTo = () => (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production" ? process.env.MAIL_TEST_TO?.trim() || null : null);

/** Outgoing email (invitations, decisions). Until Resend is set up (AUTH_RESEND_KEY) it only logs, so nothing fails. */
export async function sendMail(to: string, subject: string, text: string) {
  const key = process.env.AUTH_RESEND_KEY, from = process.env.AUTH_EMAIL_FROM, testTo = mailTestTo();
  if (!key || !from) { console.info(`[mail not sent: no AUTH_RESEND_KEY] to=${to} subject="${subject}"`); return false; }
  const mail = testTo ? { to: testTo, subject: `[Test] ${subject}`, text: `Test email. It would have gone to ${to}.\n\n${text}` } : { to, subject, text };
  try {
    const res = await fetch(RESEND_API_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, ...mail }) });
    if (!res.ok) console.error(`[mail failed] ${res.status} to=${mail.to}`);
    return res.ok;
  } catch (e) { console.error("[mail failed]", e); return false; }
}
export const appUrl = () => process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
