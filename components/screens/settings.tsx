"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { CardEditor } from "@/components/app/card-editor";
import { settingsFor, settingsGroups, settingsHref, type SettingsTab } from "@/lib/screens";
import { cn } from "@/lib/utils";
import { useAccount, useEmailMode, useSendEmail, useSetEmailMode, useViewAs } from "@/components/app/view-as";
import { ACCOUNTS } from "@/lib/accounts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ADMIN_EMAIL, TIME_ZONE } from "@/lib/constants";

interface RowProps {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}
export function Row({ id, label, hint, children }: RowProps) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-6">
      <div><Label htmlFor={id}>{label}</Label>{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}
interface ToggleProps {
  id: string;
  label: string;
  hint?: string;
  on?: boolean;
}
export const Toggle = ({ id, label, hint, on = false }: ToggleProps) => (
  <div className="flex items-center justify-between gap-4">
    <div><Label htmlFor={id}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
    <Switch id={id} defaultChecked={on} />
  </div>
);
interface SectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}
export function Section({ title, description, children }: SectionProps) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
export const save = () => toast.success("Settings saved (preview only)");

interface SettingLineProps {
  title: string;
  hint: string;
  danger?: boolean;
  children: React.ReactNode;
}
const SettingLine = ({ title, hint, danger = false, children }: SettingLineProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className={cn("text-sm font-medium", danger && "text-destructive")}>{title}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
    {children}
  </div>
);

function ProfileSection() {
  const admin = useViewAs() === "admin";
  return (
    <Section title="Profile" description="Your name and sign-in details.">
      <Row id="name" label="Display name"><Input id="name" defaultValue={admin ? "System Admin" : "Bernz"} /></Row>
      <Row id="email" label="Email" hint="Used to sign in and for invitations."><Input id="email" type="email" defaultValue={admin ? "admin@example.com" : "bernz@example.com"} /></Row>
      <Button onClick={save}>Save changes</Button>
    </Section>
  );
}

function CardsSection() {
  const account = useAccount();
  return account === "admin" ? null : <Section title="Payment cards" description="The cards or accounts you send money from. Add every one you use, so your transfers are credited to you."><CardEditor user={ACCOUNTS[account].name} /></Section>;
}

function RegionSection() {
  return (
    <Section title="Region and format" description="How dates and money appear for you.">
      <Row id="lang" label="Language"><NativeSelect id="lang" defaultValue="en"><option value="en">English</option></NativeSelect></Row>
      <Row id="tz" label="Timezone"><NativeSelect id="tz" defaultValue={TIME_ZONE}><option>Asia/Manila</option><option>UTC</option></NativeSelect></Row>
      <Row id="cur" label="Default currency" hint="v1 supports PHP only."><NativeSelect id="cur" defaultValue="PHP" disabled><option value="PHP">Philippine peso (₱)</option></NativeSelect></Row>
      <Row id="df" label="Date format"><NativeSelect id="df" defaultValue="mdy"><option value="mdy">Oct 25, 2026</option><option value="dmy">25 Oct 2026</option><option value="iso">2026-10-25</option></NativeSelect></Row>
      <Button onClick={save}>Save changes</Button>
    </Section>
  );
}

const noSubscribe = () => () => {};
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false); // the saved theme is only known in the browser
  return (
    <Section title="Appearance" description="Changes apply right away on this device.">
      <Row id="theme" label="Theme"><NativeSelect id="theme" value={ready ? theme : "system"} disabled={!ready} onChange={(e) => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Same as this device</option></NativeSelect></Row>
    </Section>
  );
}

function PrivacySection() {
  return (
    <>
      <Section title="Your data" description="What you can take with you.">
        <SettingLine title="Export my data" hint="CSV of all records you can see."><Button variant="outline" onClick={() => toast("Preview only")}>Export</Button></SettingLine>
      </Section>
      <Section title="Delete account" description="Removes your account for good.">
        <SettingLine danger title="Delete my account" hint="Asks for confirmation. Cannot be undone."><Button variant="destructive" onClick={() => toast("Preview only")}>Delete account</Button></SettingLine>
      </Section>
    </>
  );
}

const SECTION: Record<SettingsTab, () => React.ReactNode> = { profile: ProfileSection, cards: CardsSection, region: RegionSection, appearance: AppearanceSection, privacy: PrivacySection, email: EmailDelivery };

/** Personal settings, grouped by what people come to do. Integrations, scheduled jobs and notifications are set per group (Group settings). */
export function SettingsSections() {
  const viewAs = useViewAs();
  const router = useRouter();
  const groups = settingsGroups(viewAs);
  const allowed = settingsFor(viewAs);
  const asked = useSearchParams().get("tab");
  const tab: SettingsTab = allowed.find((s) => s.tab === asked)?.tab ?? allowed[0].tab;
  const Current = SECTION[tab];
  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
      <nav aria-label="Settings sections" className="hidden space-y-4 md:block">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
            <ul className="space-y-0.5">{g.items.map((s) => (
              <li key={s.tab}><Link href={settingsHref(s.tab)} aria-current={s.tab === tab ? "page" : undefined} className={cn("block rounded-lg px-2.5 py-1.5 text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring", s.tab === tab && "bg-accent font-medium")}>{s.label}</Link></li>
            ))}</ul>
          </div>
        ))}
      </nav>
      <div className="space-y-1.5 md:hidden">
        <Label htmlFor="settings-section">Section</Label>
        <NativeSelect id="settings-section" value={tab} onChange={(e) => router.push(settingsHref(e.target.value as SettingsTab))}>
          {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((s) => <option key={s.tab} value={s.tab}>{s.label}</option>)}</optgroup>)}
        </NativeSelect>
      </div>
      <div className="min-w-0 space-y-4"><Current /></div>
    </div>
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
        <Button variant="outline" onClick={() => send(ADMIN_EMAIL, "Test email")}>Send a test email</Button>
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
