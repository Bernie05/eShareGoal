"use client";

import { useSyncExternalStore } from "react";
import { STORAGE, STORAGE_EVENTS } from "@/lib/constants";

// Reminders the Owner sends by hand ("Notify"), on top of the automatic ones. Kept in this browser's localStorage
// (the preview has no backend), so switching accounts with View as shows them to the member they were sent to.
export type Nudge = {
  id: string; to: string; from: string;
  sent: string;      // ISO timestamp
  month: string;     // the share it is about, "2026-11"
  amount: number;    // what was still due when it was sent, centavos
  message: string;
  kind?: "update";   // the Owner changed the goal's details (month/amount: unused); otherwise a payment reminder
};

const KEY = STORAGE.nudges;
const EVENT = STORAGE_EVENTS.nudges;
const EMPTY: Nudge[] = [];
let cache: { raw: string | null; list: Nudge[] } = { raw: null, list: EMPTY };

const isNudge = (x: unknown): x is Nudge => {
  const n = x as Nudge;
  return typeof n?.id === "string" && typeof n.to === "string" && typeof n.from === "string" && typeof n.sent === "string"
    && typeof n.month === "string" && typeof n.amount === "number" && typeof n.message === "string";
};

function read(): Nudge[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cache.raw) return cache.list; // same reference while unchanged, as useSyncExternalStore needs
  let list: Nudge[] = EMPTY;
  try { const v: unknown = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) list = v.filter(isNudge); } catch { /* keep none */ }
  cache = { raw, list };
  return list;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

/** Every reminder sent by hand, newest first. Empty on the server and first paint. */
export const useNudges = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** Saves new reminders (only the newest 50 are kept). False when the browser refuses to store them. */
export function sendNudges(more: Omit<Nudge, "id" | "sent">[]) {
  const sent = new Date().toISOString();
  const added = more.map((n, i) => ({ ...n, sent, id: `n-${Date.now().toString(36)}-${i}` }));
  try { localStorage.setItem(KEY, JSON.stringify([...added, ...read()].slice(0, 50))); } catch { return false; }
  window.dispatchEvent(new Event(EVENT));
  return true;
}
