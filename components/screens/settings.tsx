"use client";

import { useEmailMode, useSendEmail, useSetEmailMode, useViewAs } from "@/components/app/view-as";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-6">
      <div><Label htmlFor={id}>{label}</Label>{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}
export const Toggle = ({ id, label, hint, on = false }: { id: string; label: string; hint?: string; on?: boolean }) => (
  <div className="flex items-center justify-between gap-4">
    <div><Label htmlFor={id}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
    <Switch id={id} defaultChecked={on} />
  </div>
);
export function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
export const save = () => toast.success("Settings saved (preview only)");

export function SettingsTabs() {
  const viewAs = useViewAs();
  const owner = viewAs === "owner";
  // Groups and goals and Notifications are Owner-only; Gmail and import settings live on the Integrations page.
  const tabs = [["general", "General"], ["account", "Account"], ...(owner ? [["groups", "Groups and goals"], ["notifications", "Notifications"]] : []), ...(viewAs === "admin" ? [["email", "Email delivery"]] : []), ["privacy", "Privacy and security"]];
  return (
    <Tabs defaultValue="general" className="gap-4">
      <TabsList className="h-auto w-full flex-wrap justify-start">
        {tabs.map(([v, l]) => (
          <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="general">
        <Section title="General" description="Language, region and appearance.">
          <Row id="lang" label="Language"><NativeSelect id="lang" defaultValue="en"><option value="en">English</option></NativeSelect></Row>
          <Row id="tz" label="Timezone"><NativeSelect id="tz" defaultValue="Asia/Manila"><option>Asia/Manila</option><option>UTC</option></NativeSelect></Row>
          <Row id="cur" label="Default currency" hint="v1 supports PHP only."><NativeSelect id="cur" defaultValue="PHP" disabled><option value="PHP">Philippine peso (₱)</option></NativeSelect></Row>
          <Row id="df" label="Date format"><NativeSelect id="df" defaultValue="mdy"><option value="mdy">Oct 25, 2026</option><option value="dmy">25 Oct 2026</option><option value="iso">2026-10-25</option></NativeSelect></Row>
          <Row id="theme" label="Theme"><NativeSelect id="theme" defaultValue="light"><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></Row>
          <Button onClick={save}>Save changes</Button>
        </Section>
      </TabsContent>

      <TabsContent value="account">
        <Section title="Account" description="Your profile and sign-in details.">
          <Row id="name" label="Display name"><Input id="name" defaultValue={viewAs === "admin" ? "System Admin" : "Bernz"} /></Row>
          <Row id="email" label="Email" hint="Used to sign in and for invitations."><Input id="email" type="email" defaultValue={viewAs === "admin" ? "admin@example.com" : "bernz@example.com"} /></Row>
          <Button onClick={save}>Save changes</Button>
        </Section>
      </TabsContent>

      {owner && <TabsContent value="groups">
        <Section title="Groups and goals" description="Defaults for new groups and goals.">
          <Row id="dg" label="Default group"><NativeSelect id="dg" defaultValue="family"><option value="family">Family</option><option value="friends">Friends</option></NativeSelect></Row>
          <Toggle id="rem" label="Remind 3 days before an installment is due" on />
          <Button onClick={save}>Save changes</Button>
        </Section>
      </TabsContent>}


      {owner && <TabsContent value="notifications">
        <Section title="Notifications" description="Choose what reaches you.">
          <Toggle id="n1" label="Payment due reminders" on />
          <Toggle id="n2" label="New import candidates" on />
          <Toggle id="n3" label="Goal milestones and member updates" on />
          <Toggle id="n4" label="Email notifications" hint="Sent to your account email." />
          <Button onClick={save}>Save changes</Button>
        </Section>
      </TabsContent>}

      {viewAs === "admin" && <TabsContent value="email"><EmailDelivery /></TabsContent>}

      <TabsContent value="privacy">
        <Section title="Privacy and security" description="Your data and connected accounts.">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Export my data</p><p className="text-xs text-muted-foreground">CSV of all records you can see.</p></div><Button variant="outline" onClick={() => toast("Preview only")}>Export</Button></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-destructive">Delete my account</p><p className="text-xs text-muted-foreground">Asks for confirmation. Cannot be undone.</p></div><Button variant="destructive" onClick={() => toast("Preview only")}>Delete account</Button></div>
        </Section>
      </TabsContent>
    </Tabs>
  );
}

// ---------- Email delivery: System Admin only ----------
const templates = [
  ["Sign-up received", "Sent right after someone registers: their ID is being reviewed."],
  ["Account approved", "Sent when you approve a sign-up. They can sign in now."],
  ["Account rejected", "Sent when you reject a sign-up, with your reason and how to try again."],
  ["Access revoked", "Sent when you revoke a user's access, with your reason."],
  ["Ownership transferred", "Sent to the old and the new Owner of a group."],
];
const outbox = [
  ["Oct 25, 7:52 AM", "nico@example.com", "Sign-up received"],
  ["Oct 24, 6:10 PM", "liza@example.com", "Sign-up received"],
  ["Oct 23, 9:30 AM", "paolo@example.com", "Sign-up received"],
  ["Oct 11, 10:02 AM", "mark@example.com", "Account rejected"],
];

function EmailDelivery() {
  const mode = useEmailMode();
  const setMode = useSetEmailMode();
  const send = useSendEmail();
  const prod = mode === "prod";
  return (
    <div className="space-y-4">
      <Section title="Email delivery" description="Emails to users about sign-ups, reviews and access.">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="email-prod">Send real emails (production)</Label>
            <p className="text-xs text-muted-foreground">{prod ? "On: emails go out through the email provider." : "Off (development): nothing is sent. You only see a notice that an email would have gone out."}</p>
          </div>
          <Switch id="email-prod" checked={prod} onCheckedChange={(v) => setMode(v ? "prod" : "dev")} />
        </div>
        <p className={`rounded-lg px-3 py-2 text-xs ${prod ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
          {prod ? "Production needs an email provider (for example Resend or SMTP) set up on the server with a verified sender domain. This preview never sends real email." : "Development mode is safe for testing: no user receives anything."}
        </p>
        <Button variant="outline" onClick={() => send("admin@example.com", "Test email")}>Send a test email</Button>
      </Section>
      <Section title="Automatic emails" description="What users receive and when.">
        <ul className="divide-y text-sm">{templates.map(([t, d]) => <li key={t} className="py-2"><p className="font-medium">{t}</p><p className="text-xs text-muted-foreground">{d}</p></li>)}</ul>
      </Section>
      <Section title="Recent emails" description={prod ? "Sent through the email provider." : "Development: these were not actually sent."}>
        <ul className="divide-y text-sm">{outbox.map(([at, to, t]) => <li key={at} className="flex flex-wrap justify-between gap-2 py-2"><span className="text-muted-foreground">{at}</span><span>{to}</span><span className="font-medium">{t}</span></li>)}</ul>
      </Section>
    </div>
  );
}
