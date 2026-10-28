"use client";

import { useMemo } from "react";
import { listStore } from "./local-list";
import { BUILT_IN_WORKFLOWS, LIMITS, parseWorkflow, type ImportWorkflow } from "@/lib/import-workflows";
import type { SampleEmail } from "@/lib/gmail-import";

const workflows = (v: unknown[], keep: (w: ImportWorkflow) => boolean) => v.map(parseWorkflow).filter((w): w is ImportWorkflow => !!w && keep(w));

// The System Admin's common workflows (built-ins are never stored).
const adminStore = listStore<ImportWorkflow>("esg-import-workflows", (v) => workflows(v, (w) => !BUILT_IN_WORKFLOWS.some((b) => b.id === w.id)), LIMITS.workflows);
/** Built-in workflows first, then the Admin's own. Built-ins only on the server and first paint. */
export function useImportWorkflows(): ImportWorkflow[] {
  const custom = adminStore.useList();
  return useMemo(() => [...BUILT_IN_WORKFLOWS, ...custom], [custom]);
}
export const saveImportWorkflows = (all: ImportWorkflow[]) => adminStore.save(all.filter((w) => !w.builtIn));

// The Owner's own workflows (sidebar → Workflows), usable in the import jobs of any goal they own. One account per
// browser in the preview; ids start with wf-own- so they never clash with the Admin's. Always usable (no drafts).
export const OWN_PREFIX = "wf-own-";
const ownStore = listStore<ImportWorkflow>("esg-owner-workflows", (v) => workflows(v, (w) => w.id.startsWith(OWN_PREFIX)).map((w) => ({ ...w, status: "Published" as const })), LIMITS.workflows);
export const useOwnWorkflows = ownStore.useList;
export const saveOwnWorkflows = ownStore.save;

// Saved test emails: pasted emails kept to test any workflow again. Only the test area uses them, never a goal's
// import (they are not real deposits).
export const TEST_EMAIL_LIMIT = 20;
export const isTestEmail = (id: string) => id.startsWith("test-");
export const newTestEmailId = () => `test-${Date.now().toString(36)}`;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const testStore = listStore<SampleEmail>("esg-test-emails", (v) => v.filter((e) => typeof (e as SampleEmail)?.id === "string" && isTestEmail((e as SampleEmail).id))
  .map((x) => { const e = x as SampleEmail; return { id: s(e.id, 40), from: s(e.from, 120), to: s(e.to, 120), subject: s(e.subject, 160), received: s(e.received, 16), body: s(e.body, LIMITS.body) }; }), TEST_EMAIL_LIMIT);
export const useTestEmails = testStore.useList;
export const saveTestEmails = testStore.save;
