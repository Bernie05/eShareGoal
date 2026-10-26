import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardEmpty, DashboardScreen } from "@/components/screens/dashboard";
import { GoalInfoScreen } from "@/components/screens/goal-info";
import { ActivityHistory } from "@/components/screens/activity";
import { IntegrationsScreen } from "@/components/screens/integrations";
import { JobsScreen } from "@/components/screens/jobs";
import { NotificationsScreen } from "@/components/screens/notifications";
import { UsersScreen } from "@/components/screens/users";
import { ReportsScreen } from "@/components/screens/reports";
import { recordsAbout, users } from "@/lib/users-data";
import { visibleActivity } from "@/lib/activity-data";
import { EmptyState, ErrorState, LoadingState, StateGate } from "@/components/app/primitives";
import {
  AddTransactionScreen, GenericScreen, GoalsEmpty, GoalsScreen, GroupScreen, GroupsEmpty, GroupsScreen, ImportScreen, LoanScreen, NewGoalScreen,
  SettingsScreen, SharedMoneyScreen, TransactionsEmpty, TransactionsScreen,
} from "@/components/screens/screens";
import { stateOf } from "@/lib/demo-data";
import { canOpen, screens } from "@/lib/screens";
import { getViewAs } from "@/lib/view-as-server";

const base = "/design-preview";

export default async function PreviewScreen({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; goal?: string; group?: string }> }) {
  const { screen } = await params;
  const query = await searchParams;
  const state = stateOf(query.state);
  const viewAs = await getViewAs();
  if (!screens.some((s) => s.slug === screen)) notFound();
  if (!canOpen(screen, viewAs)) redirect(`${base}/dashboard`); // role-gated screens (see `only` in lib/screens.ts)
  const retry = `${base}/${screen}`;
  const goalEmpty = (title: string, body: string): ReactNode => <EmptyState title={title} body={body} cta={{ label: "Add the first record", href: retry }} />;

  let body: ReactNode;
  switch (screen) {
    case "dashboard": body = <StateGate state={state} retryHref={retry} empty={<DashboardEmpty />}><DashboardScreen viewAs={viewAs} /></StateGate>; break;
    case "activity": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No activity yet" body="Records, imports and changes in your groups will show up here." />}><ActivityHistory rows={visibleActivity(viewAs)} viewAs={viewAs} /></StateGate>; break;
    case "goals": body = <StateGate state={state} retryHref={retry} empty={<GoalsEmpty />}><GoalsScreen viewAs={viewAs} /></StateGate>; break;
    case "goal-info": body = <StateGate state={state} retryHref={`${retry}?goal=${query.goal}`} empty={null}><GoalInfoScreen id={query.goal ?? "grocery-budget"} /></StateGate>; break;
    case "groups":
      body = <StateGate state={state} retryHref={retry} empty={<GroupsEmpty />}><GroupsScreen viewAs={viewAs} /></StateGate>; break;
    case "group": body = <StateGate state={state} retryHref={retry} empty={goalEmpty("No goals in Family yet", "Add a goal to start tracking progress together.")}><GroupScreen id={query.group} viewAs={viewAs} /></StateGate>; break;
    case "shared-money": body = <StateGate state={state} retryHref={retry} empty={goalEmpty("No contributions yet", "Record the first deposit to start the progress bar.")}><SharedMoneyScreen /></StateGate>; break;
    case "loan": body = state === "empty" ? <LoanScreen noSchedule /> : <StateGate state={state} retryHref={retry} empty={null}><LoanScreen /></StateGate>; break;
    case "generic": body = <StateGate state={state} retryHref={retry} empty={goalEmpty("No progress records yet", "Log the first weigh-in or workout.")}><GenericScreen /></StateGate>; break;
    case "new-goal": body = <StateGate state={state} retryHref={retry} empty={null}><NewGoalScreen viewAs={viewAs} /></StateGate>; break;
    case "transactions": body = <StateGate state={state} retryHref={retry} empty={<TransactionsEmpty />}><TransactionsScreen /></StateGate>; break;
    case "add-transaction": body = state === "loading" ? <LoadingState /> : <AddTransactionScreen showErrors={state === "error"} />; break;
    case "import": body = state === "error" ? <><ErrorState title="The last sync failed" body="Gmail did not respond (simulated). No records were changed." retryHref={retry} /><ImportScreen /></> : <StateGate state={state} retryHref={retry} empty={<ImportScreen empty />}><ImportScreen /></StateGate>; break;
    case "integrations": body = <StateGate state={state} retryHref={retry} empty={null}><IntegrationsScreen /></StateGate>; break;
    case "jobs": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No scheduled jobs" body="Jobs appear when you connect Gmail or add a loan goal with due dates." />}><JobsScreen /></StateGate>; break;
    case "notifications": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No notifications" body="You are all caught up." />}><NotificationsScreen /></StateGate>; break;
    case "users": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No users yet" body="People appear here when they sign up or are invited." />}><UsersScreen rows={users.map((u) => ({ ...u, records: recordsAbout(u.name) }))} /></StateGate>; break;
    case "reports": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No reports" body="Reports from users and problems the system finds will show up here." />}><ReportsScreen /></StateGate>; break;
    case "settings": body = <StateGate state={state} retryHref={retry} empty={null}><SettingsScreen /></StateGate>; break;
  }
  return body;
}
