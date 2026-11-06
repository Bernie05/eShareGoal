"use server";

import { run } from "@/lib/server/action";
import { parse } from "@/lib/server/core";
import { entryKey } from "@/lib/server/gmail";
import { goalJobs, saveGoalImports } from "@/lib/server/import-setup";
import { decideReview, goalImported, sendToReview, setReviewMember } from "@/lib/server/import-review";

// Saving a goal's import jobs where the scheduler can read them. Permissions are checked in lib/server/import-setup.ts.
export const goalJobsAction = async (entry: string) => run((v) => goalJobs(v, parse(entryKey, entry)));
export const saveGoalImportsAction = async (entry: string, jobs: unknown, workflows: unknown) => run((v) => saveGoalImports(v, { entry: parse(entryKey, entry), jobs, workflows }));
/** Run now: sends new payments to the goal's Owners. */
export const sendToReviewAction = async (input: unknown) => run((v) => sendToReview(v, input));
/** An Owner confirms, rejects or reopens a queued payment. */
export const decideReviewAction = async (input: unknown) => run((v) => decideReview(v, input));
/** An Owner picks who a queued payment belongs to. */
export const setReviewMemberAction = async (input: unknown) => run(async (v) => { await setReviewMember(v, input); });
/** What the goal already holds from Gmail, so the screens can show it. withKeys: a run also gets what it must skip. */
export const goalImportedAction = async (entry: string, withKeys = false) => run((v) => goalImported(v, parse(entryKey, entry), withKeys === true));
