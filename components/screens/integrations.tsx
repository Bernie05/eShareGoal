"use client";

import { toast } from "sonner";
import { CalendarDays, ChevronDown, FileSpreadsheet, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/app/primitives";
import { mailboxFor, SERVICES, type ServiceId, type SetupSettings } from "@/lib/group-settings";
import { GmailSetup } from "./gmail-setup";

const icons: Record<ServiceId, typeof Mail> = { gmail: Mail, calendar: CalendarDays, sheets: FileSpreadsheet };

// ---------- Integrations of one goal. Owners connect and disconnect; the System Admin only views ----------
// entryKey: "family~car-credit"; it also keeps field ids unique when several goals are open. Only Car Credit starts signed in to Gmail.
export function GroupIntegrations({ entryKey, goalName, settings, editable, onChange }: { entryKey: string; goalName: string; settings: SetupSettings; editable: boolean; onChange: (s: SetupSettings) => void }) {
  const connected = (id: ServiceId) => settings.integrations.includes(id);
  const toggle = (id: ServiceId, name: string) => {
    const on = !connected(id);
    onChange({ ...settings, integrations: on ? [...settings.integrations, id] : settings.integrations.filter((x) => x !== id) });
    toast(on ? `${name} connected to ${goalName} (simulated)` : `${name} disconnected from ${goalName}`, { description: on ? "A real connection needs Google sign-in (OAuth) and a backend." : "Records already confirmed stay." });
  };
  const mailbox = mailboxFor(entryKey, settings);
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {SERVICES.map(({ id: sid, name, what }) => { const Icon = icons[sid]; const on = connected(sid); return (
          <li key={sid} className="p-3">
            {/* Gmail opens like an accordion: its connection settings sit inside the Gmail row */}
            <Collapsible>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{name}{on ? <StatusBadge status="Active" /> : <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{on && sid === "gmail" ? (mailbox?.connected ? `${mailbox.address} · ${mailbox.method === "oauth" ? "Google sign-in" : "IMAP"} · import jobs in Scheduled jobs` : "Added, not signed in yet: open Connection to finish") : what}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editable && <Button variant={on ? "ghost" : "outline"} size="sm" onClick={() => toggle(sid, name)}>{on ? "Disconnect" : "Connect"}<span className="sr-only"> {name} to {goalName}</span></Button>}
                  {on && sid === "gmail" && (
                    <CollapsibleTrigger render={<Button variant="outline" size="sm" className="[&[data-panel-open]>svg]:rotate-180" />}>
                      Connection <ChevronDown className="transition-transform" aria-hidden />
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
              {on && sid === "gmail" && <CollapsibleContent><div className="mt-3 border-t pt-3 sm:pl-12"><GmailSetup entryKey={entryKey} goalName={goalName} settings={settings} editable={editable} onChange={onChange} /></div></CollapsibleContent>}
            </Collapsible>
          </li>
        ); })}
      </ul>
    </div>
  );
}
