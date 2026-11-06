"use client";

import { useMemo } from "react";
import { listStore } from "./local-list";
import { BUILT_IN_WORKFLOWS, parseWorkflow, type ImportWorkflow } from "@/lib/import-workflows";
import type { SampleEmail } from "@/lib/gmail-import";
import { OWN_PREFIX, STORAGE, TEST_EMAIL_LIMIT, WORKFLOW_LIMITS } from "@/lib/constants";

const workflows = (v: unknown[], keep: (w: ImportWorkflow) => boolean) => v.map(parseWorkflow).filter((w): w is ImportWorkflow => !!w && keep(w));

// Filters from before jobs held their own: built in, plus any made on the old Workflows screen, so jobs using them keep working.
const legacyStore = listStore<ImportWorkflow>(STORAGE.importWorkflows, (v) => workflows(v, (w) => !w.id.startsWith(OWN_PREFIX) && !BUILT_IN_WORKFLOWS.some((b) => b.id === w.id)), WORKFLOW_LIMITS.workflows);
/** Built-in filters first, then older ones kept in this browser. Built-ins only on the server and first paint. */
export function useImportWorkflows(): ImportWorkflow[] {
  const custom = legacyStore.useList();
  return useMemo(() => [...BUILT_IN_WORKFLOWS, ...custom], [custom]);
}

// Each import job's own filter and target fields (ids start with wf-own-). This browser's copy; the server keeps the one that runs.
export { OWN_PREFIX };
const ownStore = listStore<ImportWorkflow>(STORAGE.ownerWorkflows, (v) => workflows(v, (w) => w.id.startsWith(OWN_PREFIX)).map((w) => ({ ...w, status: "Published" as const })), WORKFLOW_LIMITS.workflows);
export const useOwnWorkflows = ownStore.useList;
export const saveOwnWorkflows = ownStore.save;

// Saved test emails: pasted emails kept to test any workflow again. Only the test area uses them, never a goal's
// import (they are not real deposits).
export const isTestEmail = (id: string) => id.startsWith("test-");
export const newTestEmailId = () => `test-${Date.now().toString(36)}`;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const testStore = listStore<SampleEmail>(STORAGE.testEmails, (v) => v.filter((e) => typeof (e as SampleEmail)?.id === "string" && isTestEmail((e as SampleEmail).id))
  .map((x) => { const e = x as SampleEmail; return { id: s(e.id, 40), from: s(e.from, 120), to: s(e.to, 120), subject: s(e.subject, 160), received: s(e.received, 16), body: s(e.body, WORKFLOW_LIMITS.body) }; }), TEST_EMAIL_LIMIT);
export const useTestEmails = testStore.useList;
export const saveTestEmails = testStore.save;
