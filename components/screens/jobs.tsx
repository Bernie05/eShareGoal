"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Pencil, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PageHeader, StatusBadge } from "@/components/app/primitives";

// A schedule is kept as a few plain choices and turned into a cron expression (minute hour day-of-month month day-of-week).
type Freq = "hourly" | "daily" | "weekly" | "monthly";
type Schedule = { freq: Freq; time: string; weekday: number; day: number };
type Job = { id: string; name: string; what: string; scope: string; schedule: Schedule; on: boolean; next: string; last: string; lastOk: boolean };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const cron = ({ freq, time, weekday, day }: Schedule) => {
  const [h, m] = time.split(":").map(Number);
  return freq === "hourly" ? `${m} * * * *` : freq === "daily" ? `${m} ${h} * * *` : freq === "weekly" ? `${m} ${h} * * ${weekday}` : `${m} ${h} ${day} * *`;
};
const clock = (time: string) => new Date(`2026-01-01T${time}:00`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const human = (s: Schedule) =>
  s.freq === "hourly" ? `Every hour at :${s.time.slice(3)}` : s.freq === "daily" ? `Daily at ${clock(s.time)}` : s.freq === "weekly" ? `${WEEKDAYS[s.weekday]}s at ${clock(s.time)}` : `Day ${s.day} of every month at ${clock(s.time)}`;

const initial: Job[] = [
  { id: "gmail-sync", name: "Gmail import sync", what: "Reads new bank notification emails and adds them to Import review.", scope: "Family / Car Credit, Emergency Fund", schedule: { freq: "daily", time: "08:00", weekday: 1, day: 1 }, on: true, next: "Oct 26, 8:00 AM", last: "Oct 25, 8:00 AM", lastOk: true },
  { id: "due-reminders", name: "Due date reminders", what: "Notifies members 3 days before an installment is due.", scope: "Family / Car Credit", schedule: { freq: "daily", time: "09:00", weekday: 1, day: 1 }, on: true, next: "Oct 26, 9:00 AM", last: "Oct 25, 9:00 AM", lastOk: true },
  { id: "overdue-check", name: "Overdue check", what: "Marks unpaid installments as overdue after the due date.", scope: "Family / Car Credit", schedule: { freq: "daily", time: "00:00", weekday: 1, day: 1 }, on: true, next: "Oct 27, 12:00 AM", last: "Oct 26, 12:00 AM", lastOk: true },
  { id: "monthly-summary", name: "Monthly summary email", what: "Sends each member a summary of the month's deposits and progress.", scope: "All your groups", schedule: { freq: "monthly", time: "07:00", weekday: 1, day: 1 }, on: true, next: "Nov 1, 7:00 AM", last: "Oct 1, 7:00 AM", lastOk: false },
  { id: "import-cleanup", name: "Old import cleanup", what: "Deletes rejected import candidates older than 90 days.", scope: "All your groups", schedule: { freq: "weekly", time: "03:00", weekday: 0, day: 1 }, on: false, next: "Paused", last: "Oct 19, 3:00 AM", lastOk: true },
];
const runs = [
  ["Oct 26, 12:00 AM", "Overdue check", true, "0 installments overdue"],
  ["Oct 25, 9:00 AM", "Due date reminders", true, "1 reminder sent (installment 12/60, due Nov 5)"],
  ["Oct 25, 8:00 AM", "Gmail import sync", true, "2 candidates, 1 duplicate skipped"],
  ["Oct 19, 8:00 AM", "Gmail import sync", false, "1 email could not be parsed"],
  ["Oct 1, 7:00 AM", "Monthly summary email", false, "Email service did not respond (simulated); will retry next run"],
] as const;

function EditSchedule({ job, onSave }: { job: Job; onSave: (s: Schedule) => void }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(job.schedule);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setS(job.schedule); setOpen(true); }}><Pencil aria-hidden /> Edit schedule</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit schedule</DialogTitle><DialogDescription>{job.name} · times are Asia/Manila</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="j-freq">Repeat</Label>
              <NativeSelect id="j-freq" value={s.freq} onChange={(e) => setS({ ...s, freq: e.target.value as Freq })}>
                <option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5"><Label htmlFor="j-time">{s.freq === "hourly" ? "Minute (time)" : "Time"}</Label><Input id="j-time" type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value || s.time })} /></div>
            {s.freq === "weekly" && <div className="space-y-1.5"><Label htmlFor="j-wd">Day of the week</Label><NativeSelect id="j-wd" value={s.weekday} onChange={(e) => setS({ ...s, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</NativeSelect></div>}
            {s.freq === "monthly" && <div className="space-y-1.5"><Label htmlFor="j-day">Day of the month</Label><NativeSelect id="j-day" value={s.day} onChange={(e) => setS({ ...s, day: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</NativeSelect></div>}
          </div>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{human(s)} <span className="ml-1 font-mono text-xs text-muted-foreground">{cron(s)}</span></p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onSave(s); setOpen(false); toast.success("Schedule saved (preview only)"); }}>Save schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Scheduled jobs (cron): Owner only ----------
export function JobsScreen() {
  const [jobs, setJobs] = useState(initial);
  const update = (id: string, patch: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  return (
    <>
      <PageHeader title="Scheduled Jobs" description="Tasks that run on their own for your groups: imports, reminders and summaries. Times are Asia/Manila." />
      <Alert>
        <Info aria-hidden />
        <AlertTitle>Nothing runs in the preview</AlertTitle>
        <AlertDescription>In the real app a scheduler (for example Vercel Cron) calls a protected server route on each schedule. Turning a job off here only changes the preview.</AlertDescription>
      </Alert>

      <div className="space-y-3">
        {jobs.map((j) => (
          <Card key={j.id} size="sm" className={j.on ? undefined : "opacity-75"}>
            <CardContent className="flex flex-wrap items-start gap-4">
              <Switch checked={j.on} onCheckedChange={(on) => { update(j.id, { on, next: on ? "After the next schedule" : "Paused" }); toast(`${j.name} ${on ? "turned on" : "paused"}`); }} aria-label={`${j.name}: ${j.on ? "on" : "off"}`} className="mt-1" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{j.name}</p>
                <p className="text-sm text-muted-foreground">{j.what}</p>
                <p className="text-sm">{human(j.schedule)} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{cron(j.schedule)}</span></p>
                <p className="text-xs text-muted-foreground">Scope: {j.scope}</p>
              </div>
              <dl className="grid min-w-44 gap-1 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Next run</dt><dd>{j.next}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last run</dt><dd>{j.last}</dd></div>
                <div className="flex justify-end"><StatusBadge status={j.lastOk ? "Success" : "Failed"} /></div>
              </dl>
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-col">
                <Button variant="outline" size="sm" disabled={!j.on} onClick={() => toast(`${j.name} started (simulated)`)}><Play aria-hidden /> Run now</Button>
                <EditSchedule job={j} onSave={(schedule) => update(j.id, { schedule })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle><CardDescription>Latest first. Failed runs retry on the next schedule.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {runs.map(([at, job, ok, note]) => (
              <li key={at + job} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-36 text-muted-foreground">{at}</span><span className="flex-1 font-medium">{job}</span>
                <span className="text-muted-foreground">{note}</span><StatusBadge status={ok ? "Success" : "Failed"} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
