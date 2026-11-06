import { NextResponse, type NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { fromScheduler } from "@/lib/server/cron";
import { runOverdueCheck } from "@/lib/server/overdue";

// The scheduler calls this.
export async function GET(req: NextRequest) {
  if (!fromScheduler(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDb();
  const report = await runOverdueCheck();
  return NextResponse.json({ goals: report.goals, overdue: report.lines.length, sent: report.lines.filter((l) => l.delivery === "sent").length, test: report.lines.filter((l) => l.delivery === "test").length, notSent: report.lines.filter((l) => l.delivery === "not-sent").length });
}
