"use client";

import { useMemo } from "react";
import { useGoalRecords, useLoanTerms, useTxEdits, writeRecords, writeTxEdits, type GoalRecord, type TxPatch } from "./records";
import { members, summarize, type Tx } from "@/lib/demo-data";
import { useImported } from "./imported-records";
import { CAR_CREDIT, CAR_CREDIT_ENTRY, GMAIL_IMPORT_NOTE } from "@/lib/constants";


/** A record saved in the app (approved submission or Owner entry) as a Car Credit transaction. */
const toTx = (r: GoalRecord): Tx => ({
  id: r.id, memberId: members.find((m) => m.name === r.member)?.id ?? r.member, amount: r.amount, date: r.date,
  type: r.kind ?? (r.direction === "out" ? "expense" : "deposit"), method: r.method ?? "-", ref: r.ref,
  status: "confirmed", source: r.proofOf ? "submission" : r.note.startsWith(GMAIL_IMPORT_NOTE) ? "imported" : "manual", notes: r.note, proofOf: r.proofOf,
});

/**
 * Car Credit as it stands now: the sample history, every record saved in this browser and every payment imported on the server, with the Owner's edits.
 * A payment in both is shown once.
 * Every Car Credit figure on a page reads this, so totals, charts, shares and due dates always agree.
 * On the server and first paint it is the sample alone.
 */
export function useCarCredit() {
  const records = useGoalRecords(CAR_CREDIT);
  const imported = useImported(CAR_CREDIT_ENTRY).records;
  const edits = useTxEdits(CAR_CREDIT);
  const terms = useLoanTerms(CAR_CREDIT);
  return useMemo(() => {
    const byId = new Map(edits.map((e) => [e.id, e]));
    const local = new Set(records.map((r) => r.ref));
    return summarize([...records, ...imported.filter((r) => !local.has(r.ref))].map(toTx), (t) => {
      const e = byId.get(t.id);
      if (!e) return t;
      return e.deleted ? null : { ...t, ...e };
    }, terms ?? undefined);
  }, [records, imported, edits, terms]);
}

/** The Owner's edit and delete. A record saved in the app changes in place; a sample one gets an edit kept beside it. */
export function useCarCreditEditor() {
  const records = useGoalRecords(CAR_CREDIT);
  const edits = useTxEdits(CAR_CREDIT);
  const others = (id: string) => edits.filter((e) => e.id !== id);
  const save = (id: string, p: TxPatch) => records.some((r) => r.id === id)
    ? writeRecords(CAR_CREDIT, records.map((r) => r.id !== id ? r : {
      ...r, member: members.find((m) => m.id === p.memberId)?.name ?? p.memberId, amount: p.amount, date: p.date,
      kind: p.type, direction: p.type === "deposit" ? "in" : "out", method: p.method, ref: p.ref, note: p.notes,
    }))
    : writeTxEdits(CAR_CREDIT, [...others(id), { id, ...p }]);
  const remove = (id: string) => records.some((r) => r.id === id)
    ? writeRecords(CAR_CREDIT, records.filter((r) => r.id !== id))
    : writeTxEdits(CAR_CREDIT, [...others(id), { id, deleted: true }]);
  return { save, remove };
}
