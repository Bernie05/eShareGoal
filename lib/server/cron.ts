import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Whether the scheduler sent this. Vercel Cron adds "Authorization: Bearer <CRON_SECRET>" by itself; no secret set, nobody gets in. */
export function fromScheduler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const sent = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  return !!secret && sent.length === want.length && timingSafeEqual(sent, want);
}
