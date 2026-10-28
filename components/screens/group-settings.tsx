"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CalendarClock, Plug, Settings, Target } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionTitle } from "@/components/app/primitives";
import { writeCookie } from "@/components/app/view-as";
import { GROUP_SETTINGS_COOKIE, jobsFor, notifyFor, SERVICES, settingsFor, settingsKey, type SetupSettings, type Target as SetupTarget } from "@/lib/group-settings";
import type { ViewAs } from "@/lib/view-as";
import { SAMPLE_IMPORT_JOBS } from "@/lib/import-workflows";
import { GroupIntegrations } from "./integrations";
import { GroupJobs } from "./jobs";
import { GroupNotifications } from "./notifications";

/** loan: installments (due-date jobs apply). money: takes deposits (Gmail import). created: made in the preview. members: who takes part. */
export type SetupGroup = { id: string; name: string; goals: { id: string; name: string; loan: boolean; money: boolean; created: boolean; members: string[] }[] };
type Entry = { key: string; name: string; target: SetupTarget; what: string; goal: SetupGroup["goals"][number] };

// One row per goal (sub group): setup belongs to the goals, not to the parent group.
const entriesOf = (g: SetupGroup): Entry[] => g.goals.map((x) => ({ key: settingsKey(g.id, x.id), name: x.name, target: { loan: x.loan }, what: x.loan ? "Loan goal" : x.money ? "Money goal" : "Goal", goal: x }));
const summary = (key: string, s: SetupSettings, t: SetupTarget) => ({
  connected: SERVICES.filter((x) => s.integrations.includes(x.id)),
  jobsOn: jobsFor(s, t).filter((j) => j.on).length + (s.integrations.includes("gmail") ? (s.imports ?? SAMPLE_IMPORT_JOBS[key] ?? []).filter((j) => j.on).length : 0),
  alertsOn: notifyFor(s, t).filter((n) => n.on).length,
});

/** Every goal's setup, saved to the cookie the server reads. */
function useSetupSettings(initial: Record<string, SetupSettings>) {
  const router = useRouter();
  const [all, setAll] = useState(initial);
  const change = (key: string, s: SetupSettings) => {
    const next = { ...all, [key]: s };
    if (!writeCookie(GROUP_SETTINGS_COOKIE, next)) return;
    setAll(next); router.refresh();
  };
  return [all, change] as const;
}

const SETUP_TABS = [["integrations", "Integrations", Plug], ["jobs", "Scheduled jobs", CalendarClock], ["notifications", "Notifications", Bell]] as const;

/** One goal's integrations (Gmail import among them), scheduled jobs and notifications. */
function SetupTabs({ e, s, editable, tab, onChange }: { e: Entry; s: SetupSettings; editable: boolean; tab?: string; onChange: (s: SetupSettings) => void }) {
  return (
    <Tabs defaultValue={SETUP_TABS.some(([v]) => v === tab) ? tab : SETUP_TABS[0][0]} className="gap-3">
      <TabsList className="h-auto w-full flex-wrap justify-start">{SETUP_TABS.map(([v, l, TabIcon]) => <TabsTrigger key={v} value={v}><TabIcon aria-hidden /> {l}</TabsTrigger>)}</TabsList>
      <TabsContent value="integrations"><GroupIntegrations entryKey={e.key} goalName={e.name} settings={s} editable={editable} onChange={onChange} /></TabsContent>
      <TabsContent value="jobs"><GroupJobs entryKey={e.key} target={e.target} goal={e.goal} goalName={e.name} settings={s} editable={editable} onChange={onChange} /></TabsContent>
      <TabsContent value="notifications"><GroupNotifications entryKey={e.key} target={e.target} settings={s} editable={editable} onChange={onChange} /></TabsContent>
    </Tabs>
  );
}

// ---------- One goal's setup, on the goal's own page (Goal settings tab) ----------
// The same settings as the goal's row in the parent group's Goal setup; a change in either place shows in both.
export function GoalSetup({ group, goalId, role, all: initial }: { group: SetupGroup; goalId: string; role: ViewAs; all: Record<string, SetupSettings> }) {
  const [all, change] = useSetupSettings(initial);
  const e = entriesOf(group).find((x) => x.goal.id === goalId);
  if (!e) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="size-4" aria-hidden /> Integrations, jobs and notifications</CardTitle>
        <CardDescription>Also in {group.name} → Goal setup. Preview only: nothing connects or runs.</CardDescription>
      </CardHeader>
      <CardContent><SetupTabs e={e} s={settingsFor(all, e.key)} editable={role === "owner"} onChange={(v) => change(e.key, v)} /></CardContent>
    </Card>
  );
}

// ---------- Goal setup on the parent group's page: one row per goal (sub group) ----------
// Open a row to add or change its integrations, scheduled jobs and notifications. Owners edit; the System Admin views read-only.
// open/tab: which goal's row and tab to open first (links use /group?group=<id>&setup=<goal id>&tab=jobs#setup).
export function GroupSetup({ group, role, all: initial, open, tab }: { group: SetupGroup; role: ViewAs; all: Record<string, SetupSettings>; open?: string; tab?: string }) {
  const [all, change] = useSetupSettings(initial);
  const editable = role === "owner";
  const entries = entriesOf(group);
  const openKey = open ? entries.find((e) => e.key === settingsKey(group.id, open))?.key : undefined;
  return (
    <section id="setup" aria-labelledby="setup-title" className="scroll-mt-20 space-y-3">
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{editable ? "Open a row to add or change its setup" : "Read-only: only the group's Owners can change it"}</span>}>
        <span id="setup-title" className="flex items-center gap-2"><Settings className="size-4" aria-hidden /> Goal setup</span>
      </SectionTitle>
      <p className="text-xs text-muted-foreground">Preview only: nothing connects or runs. In the real app Google sign-in (OAuth) connects services and a scheduler (for example Vercel Cron) runs the jobs.</p>
      {entries.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add a goal first. Integrations, scheduled jobs and notifications are set per goal.</p>}
      <Accordion multiple defaultValue={openKey ? [openKey] : []} className="gap-2">
        {entries.map((e) => {
          const s = settingsFor(all, e.key);
          const { connected, jobsOn, alertsOn } = summary(e.key, s, e.target);
          return (
            <AccordionItem key={e.key} value={e.key} className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
              <AccordionTrigger className="min-w-0 items-center gap-3 px-4 py-3 hover:no-underline">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Target className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-medium">{e.name} <span className="text-xs font-normal text-muted-foreground">· {e.what}</span></span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    {connected.length ? connected.map((x) => <Badge key={x.id} variant="secondary">{x.name}</Badge>) : <Badge variant="outline" className="text-muted-foreground">No integrations</Badge>}
                    <span>{jobsOn} {jobsOn === 1 ? "job" : "jobs"} on · {alertsOn} {alertsOn === 1 ? "notification" : "notifications"} on</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-1 pb-4 [&_a]:no-underline [&_p:not(:last-child)]:mb-0">
                <SetupTabs e={e} s={s} editable={editable} tab={openKey === e.key ? tab : undefined} onChange={(v) => change(e.key, v)} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}

// ---------- What a Member sees: each goal's setup at a glance, without the controls ----------
export function GroupSetupCard({ group, all }: { group: SetupGroup; all: Record<string, SetupSettings> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="size-4" aria-hidden /> Goal setup</CardTitle><CardDescription>Set by the group&apos;s Owners.</CardDescription></CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {entriesOf(group).map((e) => {
            const { connected, jobsOn } = summary(e.key, settingsFor(all, e.key), e.target);
            return (
              <li key={e.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>{e.name}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{connected.map((x) => <Badge key={x.id} variant="secondary">{x.name}</Badge>)}{jobsOn} {jobsOn === 1 ? "job" : "jobs"}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
