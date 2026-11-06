"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CheckCheck, Inbox, Settings, UserPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/primitives";
import { lockedFor, NOTIFY, notifyFor, type NotifyKey, type SetupSettings, type Target } from "@/lib/group-settings";
import { cn } from "@/lib/utils";
import { BASE_PATH, CAR_CREDIT, CAR_CREDIT_ENTRY } from "@/lib/constants";
import { IMPORT_REVIEW_HREF, useReviewQueue } from "@/components/app/import-review";

// FICTIONAL notifications for group Owners: things that need an Owner to act, newest first.
// entry: the goal it comes from ("family~car-credit"); none for group-wide news such as invitations.
const initial = [
  { id: "n2", groupId: "family", entry: CAR_CREDIT_ENTRY, kind: "due" as NotifyKey, Icon: CalendarClock, title: "Installment 12/60 is due in 10 days", body: "Family / Car Credit · ₱24,000.00 due Nov 5, 2026.", when: "Today, 9:00 AM", href: `${BASE_PATH}/loan`, unread: true },
  { id: "n4", groupId: "family", entry: "", kind: "members" as NotifyKey, Icon: UserPlus, title: "Rina Cruz has not accepted the invitation", body: "Family · invited Oct 21.", when: "Oct 24", href: `${BASE_PATH}/group?group=family`, unread: false },
];
type Item = (typeof initial)[number];

/** Payments waiting in the goal's Import review. Real, and it stays unread until an Owner decides on them. */
function useImportNotice(): Item[] {
  const { pending } = useReviewQueue();
  const n = pending.filter((r) => r.goalId === CAR_CREDIT).length;
  if (!n) return [];
  return [{ id: "imports-waiting", groupId: "family", entry: CAR_CREDIT_ENTRY, kind: "imports", Icon: Inbox, title: `${n} ${n === 1 ? "payment needs" : "payments need"} your approval`, body: "Family / Car Credit · found in Gmail. Confirm them before they count.", when: "Now", href: IMPORT_REVIEW_HREF, unread: true }];
}

interface ItemListProps {
  items: Item[];
  onRead: (id: string) => void;
}
function ItemList({ items, onRead }: ItemListProps) {
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

interface NotificationsScreenProps {
  groups: { id: string; name: string }[];
}
// ---------- Notifications inbox (the bell): every group this user owns, each linking to its settings ----------
export function NotificationsScreen({ groups }: NotificationsScreenProps) {
  const [items, setItems] = useState(() => initial.filter((n) => groups.some((g) => g.id === n.groupId)));
  const notice = useImportNotice().filter((n) => groups.some((g) => g.id === n.groupId));
  const unread = items.filter((n) => n.unread).length + notice.length;
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
            <Link href={`${BASE_PATH}/group?group=${g.id}#setup`} className={buttonVariants({ variant: "ghost", size: "sm" })}><Settings aria-hidden /> Notification settings</Link>
          </div>
          <ItemList items={[...notice, ...items].filter((n) => n.groupId === g.id)} onRead={read} />
        </CardContent></Card>
      ))}
    </>
  );
}

interface GroupNotificationsProps {
  entryKey: string;
  target: Target;
  settings: SetupSettings;
  editable: boolean;
  onChange: (s: SetupSettings) => void;
}
// ---------- Notifications tab of one goal: what it notifies Owners about, and its latest ones ----------
export function GroupNotifications({ entryKey, target, settings, editable, onChange }: GroupNotificationsProps) {
  const [items, setItems] = useState(() => initial.filter((n) => n.entry === entryKey));
  const notice = useImportNotice().filter((n) => n.entry === entryKey);
  const options = notifyFor(settings, target);
  const shown = [...notice, ...items].filter((n) => options.find((o) => o.key === n.kind)?.on ?? true);
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
