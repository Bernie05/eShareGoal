"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, CalendarClock, CheckCheck, Inbox, Settings, TriangleAlert, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/primitives";
import { lockedFor, NOTIFY, notifyFor, type NotifyKey, type SetupSettings, type Target } from "@/lib/group-settings";
import { cn } from "@/lib/utils";

const base = "/design-preview";
// FICTIONAL notifications for group Owners: things that need an Owner to act, newest first.
// entry: the goal it comes from ("family~car-credit"); none for group-wide news such as invitations.
const initial = [
  { id: "n1", groupId: "family", entry: "family~car-credit", kind: "imports" as NotifyKey, Icon: Inbox, title: "2 imported transactions need review", body: "Family / Car Credit · one matches two members.", when: "Today, 8:01 AM", href: `${base}/import`, unread: true },
  { id: "n2", groupId: "family", entry: "family~car-credit", kind: "due" as NotifyKey, Icon: CalendarClock, title: "Installment 12/60 is due in 10 days", body: "Family / Car Credit · ₱24,000.00 due Nov 5, 2026.", when: "Today, 9:00 AM", href: `${base}/loan`, unread: true },
  { id: "n3", groupId: "family", entry: "family~car-credit", kind: "members" as NotifyKey, Icon: TriangleAlert, title: "Monthly summary email failed", body: "Family · the Oct 1 run did not send. It retries on Nov 1.", when: "Yesterday", href: `${base}/group?group=family&setup=car-credit&tab=jobs#setup`, unread: true },
  { id: "n4", groupId: "family", entry: "", kind: "members" as NotifyKey, Icon: UserPlus, title: "Rina Cruz has not accepted the invitation", body: "Family · invited Oct 21.", when: "Oct 24", href: `${base}/group?group=family`, unread: false },
  { id: "n5", groupId: "family", entry: "family~grocery-budget", kind: "milestones" as NotifyKey, Icon: BellRing, title: "Grocery Budget reached 75%", body: "Family · ₱9,000 of ₱12,000 this month.", when: "Oct 22", href: `${base}/shared-money?goal=grocery-budget`, unread: false },
];
type Item = (typeof initial)[number];

function ItemList({ items, onRead }: { items: Item[]; onRead: (id: string) => void }) {
  if (!items.length) return <p className="py-4 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  return (
    <ul className="divide-y">
      {items.map(({ id, Icon, title, body, when, href, unread: u }) => (
        <li key={id}>
          <Link href={href} onClick={() => onRead(id)} className="flex items-start gap-3 rounded-lg px-2 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", u ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className={cn("block text-sm", u && "font-semibold")}>{title}</span><span className="block text-xs text-muted-foreground">{body}</span></span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{when}{u && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** How many unread notifications the groups have (for the bell). */
export const unreadIn = (groupIds: string[]) => initial.filter((n) => n.unread && groupIds.includes(n.groupId)).length;

// ---------- Notifications inbox (the bell): every group this user owns, each linking to its settings ----------
export function NotificationsScreen({ groups }: { groups: { id: string; name: string }[] }) {
  const [items, setItems] = useState(() => initial.filter((n) => groups.some((g) => g.id === n.groupId)));
  const unread = items.filter((n) => n.unread).length;
  const read = (id: string) => setItems((xs) => xs.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread. Things in the groups you own that need you. What each group sends is set in its Group setup.` : "You are all caught up."}
        actions={<Button variant="outline" disabled={!unread} onClick={() => setItems((xs) => xs.map((n) => ({ ...n, unread: false })))}><CheckCheck aria-hidden /> Mark all as read</Button>}
      />
      {groups.map((g) => (
        <Card key={g.id}><CardContent className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{g.name}</p>
            <Link href={`${base}/group?group=${g.id}#setup`} className={buttonVariants({ variant: "ghost", size: "sm" })}><Settings aria-hidden /> Notification settings</Link>
          </div>
          <ItemList items={items.filter((n) => n.groupId === g.id)} onRead={read} />
        </CardContent></Card>
      ))}
    </>
  );
}

// ---------- Notifications tab of one goal: what it notifies Owners about, and its latest ones ----------
export function GroupNotifications({ entryKey, target, settings, editable, onChange }: { entryKey: string; target: Target; settings: SetupSettings; editable: boolean; onChange: (s: SetupSettings) => void }) {
  const [items, setItems] = useState(() => initial.filter((n) => n.entry === entryKey));
  const options = notifyFor(settings, target);
  const shown = items.filter((n) => options.find((o) => o.key === n.kind)?.on ?? true);
  const locked = lockedFor(NOTIFY, settings, target);
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {options.map(({ key, label, hint, on }) => (
          <li key={key} className="flex items-center justify-between gap-4 p-3">
            <div><Label htmlFor={`${entryKey}-n-${key}`}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
            <Switch id={`${entryKey}-n-${key}`} checked={on} disabled={!editable} onCheckedChange={(v) => onChange({ ...settings, notify: { ...settings.notify, [key]: v } })} />
          </li>
        ))}
      </ul>
      {locked.length > 0 && <p className="text-xs text-muted-foreground">Not available here: {locked.map((x) => `${x.label} (${x.why})`).join(" · ")}.</p>}
      {shown.length > 0 && <div className="rounded-lg border p-3"><p className="text-sm font-medium">Latest notifications</p><ItemList items={shown} onRead={(id) => setItems((xs) => xs.map((n) => (n.id === id ? { ...n, unread: false } : n)))} /></div>}
    </div>
  );
}
