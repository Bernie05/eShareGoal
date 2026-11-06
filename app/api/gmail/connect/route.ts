import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/server/core";
import { getViewer } from "@/lib/server/dal";
import { canManageInbox, entryKey, gmailAuthUrl, gmailConfigured, safeNext } from "@/lib/server/gmail";
import { GMAIL_API_PATH, GMAIL_STATE_COOKIE, GMAIL_STATE_SECONDS } from "@/lib/constants";

// Starts the Gmail sign-in: remembers who started it, for which goal, in a short-lived cookie, then goes to Google.
// The random state comes back from Google and must match the cookie, so nobody else can finish this sign-in (CSRF).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const next = safeNext(q.get("next"));
  const entry = entryKey.safeParse(q.get("entry"));
  const viewer = await getViewer();
  if (!entry.success || !gmailConfigured() || viewer?.status !== "active" || !(await canManageInbox(viewer, entry.data))) {
    const back = new URL(next, appUrl()); back.searchParams.set("gmail", "failed");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  const hint = q.get("hint")?.trim().slice(0, 254) || undefined;
  const res = NextResponse.redirect(gmailAuthUrl(state, hint));
  res.cookies.set(GMAIL_STATE_COOKIE, JSON.stringify({ state, entry: entry.data, next, by: viewer.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: GMAIL_API_PATH, maxAge: GMAIL_STATE_SECONDS });
  return res;
}
