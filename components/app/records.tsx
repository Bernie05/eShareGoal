"use client";

import { useSyncExternalStore } from "react";
import type { LoanTerms, Tx } from "@/lib/demo-data";

// Records of goals created in the preview (no backend yet). They live in this browser's localStorage,
// one list per goal, because cookies are too small for them. Every read and write is guarded.
export type GoalRecord = {
  id: string; member: string; date: string; note: string;
  amount: number;              // money: centavos; count: the value logged; checklist: 0
  direction?: "in" | "out";    // money only: deposit in, or payment / expense out
  title?: string; done?: boolean; // checklist only: a task
  proofOf?: string;            // the approved submission this record came from (its receipt image stays there)
} & TxDetails;
// Sample goals (Car Credit...) keep the full transaction details, so approved submissions list and filter like their other transactions.
export type TxDetails = { kind?: "deposit" | "loan_payment" | "expense" | "withdrawal"; method?: string; ref?: string };
/** How the money moved, as the member picks it when submitting. */
export const PAYMENT_METHODS = ["System upload", "Bank transfer", "GCash", "Maya", "Cash", "Other"] as const;

// A transaction a Member submits with a receipt image. It changes nothing until the group Owner approves it;
// approving adds a GoalRecord (recordId), rejecting keeps it here with the reason so the Member can see why.
export type SubmissionStatus = "Pending" | "Approved" | "Rejected";
export type Submission = {
  id: string; member: string; date: string; note: string;
  amount: number; direction?: "in" | "out"; // same meaning as on GoalRecord
  proof: string;      // receipt image as a JPEG data URL, shrunk before saving
  submitted: string;  // ISO timestamp
  status: SubmissionStatus;
  reviewedBy?: string; reviewed?: string; reason?: string; recordId?: string;
  dismissed?: boolean; // the Member closed it in their "Recently reviewed" list
} & TxDetails;

const EVENT = "esg-records-change";
const cache = new Map<string, { raw: string | null; list: unknown[] }>();

function readList<T>(key: string, valid: (x: unknown) => x is T): T[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { return [] as T[]; }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.list as T[]; // same reference while unchanged, as useSyncExternalStore needs
  let list: T[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter(valid);
  } catch { list = []; }
  cache.set(key, { raw, list });
  return list;
}

function writeList(key: string, list: unknown[]) {
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch { return false; } // private mode, or the storage quota is full
  window.dispatchEvent(new Event(EVENT));
  return true;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

const RECORDS = (goalId: string) => `esg-records:${goalId}`;
const SUBMISSIONS = (goalId: string) => `esg-submissions:${goalId}`;
const EMPTY_RECORDS: GoalRecord[] = [];
const EMPTY_SUBMISSIONS: Submission[] = [];
const isRecord = (r: unknown): r is GoalRecord => { const x = r as GoalRecord; return typeof x?.id === "string" && typeof x.member === "string" && typeof x.date === "string" && typeof x.amount === "number" && Number.isFinite(x.amount); };
const isSubmission = (s: unknown): s is Submission => { const x = s as Submission; return isRecord(x) && typeof x.proof === "string" && x.proof.startsWith("data:image/") && typeof x.submitted === "string" && ["Pending", "Approved", "Rejected"].includes(x.status); };

// Records are never dropped to save space: totals and each member's month-by-month ledger depend on every one of them.
// When the browser's storage is full the write fails (false) and the caller says so; nothing is lost.
export const writeRecords = (goalId: string, list: GoalRecord[]) => writeList(RECORDS(goalId), list);
/** A goal's records right now, outside React (for writes from another page, such as confirming an import). */
export const readRecords = (goalId: string) => readList(RECORDS(goalId), isRecord);

/** Live list of a goal's records. Empty on the server and on first paint, then the stored list. */
export function useGoalRecords(goalId: string) {
  return useSyncExternalStore(subscribe, () => { const l = readList(RECORDS(goalId), isRecord); return l.length ? l : EMPTY_RECORDS; }, () => EMPTY_RECORDS);
}

// The Owner's edits and deletions of transactions built into the app (the sample history), kept beside it by id.
export type TxPatch = Pick<Tx, "memberId" | "amount" | "date" | "type" | "method" | "ref" | "notes">;
export type TxEdit = { id: string; deleted?: boolean } & Partial<TxPatch>;
const EDITS = (goalId: string) => `esg-tx-edits:${goalId}`;
const EMPTY_EDITS: TxEdit[] = [];
const isEdit = (e: unknown): e is TxEdit => typeof (e as TxEdit)?.id === "string";
export const writeTxEdits = (goalId: string, list: TxEdit[]) => writeList(EDITS(goalId), list);
export function useTxEdits(goalId: string) {
  return useSyncExternalStore(subscribe, () => { const l = readList(EDITS(goalId), isEdit); return l.length ? l : EMPTY_EDITS; }, () => EMPTY_EDITS);
}

// The Owner's changes to a loan goal's terms (Car Credit), stored as a one-item list so they share the guarded reader.
const TERMS = (goalId: string) => `esg-loan-terms:${goalId}`;
const EMPTY_TERMS: LoanTerms[] = [];
const isTerms = (t: unknown): t is LoanTerms => { const x = t as LoanTerms; return typeof x?.monthly === "number" && typeof x.term === "number" && typeof x.firstDue === "string" && typeof x.shares === "object" && x.shares !== null; };
export const writeLoanTerms = (goalId: string, t: LoanTerms) => writeList(TERMS(goalId), [t]);
/** The saved terms, or null while there are none (then the sample terms apply). */
export function useLoanTerms(goalId: string): LoanTerms | null {
  return useSyncExternalStore(subscribe, () => readList(TERMS(goalId), isTerms), () => EMPTY_TERMS)[0] ?? null;
}

// Images are large, so only the newest decided submissions are kept; pending ones are never dropped.
export const MAX_DECIDED_SUBMISSIONS = 20;
export function writeSubmissions(goalId: string, list: Submission[]) {
  const pending = list.filter((s) => s.status === "Pending");
  const decided = list.filter((s) => s.status !== "Pending").sort((a, b) => (b.reviewed ?? "").localeCompare(a.reviewed ?? "")).slice(0, MAX_DECIDED_SUBMISSIONS);
  return writeList(SUBMISSIONS(goalId), [...pending, ...decided]);
}

/** Live list of a goal's submissions, newest first. */
export function useGoalSubmissions(goalId: string) {
  return useSyncExternalStore(subscribe, () => { const l = readList(SUBMISSIONS(goalId), isSubmission); return l.length ? l : EMPTY_SUBMISSIONS; }, () => EMPTY_SUBMISSIONS);
}

/** Submissions of several goals at once (the header bell, a group page), keyed by goal id. Empty on the server and first paint. */
export function useSubmissionsAcross(goalIds: string[]): Record<string, Submission[]> {
  // The snapshot is the raw stored text of every goal, so it is a string that only changes when one of them does.
  const sig = useSyncExternalStore(subscribe, () => "~" + goalIds.map((id) => { try { return localStorage.getItem(SUBMISSIONS(id)) ?? ""; } catch { return ""; } }).join("\n"), () => "");
  return sig ? Object.fromEntries(goalIds.map((id) => [id, readList(SUBMISSIONS(id), isSubmission)])) : {};
}

export const newRecordId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const newSubmissionId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const MAX_PROOF_UPLOAD = 10 * 1024 * 1024; // what a Member may pick; it is shrunk well below this before saving
/** Shrinks a photo or screenshot to at most 1280px on its longest side as a JPEG data URL (about 100-300 KB),
 *  so a few receipts fit in the browser's storage. Throws when the file is not an image the browser can read. */
export async function shrinkImage(file: File, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}
