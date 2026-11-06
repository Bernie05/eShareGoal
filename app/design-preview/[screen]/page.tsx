import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardEmpty, DashboardScreen } from "@/components/screens/dashboard";
import { GoalInfoScreen } from "@/components/screens/goal-info";
import { ActivityHistory } from "@/components/screens/activity";
import { NotificationsScreen } from "@/components/screens/notifications";
import { UsersScreen } from "@/components/screens/users";
import { ReportsScreen } from "@/components/screens/reports";
import { CreatedGroupScreen } from "@/components/screens/created-group";
import { TemplatesScreen } from "@/components/screens/templates";
import { EmailTemplatesScreen } from "@/components/screens/email-templates";
import { CreatedGoalScreen } from "@/components/screens/goal-page";
import { ViewAsProvider } from "@/components/app/view-as";
import { recordsAbout, users } from "@/lib/users-data";
import { visibleActivity } from "@/lib/activity-data";
import { EmptyState, ErrorState, LoadingState, StateGate } from "@/components/app/primitives";
import {
  AddTransactionScreen, GoalsEmpty, GoalsScreen, GroupScreen, GroupsEmpty, GroupsScreen, ImportScreen, LoanScreen, NewGoalScreen,
  SettingsScreen, TransactionsEmpty, TransactionsScreen,
} from "@/components/screens/screens";
import { groups, stateOf } from "@/lib/demo-data";
import { ACCOUNTS, creatorOf, membersOf, roleIn, sampleGroupsFor, SAMPLE_ROSTER } from "@/lib/accounts";
import { emailOfMember, goalMembers, inGoalOf } from "@/lib/memberships";
import { canOpen, screens } from "@/lib/screens";
import { getAccount, getBuiltIns, getCreatedGoals, getCreatedGroups, getGoalJoins, getGoalRequests, getGroupSettings, getTemplates, getViewAs } from "@/lib/view-as-server";
import { templateOf } from "@/lib/created-goals";
import { BASE_PATH, CAR_CREDIT } from "@/lib/constants";
import { listUsers } from "@/lib/server/admin";
import { requireViewer } from "@/lib/server/dal";

const groupOfGoal = (goalId: string) => groups.find((g) => g.goals.some((x) => x.id === goalId))?.id;

interface PreviewScreenProps {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string; goal?: string; group?: string; request?: string; setup?: string; tab?: string }>;
}
export default async function PreviewScreen({ params, searchParams }: PreviewScreenProps) {
  const viewer = await requireViewer(); // signs people in, unless the development toggle is on (lib/server/dev.ts)
  const { screen } = await params;
  const query = await searchParams;
  const state = stateOf(query.state);
  const account = await getAccount();
  const viewAs = await getViewAs(); // site-wide: admin, owner (owns a group) or member; pages below use the role in each group
  const created = await getCreatedGroups(); // every created group; each screen shows the ones this account is in
  const joins = await getGoalJoins(); // goal join requests, and the approved ones (lib/memberships.ts)
  // People an Owner can invite: active user accounts only (no System Admin; not pending, rejected or revoked).
  const directory = users.filter((u) => u.site === "User" && u.status === "Active").map((u) => ({ name: u.name, email: u.email }));
  const role = (groupId: string) => roleIn(account, groupId, created);
  if (!screens.some((s) => s.slug === screen)) notFound();
  if (!canOpen(screen, viewAs)) redirect(`${BASE_PATH}/dashboard`); // role-gated screens (see `only` in lib/screens.ts)
  const retry = `${BASE_PATH}/${screen}`;
  const goalEmpty = (title: string, body: string): ReactNode => <EmptyState title={title} body={body} cta={{ label: "Add the first record", href: retry }} />;
  // A sample goal page, with the role this account has in the goal's group. Not in the group: back to the Dashboard;
  // a Member who has not joined the goal: the limited info page.
  // node: the page, or a function that builds it for the role (so a Member's page can leave group data out).
  const inGoal = (goalId: string, node: ReactNode | ((r: NonNullable<ReturnType<typeof role>>) => ReactNode)) => {
    const groupId = groupOfGoal(goalId);
    const r = groupId ? role(groupId) : null;
    if (!r) redirect(`${BASE_PATH}/dashboard`);
    const joined = sampleGroupsFor(account, joins).flatMap((g) => g.goals).find((x) => x.id === goalId)?.joined;
    if (r === "member" && !joined) redirect(`${BASE_PATH}/goal-info?goal=${goalId}`);
    return <ViewAsProvider value={r}>{typeof node === "function" ? node(r) : node}</ViewAsProvider>;
  };
  // Where this account can create goals: groups it owns.
  const owned = [...Object.keys(SAMPLE_ROSTER).map((id) => groups.find((g) => g.id === id)!), ...created]
    .filter((g) => role(g.id) === "owner").map((g) => ({ id: g.id, name: g.name, members: membersOf(g.id, created) }));

  let body: ReactNode;
  switch (screen) {
    case "dashboard": body = <StateGate state={state} retryHref={retry} empty={<DashboardEmpty />}><DashboardScreen account={account} created={created} newGoals={await getCreatedGoals()} requests={await getGoalRequests()} templates={[...(await getBuiltIns()), ...(await getTemplates())]} /></StateGate>; break;
    case "activity": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No activity yet" body="Records, imports and changes in your groups will show up here." />}><ActivityHistory rows={visibleActivity(account)} viewAs={viewAs} /></StateGate>; break;
    case "goals": body = <StateGate state={state} retryHref={retry} empty={<GoalsEmpty />}><GoalsScreen account={account} viewAs={viewAs} extra={await getCreatedGoals()} created={created} /></StateGate>; break;
    case "goal-info": body = <StateGate state={state} retryHref={`${retry}?goal=${query.goal}`} empty={null}><GoalInfoScreen id={query.goal ?? CAR_CREDIT} account={account} joins={joins} /></StateGate>; break;
    case "groups":
      body = <StateGate state={state} retryHref={retry} empty={<GroupsEmpty />}><GroupsScreen account={account} created={created} /></StateGate>; break;
    case "group": {
      const id = query.group ?? "family";
      const r = role(id);
      if (!r) redirect(`${BASE_PATH}/dashboard`); // not in this group
      const allGoals = await getCreatedGoals(), settings = await getGroupSettings();
      if (id.startsWith("my-")) { const g = created.find((x) => x.id === id); if (!g) notFound(); body = <CreatedGroupScreen group={g} role={r} settings={settings} setup={query.setup} tab={query.tab} directory={directory} />; break; }
      body = <ViewAsProvider value={r}><StateGate state={state} retryHref={retry} empty={goalEmpty("No goals in Family yet", "Add a goal to start tracking progress together.")}><GroupScreen id={id} account={account} viewAs={r} extra={allGoals.filter((x) => x.groupId === id)} settings={settings} setup={query.setup} tab={query.tab} joins={joins} directory={directory} /></StateGate></ViewAsProvider>; break;
    }
    case "loan": { const settings = await getGroupSettings(); body = inGoal(CAR_CREDIT, (r) => state === "empty" ? <LoanScreen noSchedule role={r} settings={settings} /> : <StateGate state={state} retryHref={retry} empty={null}><LoanScreen role={r} settings={settings} /></StateGate>); break; }
    case "new-goal": body = <StateGate state={state} retryHref={retry} empty={null}><NewGoalScreen viewAs={viewAs} groups={owned} defaultGroup={owned.find((g) => g.id === query.group)?.id} templates={[...(await getBuiltIns()), ...(await getTemplates())]} requests={await getGoalRequests()} /></StateGate>; break;
    case "transactions": body = inGoal(CAR_CREDIT, (r) => <StateGate state={state} retryHref={retry} empty={<TransactionsEmpty />}><TransactionsScreen role={r} /></StateGate>); break;
    case "add-transaction": body = inGoal(CAR_CREDIT, state === "loading" ? <LoadingState /> : <AddTransactionScreen showErrors={state === "error"} />); break;
    case "import": body = inGoal(CAR_CREDIT, state === "error" ? <><ErrorState title="The last sync failed" body="Gmail did not respond (simulated). No records were changed." retryHref={retry} /><ImportScreen /></> : <StateGate state={state} retryHref={retry} empty={<ImportScreen empty />}><ImportScreen /></StateGate>); break;
    case "notifications": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No notifications" body="You are all caught up." />}><NotificationsScreen groups={owned} /></StateGate>; break;
    case "users": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No users yet" body="People appear here when they sign up or are invited." />}><UsersScreen waiting={viewer.siteRole === "admin" ? await listUsers(viewer, { status: "pending_review" }) : []} rows={users.map((u) => ({ ...u, records: recordsAbout(u.name) }))} /></StateGate>; break;
    case "reports": body = <StateGate state={state} retryHref={retry} empty={<EmptyState title="No reports" body="Reports from users and problems the system finds will show up here." />}><ReportsScreen requests={await getGoalRequests()} /></StateGate>; break;
    case "templates": {
      const custom = await getTemplates(), builtIns = await getBuiltIns(), requests = await getGoalRequests();
      const inUse: Record<string, number> = {}; // template id -> goals made from it (they cannot be deleted, only retired)
      for (const g of await getCreatedGoals()) { const t = templateOf(g, [...builtIns, ...custom]); if (t) inUse[t.id] = (inUse[t.id] ?? 0) + 1; }
      body = <StateGate state={state} retryHref={retry} empty={null}><TemplatesScreen custom={custom} builtIns={builtIns} inUse={inUse} requests={requests} request={requests.find((r) => r.id === query.request)}
        groups={[...groups.filter((g) => !g.archived).map((g) => ({ id: g.id, name: g.name })), ...created.map((g) => ({ id: g.id, name: g.name }))]} /></StateGate>; break;
    }
    case "email-templates": {
      // How many goals' jobs send each template (Owners pick them in Group setup → Jobs).
      const inUse: Record<string, number> = {};
      for (const s of Object.values(await getGroupSettings())) for (const j of Object.values(s.jobs)) if (j?.template && !j.removed) inUse[j.template] = (inUse[j.template] ?? 0) + 1;
      body = <StateGate state={state} retryHref={retry} empty={null}><EmailTemplatesScreen inUse={inUse} /></StateGate>; break;
    }
    case "my-goal": {
      const goal = (await getCreatedGoals()).find((x) => x.id === query.goal);
      if (!goal) notFound();
      const groupName = [...groups, ...created].find((x) => x.id === goal.groupId)?.name;
      if (!groupName) notFound();
      const r = role(goal.groupId);
      if (!r) redirect(`${BASE_PATH}/dashboard`); // not in this goal's group
      // Invitations can be for some goals only: a Member outside this one goes back to the group page.
      const cg = created.find((x) => x.id === goal.groupId);
      const mine = cg && account !== "admin" ? emailOfMember(cg, ACCOUNTS[account].name) : undefined;
      if (r === "member" && cg && mine && !inGoalOf(cg, mine, goal.id)) redirect(`${BASE_PATH}/group?group=${goal.groupId}`);
      body = <CreatedGoalScreen goal={goal} groupName={groupName} members={cg ? goalMembers(cg, goal.id, creatorOf(cg)) : membersOf(goal.groupId, created)} role={r} />; break;
    }
    case "settings": body = <StateGate state={state} retryHref={retry} empty={null}><SettingsScreen /></StateGate>; break;
  }
  return body;
}
