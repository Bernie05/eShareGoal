"use client";

import { useEffect, useSyncExternalStore } from "react";
import { goalImportedAction } from "@/app/actions/import-setup";
import { CAR_CREDIT_ENTRY, IMPORT_REVIEW_POLL_MS, IMPORTED_RECORDS_TTL_MS } from "@/lib/constants";
import type { ImportedRecord, ServerReview } from "@/lib/server/import-review";

// Payments saved on the server (by the timer or by Confirm), shared by every screen that shows the goal.
type Imported = { keys: string[]; records: ImportedRecord[]; review: ServerReview[] };
const EMPTY: Imported = { keys: [], records: [], review: [] };
const cache = new Map<string, Imported & { at: number }>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Asks the server again. Throws when it cannot answer, so a run never treats "unknown" as "nothing recorded". */
export async function refreshImported(entry: string, withKeys = false) {
  const r = await goalImportedAction(entry, withKeys);
  if (!r.ok) throw new Error(r.error);
  cache.set(entry, { ...r.data, at: Date.now() });
  listeners.forEach((fn) => fn());
  return r.data;
}

let watchers = 0, timer: ReturnType<typeof setInterval>;
/** Keeps Car Credit's queue fresh while a screen shows it: one timer however many ask, started by the first and stopped by the last. Returns the stop. */
export function pollImported() {
  if (!watchers++) timer = setInterval(() => { refreshImported(CAR_CREDIT_ENTRY).catch(() => {}); }, IMPORT_REVIEW_POLL_MS);
  return () => { if (!--watchers) clearInterval(timer); };
}

/** The goal's server records. Empty on the server and on first paint, then loaded. entry null: this goal has none. */
export function useImported(entry: string | null): Imported {
  useEffect(() => {
    if (!entry) return;
    const had = cache.get(entry);
    if (had && Date.now() - had.at < IMPORTED_RECORDS_TTL_MS) return;
    cache.set(entry, { ...(had ?? EMPTY), at: Date.now() }); // one request, however many components ask at once
    refreshImported(entry).catch(() => cache.delete(entry));
  }, [entry]);
  return useSyncExternalStore(subscribe, () => (entry && cache.get(entry)) || EMPTY, () => EMPTY);
}
