"use client";

import { useSyncExternalStore } from "react";
import type { Schedule } from "@/lib/group-settings";

// Scheduled jobs an Owner creates for one goal: an email from one of the System Admin's templates, sent on a schedule.
// subject/body: this job's own wording, set only when the Owner changed the template's; the template itself stays as
// the Admin wrote it. Kept in this browser's localStorage per goal ("family~car-credit"): email bodies are too big for the settings cookie.
export type CustomJob = {
  id: string; name: string; on: boolean; schedule: Schedule;
  template: string; subject?: string; body?: string;
  to: "all" | "unpaid";
};

const KEY = (entryKey: string) => `esg-custom-jobs:${entryKey}`;
const EVENT = "esg-custom-jobs-change";
const EMPTY: CustomJob[] = [];
const cache = new Map<string, { raw: string | null; list: CustomJob[] }>();

const isJob = (x: unknown): x is CustomJob => {
  const j = x as CustomJob;
  return typeof j?.id === "string" && typeof j.name === "string" && typeof j.on === "boolean" && typeof j.template === "string"
    && (j.to === "all" || j.to === "unpaid") && typeof j.schedule?.freq === "string" && typeof j.schedule.time === "string";
};

function read(entryKey: string): CustomJob[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY(entryKey)); } catch { return EMPTY; }
  const hit = cache.get(entryKey);
  if (hit && hit.raw === raw) return hit.list; // same reference while unchanged, as useSyncExternalStore needs
  let list = EMPTY;
  try { const v: unknown = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) list = v.filter(isJob); } catch { /* keep none */ }
  cache.set(entryKey, { raw, list });
  return list;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

/** The goal's own jobs, oldest first. Empty on the server and first paint. */
export const useCustomJobs = (entryKey: string) => useSyncExternalStore(subscribe, () => read(entryKey), () => EMPTY);

/** Saves the goal's jobs. False when the browser's storage is full or blocked. */
export function saveCustomJobs(entryKey: string, list: CustomJob[]) {
  try {
    if (list.length) localStorage.setItem(KEY(entryKey), JSON.stringify(list));
    else localStorage.removeItem(KEY(entryKey));
  } catch { return false; }
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export const newJobId = () => `cj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
