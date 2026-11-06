"use server";

import { z } from "zod";
import { run } from "@/lib/server/action";
import { parse, UserError } from "@/lib/server/core";
import { disconnectGmail, entryKey, gmailStatus, linkGmailInDev, readInboxForJob, testGmail } from "@/lib/server/gmail";
import { parseWorkflow } from "@/lib/import-workflows";

// The Gmail connection of one goal. Signing in itself is a redirect: app/api/gmail/connect and /callback.
export const gmailStatusAction = async (entry: string) => run((v) => gmailStatus(parse(entryKey, entry), v));
export const gmailTestAction = async (entry: string, label: string, days: number) => run((v) => testGmail(v, parse(entryKey, entry), parse(z.string().max(40), label), parse(z.number().int().min(1).max(365), days)));
export const gmailDevLinkAction = async (entry: string, email: string) => run((v) => linkGmailInDev(parse(entryKey, entry), parse(z.email().max(254), email), v));
/** Reads the real inbox for one import job. workflow comes from the browser (an Owner's own lives there), so it is checked. */
export const gmailReadJobAction = async (entry: string, workflow: unknown, label: string, days: number) => run((v) => {
  const w = parseWorkflow(workflow);
  if (!w) throw new UserError("This workflow could not be read.");
  return readInboxForJob({ entry: parse(entryKey, entry), workflow: w, label: parse(z.string().max(40), label), days: parse(z.number().int().min(1).max(365), days), viewerId: v.id });
});
export const gmailDisconnectAction = async (entry: string) => run((v) => disconnectGmail(parse(entryKey, entry), v));
