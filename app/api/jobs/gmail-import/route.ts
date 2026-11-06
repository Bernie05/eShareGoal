import { NextResponse, type NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { fromScheduler } from "@/lib/server/cron";
import { runGmailImports } from "@/lib/server/imports";

// The scheduler calls this before the overdue check, so a new payment clears someone before they get a notice.
// ?dry=1 reports what it would add and writes nothing. The response carries only counts, never payment details.
export async function GET(req: NextRequest) {
  if (!fromScheduler(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDb();
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  return NextResponse.json({ dry, jobs: await runGmailImports({ dry }) });
}
