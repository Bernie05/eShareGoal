"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { sendNudges, useNudges } from "./nudges";
import { useMe, useSendEmail } from "./view-as";
import type { Due } from "./dues";
import { fmtDate, peso } from "@/lib/money";
import { LOCALE, MAX_MESSAGE } from "@/lib/constants";

const monthLong = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString(LOCALE, { month: "long", timeZone: "UTC" });

interface NotifyMembersProps {
  dues: Due[];
  month: string;
  only?: string;
}
/**
 * Owner only: notify members now, instead of waiting for the automatic reminder.
 * `dues`: everyone's share for `month`; `only`: open it for one member (the row's Notify button).
 */
export function NotifyMembers({ dues: everyone, month, only }: NotifyMembersProps) {
  const me = useMe() ?? "Owner";
  const dues = everyone.filter((d) => d.name !== me); // the Owner does not remind themself
  const send = useSendEmail();
  const unpaid = dues.filter((d) => d.status !== "Paid");
  const defaults = only ? [only] : unpaid.map((d) => d.id);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string[]>(defaults);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(false);
  const one = only ? dues.find((d) => d.id === only) : undefined;
  const placeholder = `Hi! Your ${monthLong(month)} share for Car Credit is due ${fmtDate(month + "-01")}. Please pay and submit the receipt. Thank you!`;

  const reset = (o: boolean) => { setOpen(o); if (o) { setTo(defaults); setMessage(""); setEmail(false); } };
  const submit = () => {
    const people = dues.filter((d) => to.includes(d.id));
    if (!people.length) return;
    const text = message.trim() || placeholder;
    if (!sendNudges(people.map((d) => ({ to: d.name, from: me, month, amount: d.share - d.paid, message: text })))) {
      toast.error("Could not send", { description: "This browser did not let the preview save it. Try again." });
      return;
    }
    if (email) for (const d of people) send(d.name, `Reminder: your ${monthLong(month)} share is due`);
    toast.success(`Reminder sent to ${people.map((d) => d.name).join(", ")}`, { description: "It shows in their reminders bell." });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant={only ? "ghost" : "outline"} size="sm" disabled={!only && !unpaid.length} />}>
        <Send aria-hidden /> {one ? <span>Notify<span className="sr-only"> {one.name}</span></span> : "Notify unpaid"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{one ? `Notify ${one.name}` : "Notify members"}</DialogTitle>
          <DialogDescription>Sends a payment reminder now. It shows in their reminders bell; the automatic reminders still go out as scheduled.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Send to</legend>
            {dues.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={to.includes(d.id)} onChange={(e) => setTo((t) => (e.target.checked ? [...t, d.id] : t.filter((x) => x !== d.id)))} />
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground">{d.status === "Paid" ? "paid" : `${peso(d.share - d.paid)} still due`}{d.behind > 0 && ` · behind ${peso(d.behind)}`}</span>
              </label>
            ))}
            {!to.length && <p className="text-xs text-destructive">Choose at least one member.</p>}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="nudge-msg">Message (optional)</Label>
            <Textarea id="nudge-msg" rows={3} maxLength={MAX_MESSAGE} placeholder={placeholder} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="text-right text-xs text-muted-foreground">{message.length}/{MAX_MESSAGE}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="nudge-email">Also send by email</Label>
            <Switch id="nudge-email" checked={email} onCheckedChange={setEmail} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!to.length}><Send aria-hidden /> Send reminder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LastRemindedProps {
  name: string;
  month: string;
}
/** "Reminded Oct 25" under a member's status: the last reminder sent by hand for this share. */
export function LastReminded({ name, month }: LastRemindedProps) {
  const last = useNudges().find((n) => n.to === name && n.month === month);
  if (!last) return null;
  return <span className="mt-0.5 block text-xs text-muted-foreground">Reminded {new Date(last.sent).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} by {last.from}</span>;
}
