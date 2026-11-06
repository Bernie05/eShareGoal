import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { gmailConnections } from "@/lib/db/schema";
import { appUrl, audit, sendMail, UserError } from "./core";
import { Forbidden, timerGoalAccess, TIMER_GOALS, type Viewer } from "./dal";
import { devBypass } from "./dev";
import { gmailQuery, runWorkflow, type ImportWorkflow, type Json } from "@/lib/import-workflows";
import type { SampleEmail } from "@/lib/gmail-import";
import { BASE_PATH, GMAIL_ACCOUNT_LIMIT, GMAIL_API_URL, GMAIL_IMPORT_MAX, GMAIL_READ_BATCH, GMAIL_SCOPE, GMAIL_SPARE_GROUP, GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_TIMEOUT_MS, GOOGLE_TOKEN_URL, LOCALE, TIME_ZONE } from "@/lib/constants";

// Gmail connection for one goal (OAuth 2.0, server-side flow). The Owner signs in on Google's own page and allows
// read-only access; Google gives a refresh token that lets scheduled jobs read mail while they are offline.
// It uses the same Google client as sign-in, but asks for Gmail on its own, so signing in never asks for mail access.
// Tokens stay on the server: the refresh token is encrypted at rest and never logged or sent to the browser.

export const entryKey = z.string().regex(/^[a-z0-9-]{1,61}~[a-z0-9-]{1,80}$/, "Not found.");
export const gmailConfigured = () => !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.TOKEN_ENCRYPTION_KEY);
const redirectUri = () => `${appUrl()}/api/gmail/callback`;

/** A path inside the app to come back to, or the Dashboard: never another site. */
export function safeNext(next: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : `${BASE_PATH}/dashboard`;
}

// ---------- Who manages a goal's inbox ----------
/** A goal with records on the server: its Owners only. A preview-only goal has no Owner on the server and the timer never reads it:
 *  the person who linked its inbox, or anyone while none is linked. Checked when connecting starts, when Google comes back, and on each change. */
export async function canManageInbox(viewer: Viewer, entry: string) {
  if (devBypass) return true;
  if (viewer.status !== "active") return false;
  if (TIMER_GOALS[entry]) return (await timerGoalAccess(viewer, entry))?.role === "owner";
  const [c] = await db.select({ by: gmailConnections.connectedBy }).from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  return !c || c.by === viewer.id;
}
async function assertInboxManager(viewer: Viewer, entry: string) {
  if (!(await canManageInbox(viewer, entry))) throw new Forbidden("Only an Owner of this goal can manage its Gmail.");
}

// ---------- Encryption: AES-256-GCM, so a changed value fails to open instead of reading as garbage ----------
function key() {
  const k = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (k.length < 32) throw new Error("TOKEN_ENCRYPTION_KEY is missing or too short (use: openssl rand -base64 32).");
  return createHash("sha256").update(k).digest();
}
export function encryptToken(plain: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decryptToken(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable token.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

// ---------- Calling Google ----------
type FailKind = "offline" | "expired" | "scope" | "disabled" | "other";
export class GoogleFail extends Error { constructor(public kind: FailKind) { super(`Google: ${kind}`); this.name = "GoogleFail"; } }

async function google<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) }); } catch { throw new GoogleFail("offline"); }
  const body = await res.json().catch(() => ({})) as { error?: unknown };
  if (res.ok) return body as T;
  if (body.error === "invalid_grant" || res.status === 401) throw new GoogleFail("expired");
  if (/accessNotConfigured|SERVICE_DISABLED/.test(JSON.stringify(body))) throw new GoogleFail("disabled"); // Gmail API not enabled in the Google project
  throw new GoogleFail(res.status === 403 ? "scope" : "other");
}
const client = () => ({ client_id: process.env.AUTH_GOOGLE_ID ?? "", client_secret: process.env.AUTH_GOOGLE_SECRET ?? "" });
type Token = { access_token: string; refresh_token?: string; scope?: string };
const token = (form: Record<string, string>) => google<Token>(GOOGLE_TOKEN_URL, { method: "POST", body: new URLSearchParams({ ...client(), ...form }) });
const bearer = (access: string) => ({ headers: { Authorization: `Bearer ${access}` } });
const hasScope = (t: Token) => !!t.scope?.split(" ").includes(GMAIL_SCOPE);

// ---------- Connecting ----------
/** Google's sign-in page. access_type + prompt=consent: Google only gives a refresh token when asked this way.
 *  hint: the inbox the Owner picked. Without one, Google lists the accounts in the browser so they can choose. */
export function gmailAuthUrl(state: string, hint?: string) {
  const q = new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID ?? "", redirect_uri: redirectUri(), response_type: "code", scope: GMAIL_SCOPE, access_type: "offline", prompt: hint ? "consent" : "select_account consent", state });
  if (hint) q.set("login_hint", hint);
  return `${GOOGLE_AUTH_URL}?${q}`;
}

/** A goal stops using an inbox. Cancels the access at Google, unless another goal still reads it: cancelling cuts off every
 *  goal on the account. In development it is kept instead, so that inbox links again without Google (linkGmailInDev).
 *  Best effort: it is dropped here even if Google cannot be reached. */
async function letGoOfInbox(entry: string, email: string, refreshToken: string) {
  const [other] = await db.select({ entry: gmailConnections.entry }).from(gmailConnections).where(and(eq(gmailConnections.email, email), ne(gmailConnections.entry, entry))).limit(1);
  if (other) return;
  if (devBypass) { await db.update(gmailConnections).set({ entry: `${GMAIL_SPARE_GROUP}~${createHash("sha256").update(email).digest("hex").slice(0, 16)}` }).where(eq(gmailConnections.entry, entry)); return; }
  try { await google(GOOGLE_REVOKE_URL, { method: "POST", body: new URLSearchParams({ token: decryptToken(refreshToken) }) }); } catch { /* dropped here anyway */ }
}

/** Google came back with a code: swaps it for tokens, checks read access was allowed, and saves the inbox for this goal. */
export async function finishGmailSignIn(entry: string, code: string, viewer: Viewer) {
  await assertInboxManager(viewer, entry);
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!hasScope(t)) throw new GoogleFail("scope"); // the person can untick it on Google's page
  if (!t.refresh_token) throw new GoogleFail("other");
  const { emailAddress: email } = await google<{ emailAddress: string }>(`${GMAIL_API_URL}/profile`, bearer(t.access_token));
  const row = { email: email.toLowerCase(), refreshToken: encryptToken(t.refresh_token), connectedBy: viewer.id, connectedAt: new Date() };
  const [old] = await db.select().from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  if (old && old.email !== row.email) await letGoOfInbox(entry, old.email, old.refreshToken); // another account replaces it
  await db.insert(gmailConnections).values({ entry, ...row }).onConflictDoUpdate({ target: gmailConnections.entry, set: row });
  await audit({ actorId: viewer.id, action: "gmail.connect", detail: { entry, email: row.email } });
  return row.email;
}

// accounts: inboxes to offer in the link dialog: this person's email, then the inboxes they linked to goals.
// A site cannot see which Google accounts are in the browser; only Google's own page can list those.
// devLink: development only: a listed inbox links without Google's page (see linkGmailInDev).
export type GmailStatus = { configured: boolean; connection: { email: string; connectedAt: string } | null; accounts: string[]; devLink: boolean };
/** What the screen may know: never the token, only inboxes this viewer linked, and the goal's inbox only for those who run the goal. */
export async function gmailStatus(entry: string, viewer: Viewer): Promise<GmailStatus> {
  const [c] = await db.select({ email: gmailConnections.email, connectedAt: gmailConnections.connectedAt, by: gmailConnections.connectedBy }).from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  const mine = await db.select({ email: gmailConnections.email }).from(gmailConnections).where(devBypass ? undefined : eq(gmailConnections.connectedBy, viewer.id)).orderBy(desc(gmailConnections.connectedAt)).limit(GMAIL_ACCOUNT_LIMIT);
  const role = TIMER_GOALS[entry] ? (await timerGoalAccess(viewer, entry))?.role : null;
  const sees = devBypass || (TIMER_GOALS[entry] ? role === "owner" || role === "admin" : c?.by === viewer.id);
  return { configured: gmailConfigured(), connection: c && sees ? { email: c.email, connectedAt: c.connectedAt.toISOString() } : null, accounts: [...new Set([viewer.email.toLowerCase(), ...mine.map((m) => m.email)])], devLink: devBypass };
}

// ---------- Development only: linking without Google's page, to debug quickly. Production always signs in ----------
/** Points a goal at an inbox that already signed in, sharing its saved access. False if that inbox never signed in. */
export async function reuseGmailInbox(entry: string, email: string, viewer: Viewer) {
  const [saved] = await db.select().from(gmailConnections).where(eq(gmailConnections.email, email.toLowerCase())).limit(1);
  if (!saved) return false;
  const [current] = await db.select().from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  if (current?.email === saved.email) return true;
  if (current) await disconnectGmail(entry, viewer);
  const row = { email: saved.email, refreshToken: saved.refreshToken, connectedBy: viewer.id, connectedAt: new Date() };
  await db.insert(gmailConnections).values({ entry, ...row }).onConflictDoUpdate({ target: gmailConnections.entry, set: row });
  await audit({ actorId: viewer.id, action: "gmail.connect", detail: { entry, email: row.email, dev: true } });
  return true;
}

/** True: linked with real access. False: that inbox never signed in, so the screen links it as a simulation. */
export async function linkGmailInDev(entry: string, email: string, viewer: Viewer) {
  if (!devBypass) throw new UserError("Sign in with Google to link an inbox.");
  const real = await reuseGmailInbox(entry, email, viewer);
  if (!real) await disconnectGmail(entry, viewer);
  return real;
}

/** Removes the inbox here and asks Google to cancel the access, unless another goal still reads it. */
export async function disconnectGmail(entry: string, viewer: Viewer) {
  await assertInboxManager(viewer, entry);
  const [c] = await db.select().from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  if (!c) return;
  await letGoOfInbox(entry, c.email, c.refreshToken);
  await db.delete(gmailConnections).where(eq(gmailConnections.entry, entry));
  await audit({ actorId: viewer.id, action: "gmail.disconnect", detail: { entry, email: c.email } });
}

// ---------- Reading an inbox for an import job ----------
// The workflow runs here, not in the browser: bank emails hold personal data, so only the values it reads leave the server.
// Nothing is saved: the Owner sees what was read, and adds it to Import review or the goal's records from the screen.
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: Header[] };
type FullMessage = { id: string; internalDate?: string; payload?: Part };
export type ImportRead = { id: string; received: string; json: Json; deposit: boolean };
export type ImportRun = { query: string; reads: ImportRead[]; more: boolean };
const stamp = (ms?: string) => new Date(Number(ms ?? 0)).toLocaleString("sv-SE", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" }); // 2026-11-05 13:07
const firstPart = (p: Part | undefined, type: string): string | null => {
  if (!p) return null;
  if (p.mimeType === type && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) { const found = firstPart(c, type); if (found) return found; }
  return null;
};
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", peso: "₱" };
/** An HTML email as lines of text, so a workflow reads it like a plain one: table cells become "Label<tab>value". */
export function htmlToText(html: string) {
  return html.replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(tr|p|div|li|h[1-6])>/gi, "\n").replace(/<\/t[dh]>/gi, "\t").replace(/<[^>]+>/g, "")
    .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (all, dec?: string, hex?: string, name?: string) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name!.toLowerCase()] ?? all))
    .split("\n").map((l) => l.replace(/[  ]+/g, " ").trim()).filter(Boolean).join("\n");
}
function emailOf(m: FullMessage): SampleEmail {
  const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
  const plain = firstPart(m.payload, "text/plain"), html = firstPart(m.payload, "text/html");
  return { id: m.id, from: h("from"), to: h("to"), subject: h("subject"), received: stamp(m.internalDate), body: plain?.trim() ? plain : htmlToText(html ?? "") };
}
const READ_FAILED: Record<FailKind, string> = {
  offline: "Google did not answer. Try again in a few minutes.",
  expired: "The Gmail sign-in expired or was revoked. Connect Gmail again.",
  scope: "Read access to Gmail was not allowed. Connect Gmail again and leave the box ticked.",
  disabled: "The Gmail API is not turned on for this Google project.",
  other: "Google refused the request. Try again.",
};

interface ReadInboxInput {
  entry: string;
  workflow: ImportWorkflow;
  /** The goal's Gmail label and read-back days: they apply when the workflow sets none of its own. */
  label: string;
  days: number;
  viewerId: string;
}
/** Finds the newest emails this workflow matches and reads them. Only whoever linked the inbox may read it. */
export async function readInboxForJob({ entry, workflow, label, days, viewerId }: ReadInboxInput): Promise<ImportRun> {
  const [c] = await db.select().from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  if (!c) throw new UserError("No Gmail is connected to this goal.");
  if (c.connectedBy !== viewerId) throw new UserError("Only the person who linked this inbox can read it.");
  if (!workflow.find.match.some((g) => g.some((x) => x.value.trim()))) throw new UserError("This workflow has no Where conditions yet.");
  const find = { ...workflow.find, label: workflow.find.label || label, days: workflow.find.days || days };
  const query = gmailQuery(find);
  try {
    const { access_token } = await token({ grant_type: "refresh_token", refresh_token: decryptToken(c.refreshToken) });
    const q = new URLSearchParams({ q: query, maxResults: String(GMAIL_IMPORT_MAX) });
    const { messages = [], nextPageToken } = await google<{ messages?: { id: string }[]; nextPageToken?: string }>(`${GMAIL_API_URL}/messages?${q}`, bearer(access_token));
    const reads: ImportRead[] = [];
    for (let i = 0; i < messages.length; i += GMAIL_READ_BATCH) {
      const batch = await Promise.all(messages.slice(i, i + GMAIL_READ_BATCH).map(({ id }) => google<FullMessage>(`${GMAIL_API_URL}/messages/${encodeURIComponent(id)}?format=full`, bearer(access_token))));
      for (const m of batch) {
        const e = emailOf(m), r = runWorkflow(workflow, e, find); // Gmail's search is rough: this checks each email exactly
        if (r.step === 2) reads.push({ id: e.id, received: e.received, json: r.json, deposit: r.deposit });
      }
    }
    await audit({ actorId: viewerId, action: "gmail.read", detail: { entry, workflow: workflow.id, searched: messages.length, read: reads.length } });
    return { query, reads, more: !!nextPageToken };
  } catch (e) {
    if (e instanceof GoogleFail) throw new UserError(READ_FAILED[e.kind]);
    throw e;
  }
}

// ---------- Test connection ----------
export type GmailEmail = { received: string; subject: string; from: string };
export type GmailStep = { title: string; result: "pass" | "warn" | "fail" | "skip"; detail: string; fix?: string; signIn?: boolean; emails?: GmailEmail[] };
type Header = { name: string; value: string };
type Message = { internalDate?: string; payload?: { headers?: Header[] } };
const when = (ms?: string) => new Date(Number(ms ?? 0)).toLocaleString(LOCALE, { timeZone: TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Tells the inbox the test passed. Sent through Resend, not Gmail: this connection is read-only and cannot send mail. */
async function confirmByEmail(to: string): Promise<GmailStep> {
  const title = "Confirmation email";
  if (!process.env.AUTH_RESEND_KEY || !process.env.AUTH_EMAIL_FROM) return { title, result: "warn", detail: "Not sent: the email service is not set up.", fix: "Add AUTH_RESEND_KEY and AUTH_EMAIL_FROM (see docs/integrations/4-resend-email.md)." };
  const sent = await sendMail(to, "eShareGoal: Gmail is connected", `eShareGoal can read this inbox. The connection test passed on ${when(String(Date.now()))}.\n\nThe connection is read-only: eShareGoal never sends, changes or deletes your email. You can remove it any time in the goal's Gmail settings.`);
  return sent ? { title, result: "pass", detail: `Sent to ${to}. Check that inbox.` }
    : { title, result: "warn", detail: `Could not send to ${to}.`, fix: "Resend refused it. Until your domain is verified, it only delivers to the email of your Resend account." };
}

/** Checks the real connection step by step and stops at the first failure, which says how to fix it.
 *  Reads only the sender and subject of the latest 5 emails, to show them to the Owner. Nothing is saved. */
export async function testGmail(viewer: Viewer, entry: string, label: string, days: number): Promise<GmailStep[]> {
  await assertInboxManager(viewer, entry);
  const steps: GmailStep[] = [];
  const signIn = "Google sign-in";
  const [c] = await db.select().from(gmailConnections).where(eq(gmailConnections.entry, entry)).limit(1);
  if (!c) return [{ title: signIn, result: "fail", signIn: true, detail: "No Gmail is connected to this goal.", fix: "Sign in with Google." }];

  let t: Token;
  try { t = await token({ grant_type: "refresh_token", refresh_token: decryptToken(c.refreshToken) }); }
  catch (e) {
    if (e instanceof GoogleFail && e.kind === "offline") return [{ title: "Reach Google", result: "fail", detail: "Google did not answer (network problem, or Google is down).", fix: "Try again in a few minutes." }];
    return [{ title: "Reach Google", result: "pass", detail: "Google answered." }, { title: signIn, result: "fail", signIn: true, detail: "The sign-in expired or was revoked in your Google Account.", fix: "Sign in with Google again. While the app is in Testing, Google ends it after 7 days." }];
  }
  steps.push({ title: "Reach Google", result: "pass", detail: "gmail.googleapis.com answered." });

  try {
    const { emailAddress } = await google<{ emailAddress: string }>(`${GMAIL_API_URL}/profile`, bearer(t.access_token));
    steps.push({ title: signIn, result: "pass", detail: `Signed in as ${emailAddress}.` });
    steps.push(hasScope(t) ? { title: "Read-only access", result: "pass", detail: "gmail.readonly granted: eShareGoal can read email, nothing else." }
      : { title: "Read-only access", result: "fail", signIn: true, detail: "Read access to Gmail was not allowed.", fix: "Sign in again and leave the Gmail box ticked." });
    if (!hasScope(t)) return steps;

    const name = label.trim();
    if (!name) steps.push({ title: "Gmail label", result: "skip", detail: "No label set: the whole inbox is searched." });
    else {
      const { labels = [] } = await google<{ labels?: { name: string }[] }>(`${GMAIL_API_URL}/labels`, bearer(t.access_token));
      if (!labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) { steps.push({ title: "Gmail label", result: "fail", detail: `There is no label "${name}" in this Gmail.`, fix: "Create the label (and a filter that adds it) in Gmail, or clear it here." }); return steps; }
      steps.push({ title: "Gmail label", result: "pass", detail: `Label "${name}" found.` });
    }

    const q = new URLSearchParams({ q: [`newer_than:${days}d`, name && `label:${name.replace(/\s+/g, "-")}`].filter(Boolean).join(" "), maxResults: "5" });
    const { messages = [], resultSizeEstimate = 0 } = await google<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(`${GMAIL_API_URL}/messages?${q}`, bearer(t.access_token));
    if (!messages.length) { steps.push({ title: "Read recent emails", result: "warn", detail: `No emails in the last ${days} days.`, fix: "Check that bank and e-wallet alerts go to this address, or read back more days." }); return steps; }
    const emails = await Promise.all(messages.map(async ({ id }) => {
      const m = await google<Message>(`${GMAIL_API_URL}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, bearer(t.access_token));
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      return { received: when(m.internalDate), subject: h("subject") || "(no subject)", from: h("from") };
    }));
    steps.push({ title: "Read recent emails", result: "pass", detail: `About ${Math.max(resultSizeEstimate, messages.length)} emails in the last ${days} days.`, emails });
    steps.push(await confirmByEmail(c.email));
  } catch (e) {
    const kind = e instanceof GoogleFail ? e.kind : "other";
    steps.push(kind === "disabled" ? { title: "Gmail API", result: "fail", detail: "The Gmail API is not turned on for this Google project.", fix: "Google Cloud → APIs & Services → Library → Gmail API → Enable." }
      : { title: "Read Gmail", result: "fail", signIn: kind === "expired" || kind === "scope", detail: kind === "offline" ? "Google stopped answering." : "Google refused the request.", fix: "Try again, or sign in with Google again." });
  }
  return steps;
}
