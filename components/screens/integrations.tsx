"use client";

import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, Info, Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader, StatusBadge } from "@/components/app/primitives";
import { Row, save, Section } from "./settings";

const base = "/design-preview";
const notReal = () => toast("Preview only: a real connection needs Google sign-in (OAuth) and a backend.");

// Google services an Owner can connect. Only Gmail exists in v1 (simulated); the others show where they will plug in.
const services = [
  { id: "gmail", Icon: Mail, name: "Gmail", what: "Finds bank notification emails and proposes transactions for you to confirm.", connected: true },
  { id: "calendar", Icon: CalendarDays, name: "Google Calendar", what: "Adds installment due dates and goal deadlines to your calendar.", connected: false },
  { id: "sheets", Icon: FileSpreadsheet, name: "Google Sheets", what: "Copies a goal's records to a sheet you own, updated daily.", connected: false },
];

// ---------- Integrations: Owner only (the route sends other roles to the Dashboard) ----------
export function IntegrationsScreen() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect Google services to your groups. Only group Owners see this page."
        actions={<Link href={`${base}/import`} className={buttonVariants({ variant: "outline" })}>Import review <Badge variant="secondary" className="bg-warning-soft text-warning">2</Badge></Link>}
      />
      <Alert>
        <Info aria-hidden />
        <AlertTitle>Gmail import is a simulation in v1</AlertTitle>
        <AlertDescription>No real Gmail account is connected and no bank data is read. Sample emails are fictional. Real import needs Google OAuth, the Gmail API and a server-side worker; access to Gmail does not give access to a bank account.</AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        {services.map(({ id, Icon, name, what, connected }) => (
          <Card key={id}>
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                {connected ? <StatusBadge status="Active" /> : <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>}
              </div>
              <div className="flex-1"><p className="font-medium">{name}</p><p className="text-sm text-muted-foreground">{what}</p></div>
              {connected ? (
                <div className="space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground">demo.inbox@example.com · last sync Oct 25, 08:00 · next Oct 26, 08:00</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast("Simulated sync finished: 2 new candidates")}>Sync now</Button>
                    <Button variant="ghost" size="sm" onClick={notReal}>Disconnect</Button>
                  </div>
                </div>
              ) : <Button variant="outline" size="sm" className="self-start" onClick={notReal}>Connect {name}</Button>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Section title="Gmail import rules" description="How an email becomes a proposed transaction.">
        <Row id="prov" label="Bank or provider"><NativeSelect id="prov" defaultValue="bpi"><option value="bpi">BPI (sample format)</option><option value="gcash">GCash (sample format)</option></NativeSelect></Row>
        <Row id="q" label="Gmail search query" hint="Sender and subject filters."><Input id="q" defaultValue="from:notify@example-bank.test subject:(Transfer Received)" /></Row>
        <Row id="suf" label="Account suffix" hint="Last four digits to match."><Input id="suf" defaultValue="4821" inputMode="numeric" maxLength={4} /></Row>
        <Row id="alias" label="Account holder aliases"><Input id="alias" defaultValue="B. Santos, Bernz S." /></Row>
        <Row id="dir" label="Expected direction"><NativeSelect id="dir" defaultValue="in"><option value="in">Incoming only</option><option value="out">Outgoing only</option><option value="both">Both</option></NativeSelect></Row>
        <Row id="goal" label="Destination goal"><NativeSelect id="goal" defaultValue="car"><option value="car">Family / Car Credit</option><option value="ef">Family / Emergency Fund</option></NativeSelect></Row>
        <Row id="freq" label="Sync schedule" hint="Runs as a scheduled job."><Link href={`${base}/jobs`} className="text-sm text-primary underline underline-offset-3">Daily at 8:00 AM · change in Scheduled Jobs</Link></Row>
        <Button onClick={save}>Save rules</Button>
      </Section>

      <Section title="Import history" description="Latest simulated runs.">
        <ul className="divide-y text-sm">
          {[["Oct 25, 08:00", "Success", "2 candidates, 1 duplicate skipped"], ["Oct 24, 08:00", "Success", "0 new"], ["Oct 19, 08:00", "Failed", "1 email could not be parsed"]].map(([t, s, n]) => (
            <li key={t} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{t}</span><span className="text-muted-foreground">{n}</span><StatusBadge status={s === "Success" ? "Success" : "Failed"} /></li>
          ))}
        </ul>
      </Section>

      <Section title="Revoke access" description="Disconnect Google and delete stored tokens.">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Revoke Gmail access</p><p className="text-xs text-muted-foreground">Stops imports. Records already confirmed stay.</p></div><Button variant="outline" onClick={notReal}>Revoke access</Button></div>
      </Section>
    </>
  );
}
