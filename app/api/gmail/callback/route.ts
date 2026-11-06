import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/server/core";
import { getViewer } from "@/lib/server/dal";
import { entryKey, finishGmailSignIn, GoogleFail, safeNext } from "@/lib/server/gmail";
import { GMAIL_API_PATH, GMAIL_STATE_COOKIE } from "@/lib/constants";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

type Started = { state?: unknown; entry?: unknown; next?: unknown; by?: unknown };
function started(raw?: string): Started { try { return JSON.parse(raw ?? "{}") as Started; } catch { return {}; } }

// Google sends the person back here. Goes back to the goal with ?gmail=connected, denied, scope or failed.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const s = started(req.cookies.get(GMAIL_STATE_COOKIE)?.value);
  const entry = entryKey.safeParse(s.entry);
  const finish = (result: string) => {
    const back = new URL(safeNext(typeof s.next === "string" ? s.next : null), appUrl());
    back.searchParams.set("gmail", result);
    if (entry.success) back.searchParams.set("gmailEntry", entry.data);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: GMAIL_STATE_COOKIE, path: GMAIL_API_PATH });
    return res;
  };

  const state = q.get("state"), code = q.get("code");
  const viewer = await getViewer();
  if (!entry.success || typeof s.state !== "string" || !state || !same(state, s.state) || viewer?.status !== "active" || viewer.id !== s.by) return finish("failed");
  if (q.get("error") === "access_denied") return finish("denied");
  if (!code) return finish("failed");
  try {
    await finishGmailSignIn(entry.data, code, viewer);
    return finish("connected");
  } catch (e) {
    console.error("[gmail sign-in failed]", e instanceof GoogleFail ? e.kind : "unexpected");
    return finish(e instanceof GoogleFail && e.kind === "scope" ? "scope" : "failed");
  }
}
