"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BellRing, CalendarClock, CheckCheck, Megaphone, Pencil, TriangleAlert, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { comingMonth, useDues } from "./dues";
import { useAccount } from "./view-as";
import { useNudges } from "./nudges";
import { ACCOUNTS, SAMPLE_ROSTER } from "@/lib/accounts";
import { TODAY } from "@/lib/demo-data";
import { useCarCredit } from "./car-credit";
import { GROUP_SETTINGS_COOKIE, jobsFor, parseGroupSettings, settingsFor } from "@/lib/group-settings";
import { fmtDate, peso } from "@/lib/money";
import { cn } from "@/lib/utils";

// Payment reminders from the Car Credit schedule. Every member of the group gets them (the Owner too), from
// REMIND_DAYS before their monthly share is due, while the goal's "Due date reminders" job is on.
// Reminders the Owner sends by hand (Notify) always arrive, whatever the job or the date.
// Which ones were read is kept per account in this browser.
const REMIND_DAYS = 10;
const GROUP = "family";
const href = "/design-preview/loan?goal=car-credit";
const shareDue = comingMonth + "-01";
const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 86_400_000);
const inDays = (iso: string) => { const n = daysTo(iso); return n <= 0 ? "due today" : n === 1 ? "tomorrow" : `in ${n} days`; };
const monthName = new Date(shareDue + "T00:00:00Z").toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });

type Reminder = { id: string; Icon: typeof BellRing; title: string; body: string; tone?: "danger" };

const noop = () => () => {};
/** Whether the Owner left the Car Credit "Due date reminders" job on (Group setup → Jobs); off once they delete it. On while the server renders. */
function useRemindersOn() {
  const raw = useSyncExternalStore(noop, () => document.cookie.split("; ").find((c) => c.startsWith(GROUP_SETTINGS_COOKIE + "="))?.slice(GROUP_SETTINGS_COOKIE.length + 1) ?? "", () => "");
  const s = settingsFor(parseGroupSettings(raw || undefined), `${GROUP}~car-credit`);
  return jobsFor(s, { loan: true }).find((j) => j.id === "due-reminders")?.on ?? false;
}

/** This account's payment reminders, newest concern first. Empty for the System Admin and for people outside the group. */
export function useReminders(): Reminder[] {
  const account = useAccount();
  const dues = useDues();
  const { nextDue, totals, loan } = useCarCredit();
  const on = useRemindersOn();
  const nudges = useNudges();
  const roster = SAMPLE_ROSTER[GROUP];
  const me = account === "admin" ? null : ACCOUNTS[account].name;
  if (!me || !roster.members.includes(me)) return [];
  const mine = dues.find((d) => d.name === me);
  // Sent by hand: payment reminders, only the newest per share and only while that share is still unpaid;
  // goal updates, only the newest.
  const sent = nudges.filter((n, i) => n.to === me && (n.kind === "update"
    ? nudges.findIndex((x) => x.to === me && x.kind === "update") === i
    : nudges.findIndex((x) => x.to === me && !x.kind && x.month === n.month) === i && !(n.month === comingMonth && mine?.status === "Paid")));
  const out: Reminder[] = sent.map((n) => ({
    id: `nudge-${n.id}`, Icon: n.kind === "update" ? Pencil : Megaphone,
    title: n.kind === "update" ? `${n.from} updated the Car Credit details` : `${n.from} reminded you to pay your ${new Date(n.month + "-01T00:00:00Z").toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" })} share`,
    body: `${n.message} · ${new Date(n.sent).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
  }));
  if (!on || daysTo(shareDue) > REMIND_DAYS) return out;
  if (mine && mine.status !== "Paid") out.push({
    id: `share-${comingMonth}`, Icon: CalendarClock,
    title: `Your ${monthName} share is due ${fmtDate(shareDue)}`,
    body: `Family / Car Credit · ${mine.paid ? `${peso(mine.share - mine.paid)} left of ${peso(mine.share)}` : peso(mine.share)} · ${inDays(shareDue)}`,
  });
  if (mine && mine.behind > 0) out.push({
    id: `behind-${comingMonth}`, Icon: TriangleAlert, tone: "danger",
    title: `You are behind ${peso(mine.behind)}`,
    body: `Family / Car Credit · unpaid shares from ${mine.missed.join(", ")}`,
  });
  if (totals.installmentsDone < loan.term) out.push({
    id: `installment-${nextDue}`, Icon: BellRing,
    title: `Installment ${totals.installmentsDone + 1}/${loan.term} is due ${fmtDate(nextDue)}`,
    body: `Family / Car Credit · ${peso(loan.monthly)} to the lender · ${inDays(nextDue)}`,
  });
  const unpaid = dues.filter((d) => d.status !== "Paid");
  if (me === roster.owner && unpaid.length) out.push({
    id: `unpaid-${comingMonth}-${unpaid.map((d) => d.id).join("-")}`, Icon: Users,
    title: `${unpaid.length} ${unpaid.length === 1 ? "member has" : "members have"} not paid the ${monthName} share`,
    body: `Family / Car Credit · ${unpaid.map((d) => `${d.name} ${peso(d.share - d.paid)}`).join(", ")}`,
  });
  return out;
}

// Read reminder ids, per account, in localStorage.
const EVENT = "esg-reminders-change";
const KEY = (account: string) => `esg-reminders-read:${account}`;
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; };
function useReadIds() {
  const account = useAccount();
  const raw = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(KEY(account)) ?? "[]"; } catch { return "[]"; } }, () => "[]");
  let ids: string[] = [];
  try { const v: unknown = JSON.parse(raw); if (Array.isArray(v)) ids = v.filter((x): x is string => typeof x === "string"); } catch { /* keep none */ }
  const markRead = (more: string[]) => {
    // Only the newest ids are kept, so the list cannot grow forever.
    try { localStorage.setItem(KEY(account), JSON.stringify([...new Set([...ids, ...more])].slice(-50))); } catch { return; }
    window.dispatchEvent(new Event(EVENT));
  };
  return { ids, markRead };
}

/** Header bell for every group member: the payment reminders, with how many are new. */
export function RemindersBell() {
  const list = useReminders();
  const { ids, markRead } = useReadIds();
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  const unread = list.filter((r) => !ids.includes(r.id));
  const label = unread.length ? `Payment reminders, ${unread.length} new` : "Payment reminders";
  return (
    <>
      <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label} onClick={() => setOpen(true)}>
        <BellRing aria-hidden />
        {unread.length > 0 && <span className="num absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warning px-1 text-[10px] leading-4 text-white ring-2 ring-background" aria-hidden>{unread.length}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment reminders</DialogTitle>
            <DialogDescription>From the Car Credit schedule and its Owner. Every member of Family gets these.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y">{list.map(({ id, Icon, title, body, tone }) => {
            const u = !ids.includes(id);
            return (
              <li key={id}>
                <Link href={href} onClick={() => { markRead([id]); setOpen(false); }} className="flex items-start gap-3 rounded-lg px-2 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone === "danger" ? "bg-destructive/10 text-destructive" : u ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className={cn("block text-sm", u && "font-semibold")}>{title}</span><span className="block text-xs text-muted-foreground">{body}</span></span>
                  {u && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                </Link>
              </li>
            );
          })}</ul>
          <DialogFooter>
            <Button variant="ghost" disabled={!unread.length} onClick={() => markRead(list.map((r) => r.id))}><CheckCheck aria-hidden /> Mark all as read</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** On the Car Credit page: the signed-in member's own share, when it is not paid yet. */
export function MyShareAlert() {
  const account = useAccount();
  const on = useRemindersOn();
  const me = account === "admin" ? null : ACCOUNTS[account].name;
  const mine = useDues().find((d) => d.name === me);
  if (!on || !mine || (mine.status === "Paid" && !mine.behind)) return null;
  const left = mine.share - mine.paid;
  return (
    <Alert className={cn(mine.behind ? "border-destructive/40" : "border-warning/40")}>
      <CalendarClock aria-hidden />
      <AlertTitle>{mine.status === "Paid" ? `Your ${monthName} share is paid` : `Your ${monthName} share of ${peso(left)} is due ${fmtDate(shareDue)} (${inDays(shareDue)})`}</AlertTitle>
      <AlertDescription>
        {mine.behind > 0 && <span className="font-medium text-destructive">You are also behind {peso(mine.behind)} from {mine.missed.join(", ")}. </span>}
        {mine.awaiting > 0 ? `${peso(mine.awaiting)} you submitted is waiting for the Owner's approval.` : me === SAMPLE_ROSTER[GROUP].owner ? "Add it as a transaction once you have paid." : "Pay it, then submit the transaction with the receipt so the Owner can approve it."}
      </AlertDescription>
    </Alert>
  );
}
