"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, CalendarClock, CheckCheck, Inbox, TriangleAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

const base = "/design-preview";
// FICTIONAL notifications for the group Owner: things that need the Owner to act, newest first.
const initial = [
  { id: "n1", Icon: Inbox, title: "2 imported transactions need review", body: "Family / Car Credit · one matches two members.", when: "Today, 8:01 AM", href: `${base}/import`, unread: true },
  { id: "n2", Icon: CalendarClock, title: "Installment 12/60 is due in 10 days", body: "Family / Car Credit · ₱24,000.00 due Nov 5, 2026.", when: "Today, 9:00 AM", href: `${base}/loan`, unread: true },
  { id: "n3", Icon: TriangleAlert, title: "Monthly summary email failed", body: "The Oct 1 run did not send. It retries on Nov 1.", when: "Yesterday", href: `${base}/jobs`, unread: true },
  { id: "n4", Icon: UserPlus, title: "Rina Cruz has not accepted the invitation", body: "Family · invited Oct 21.", when: "Oct 24", href: `${base}/group?group=family`, unread: false },
  { id: "n5", Icon: BellRing, title: "Grocery Budget reached 75%", body: "Family · ₱9,000 of ₱12,000 this month.", when: "Oct 22", href: `${base}/shared-money`, unread: false },
];

// ---------- Notifications: Owner only ----------
export function NotificationsScreen() {
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => n.unread).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread. Things in your groups that need you as Owner.` : "You are all caught up."}
        actions={<Button variant="outline" disabled={!unread} onClick={() => setItems((xs) => xs.map((n) => ({ ...n, unread: false })))}><CheckCheck aria-hidden /> Mark all as read</Button>}
      />
      <Card><CardContent>
        <ul className="divide-y">
          {items.map(({ id, Icon, title, body, when, href, unread: u }) => (
            <li key={id}>
              <Link href={href} onClick={() => setItems((xs) => xs.map((n) => (n.id === id ? { ...n, unread: false } : n)))} className="flex items-start gap-3 rounded-lg px-2 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", u ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className={cn("block text-sm", u && "font-semibold")}>{title}</span><span className="block text-xs text-muted-foreground">{body}</span></span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{when}{u && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent></Card>
    </>
  );
}
