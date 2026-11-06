"use client";

import { useMemo, useSyncExternalStore } from "react";

// Lists kept in this browser's localStorage (no backend in the preview). Each list is one key: reads are
// parsed defensively, writes notify every open page (same tab by event, other tabs by "storage").
export function listStore<T>(key: string, parse: (v: unknown[]) => T[], limit: number) {
  const event = `${key}-change`;
  const subscribe = (cb: () => void) => {
    window.addEventListener(event, cb); window.addEventListener("storage", cb);
    return () => { window.removeEventListener(event, cb); window.removeEventListener("storage", cb); };
  };
  const raw = () => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } };
  const read = (text: string): T[] => {
    try { const v: unknown = text ? JSON.parse(text) : []; return Array.isArray(v) ? parse(v).slice(0, limit) : []; } catch { return []; }
  };
  return {
    useList(): T[] {
      const text = useSyncExternalStore(subscribe, raw, () => "");
      return useMemo(() => read(text), [text]);
    },
    /** What is saved right now, for code that runs outside rendering. */
    current: () => read(raw()),
    /** False when the browser's storage is full or blocked. */
    save(all: T[]) {
      try { localStorage.setItem(key, JSON.stringify(all.slice(0, limit))); } catch { return false; }
      window.dispatchEvent(new Event(event));
      return true;
    },
  };
}
