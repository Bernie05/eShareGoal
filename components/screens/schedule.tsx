"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { Freq, Schedule } from "@/lib/group-settings";

// A schedule is kept as a few plain choices and turned into a cron expression (minute hour day-of-month month day-of-week).
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const cron = ({ freq, time, weekday, day }: Schedule) => {
  const [h, m] = time.split(":").map(Number);
  return freq === "hourly" ? `${m} * * * *` : freq === "daily" ? `${m} ${h} * * *` : freq === "weekly" ? `${m} ${h} * * ${weekday}` : `${m} ${h} ${day} * *`;
};
const clock = (time: string) => new Date(`2026-01-01T${time}:00`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
export const human = (s: Schedule) =>
  s.freq === "hourly" ? `Every hour at :${s.time.slice(3)}` : s.freq === "daily" ? `Daily at ${clock(s.time)}` : s.freq === "weekly" ? `${WEEKDAYS[s.weekday]}s at ${clock(s.time)}` : `Day ${s.day} of every month at ${clock(s.time)}`;

export function ScheduleFields({ s, setS, id }: { s: Schedule; setS: (s: Schedule) => void; id: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor={`${id}-freq`}>Repeat</Label>
          <NativeSelect id={`${id}-freq`} value={s.freq} onChange={(e) => setS({ ...s, freq: e.target.value as Freq })}>
            <option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-time`}>{s.freq === "hourly" ? "Minute (time)" : "Time"}</Label><Input id={`${id}-time`} type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value || s.time })} /></div>
        {s.freq === "weekly" && <div className="space-y-1.5"><Label htmlFor={`${id}-wd`}>Day of the week</Label><NativeSelect id={`${id}-wd`} value={s.weekday} onChange={(e) => setS({ ...s, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</NativeSelect></div>}
        {s.freq === "monthly" && <div className="space-y-1.5"><Label htmlFor={`${id}-day`}>Day of the month</Label><NativeSelect id={`${id}-day`} value={s.day} onChange={(e) => setS({ ...s, day: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</NativeSelect></div>}
      </div>
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{human(s)} <span className="ml-1 font-mono text-xs text-muted-foreground">{cron(s)}</span></p>
    </>
  );
}


/** The next `n` times a schedule runs after `from` (local time; the app runs on Asia/Manila). */
export function nextRuns(s: Schedule, from: Date, n = 3): Date[] {
  const [h, m] = s.time.split(":").map(Number);
  const out: Date[] = [];
  const t = new Date(from); t.setSeconds(0, 0);
  // Step a minute at a time would be slow; step by the schedule's own unit instead.
  if (s.freq === "hourly") {
    t.setMinutes(m); if (t <= from) t.setHours(t.getHours() + 1);
    while (out.length < n) { out.push(new Date(t)); t.setHours(t.getHours() + 1); }
    return out;
  }
  t.setHours(h, m);
  const ok = (d: Date) => (s.freq === "daily" || (s.freq === "weekly" ? d.getDay() === s.weekday : d.getDate() === s.day)) && d > from;
  for (let i = 0; out.length < n && i < 400; i++) { if (ok(t)) out.push(new Date(t)); t.setDate(t.getDate() + 1); }
  return out;
}
export const when = (d: Date) => d.toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
