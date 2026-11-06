"use client";

import { listStore } from "./local-list";
import { STORAGE } from "@/lib/constants";

// What Gmail import jobs produce, kept in this browser (no backend in the preview):
// - review items: payments a job sent to Import review, waiting for an Owner to confirm (then they become records);
// - runs: each job's recent runs, for its "Last run" line.
export type ReviewStatus = "Pending Review" | "Confirmed" | "Rejected";
export type ReviewItem = {
  id: string; goalId: string; goal: string; job: string; // which goal and which import job found it
  amount: number; date: string; ref: string; payer: string; member: string; // member "" = no payer rule matched yet
  msg: string; found: string; status: ReviewStatus; recordId?: string;
};
export type JobRun = { jobId: string; entryKey: string; at: string; read: number; added: number; duplicates: number; unmapped: number };

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const STATUSES: ReviewStatus[] = ["Pending Review", "Confirmed", "Rejected"];
const reviewStore = listStore<ReviewItem>(STORAGE.importReview, (v) => v.flatMap((x) => {
  const r = x as ReviewItem;
  if (typeof r?.id !== "string" || !Number.isInteger(r.amount) || r.amount <= 0 || !STATUSES.includes(r.status)) return [];
  return [{ id: s(r.id, 40), goalId: s(r.goalId, 80), goal: s(r.goal, 80), job: s(r.job, 60), amount: r.amount, date: s(r.date, 10), ref: s(r.ref, 80), payer: s(r.payer, 80),
    member: s(r.member, 40), msg: s(r.msg, 60), found: s(r.found, 30), status: r.status, ...(typeof r.recordId === "string" && { recordId: r.recordId.slice(0, 60) }) }];
}), 200);
export const useReviewItems = reviewStore.useList;
export const saveReviewItems = reviewStore.save;
export const newReviewId = () => `rv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const runStore = listStore<JobRun>(STORAGE.importRuns, (v) => v.flatMap((x) => {
  const r = x as JobRun;
  return typeof r?.jobId === "string" && typeof r.at === "string" ? [{ jobId: s(r.jobId, 60), entryKey: s(r.entryKey, 160), at: s(r.at, 30), read: n(r.read), added: n(r.added), duplicates: n(r.duplicates), unmapped: n(r.unmapped) }] : [];
}), 100);
export const useJobRuns = runStore.useList;
/** Newest first; the oldest drop off past the limit. */
export const addJobRun = (all: JobRun[], run: JobRun) => runStore.save([run, ...all]);
