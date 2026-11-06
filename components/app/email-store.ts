"use client";

import { useMemo, useSyncExternalStore } from "react";
import { BUILT_IN_EMAILS, isEmailTemplate, type EmailTemplate } from "@/lib/email-templates";
import { STORAGE, STORAGE_EVENTS } from "@/lib/constants";

// The System Admin's own email templates, in this browser's localStorage (images are too big for a cookie).
// Owners pick from the same list in Group setup → Jobs, so in the preview both see one shared list.
const KEY = STORAGE.emailTemplates;
const EVENT = STORAGE_EVENTS.emailTemplates;
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
const raw = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };

/** Built-in templates first, then the Admin's own. Built-ins only on the server and first paint. */
export function useEmailTemplates(): EmailTemplate[] {
  const text = useSyncExternalStore(subscribe, raw, () => "");
  return useMemo(() => {
    let custom: EmailTemplate[] = [];
    try { const v: unknown = text ? JSON.parse(text) : []; if (Array.isArray(v)) custom = v.filter(isEmailTemplate).map((t) => ({ ...t, builtIn: false })); } catch { /* keep none */ }
    return [...BUILT_IN_EMAILS, ...custom];
  }, [text]);
}

/** Saves the Admin's templates (built-ins are never stored). False when the browser's storage is full or blocked. */
export function saveEmailTemplates(all: EmailTemplate[]) {
  try { localStorage.setItem(KEY, JSON.stringify(all.filter((t) => !t.builtIn))); } catch { return false; }
  window.dispatchEvent(new Event(EVENT));
  return true;
}
