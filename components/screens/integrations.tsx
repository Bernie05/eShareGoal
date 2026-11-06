"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, FileSpreadsheet, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/app/primitives";
import { mailboxFor, SERVICES, type Mailbox, type ServiceId, type SetupSettings } from "@/lib/group-settings";
import { gmailDisconnectAction } from "@/app/actions/gmail";
import { cn } from "@/lib/utils";
import { GmailLinkDialog } from "./gmail-link";
import { GmailSetup, useGmailStatus } from "./gmail-setup";

const icons: Record<ServiceId, typeof Mail> = { gmail: Mail, calendar: CalendarDays, sheets: FileSpreadsheet };

interface GroupIntegrationsProps {
  entryKey: string;
  goalName: string;
  members: string[];
  settings: SetupSettings;
  editable: boolean;
  onChange: (s: SetupSettings) => void;
}
// ---------- Integrations of one goal. Owners connect and disconnect; the System Admin only views ----------
// entryKey: "family~car-credit"; it also keeps field ids unique when several goals are open. Only Car Credit starts signed in to Gmail.
// Gmail counts as connected only with a linked inbox: Connect opens the dialog that chooses it, and linking adds it.
export function GroupIntegrations({ entryKey, goalName, members, settings, editable, onChange }: GroupIntegrationsProps) {
  const connected = (id: ServiceId) => settings.integrations.includes(id);
  const toggle = (id: ServiceId, name: string) => {
    const on = !connected(id);
    onChange({ ...settings, integrations: on ? [...settings.integrations, id] : settings.integrations.filter((x) => x !== id) });
    toast(on ? `${name} connected to ${goalName} (simulated)` : `${name} disconnected from ${goalName}`, { description: on ? "A real connection needs Google sign-in (OAuth) and a backend." : "Records already confirmed stay." });
  };
  const mailbox = mailboxFor(entryKey, settings);
  const [linking, setLinking] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [live, setLive] = useGmailStatus({ entryKey, settings, onChange, onLinked: () => setPanelOpen(true) });
  const linked = (m: Mailbox, message: string, real?: boolean) => {
    onChange({ ...settings, integrations: connected("gmail") ? settings.integrations : [...settings.integrations, "gmail"], mailbox: m });
    if (live && real !== undefined) setLive({ ...live, connection: real ? { email: m.address, connectedAt: new Date().toISOString() } : null });
    setPanelOpen(true); toast.success(message);
  };
  /** Keeps the label and read-back days for the next inbox, and stops the sample inbox coming back. */
  const disconnectGmail = async () => {
    setDisconnecting(true);
    const r = live?.connection ? await gmailDisconnectAction(entryKey) : null;
    setDisconnecting(false);
    if (r && !r.ok) return void toast.error(r.error);
    if (live?.connection) setLive({ ...live, connection: null, accounts: live.devLink ? [...new Set([...live.accounts, live.connection.email])] : live.accounts });
    setPanelOpen(false);
    onChange({ ...settings, integrations: settings.integrations.filter((x) => x !== "gmail"), mailbox: mailbox && { ...mailbox, connected: undefined, tested: undefined } });
    toast(`Gmail disconnected from ${goalName}`, { description: "Records already confirmed stay." });
  };
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {SERVICES.map(({ id: sid, name, what }) => { const Icon = icons[sid]; const gmail = sid === "gmail"; const on = connected(sid) && (!gmail || !!mailbox?.connected); return (
          <li key={sid} className="p-3">
            {/* Gmail opens like an accordion: its connection settings sit inside the Gmail row */}
            <Collapsible open={gmail && panelOpen} onOpenChange={setPanelOpen}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{name}{on ? <StatusBadge status="Active" /> : <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{on && gmail ? `${mailbox!.address} · ${mailbox!.method === "oauth" ? "Google sign-in" : "IMAP"} · import jobs in Scheduled jobs` : what}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editable && <Button variant={on ? "ghost" : "outline"} size="sm" className={cn(on && "text-destructive hover:bg-destructive/10 hover:text-destructive")} disabled={gmail && disconnecting} onClick={() => (!gmail ? toggle(sid, name) : on ? disconnectGmail() : setLinking(true))}>{on ? "Disconnect" : "Connect"}<span className="sr-only"> {name} to {goalName}</span></Button>}
                  {on && gmail && (
                    <CollapsibleTrigger render={<Button variant="outline" size="sm" className="border-success/50 text-success hover:bg-success/10 hover:text-success [&[data-panel-open]>svg]:rotate-180" />}>
                      Connection <ChevronDown className="transition-transform" aria-hidden />
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>
              {on && gmail && <CollapsibleContent keepMounted><div className="mt-3 border-t pt-3 sm:pl-12"><GmailSetup entryKey={entryKey} goalName={goalName} settings={settings} mailbox={mailbox!} members={members} live={live} editable={editable} onChange={onChange} onChangeInbox={() => setLinking(true)} /></div></CollapsibleContent>}
            </Collapsible>
          </li>
        ); })}
      </ul>
      <GmailLinkDialog open={linking} onOpenChange={setLinking} entryKey={entryKey} goalName={goalName} mailbox={mailbox} live={live} onLinked={linked} />
    </div>
  );
}
