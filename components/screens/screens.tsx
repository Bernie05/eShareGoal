import Link from "next/link";
import { Dumbbell, Info, Car, Landmark, ListChecks, PiggyBank, Plus, Target, Users, CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, OwnerLine, PageHeader, ProgressBar, SectionTitle, StatCard, StatusBadge } from "@/components/app/primitives";
import { EditGroupDialog } from "@/components/app/edit-group";
import { ByMemberChart, InOutChart, MonthlyContributionsChart } from "./charts";
import { AddTransactionDialog, ImportQueue, MemberContributions } from "./interactive";
import { TransactionsTable } from "./transactions-table";
import { GroupApprovalsFor, SampleApprovals, SampleMySubmissions } from "@/components/app/approvals";
import { DuesCard, DuesHint } from "@/components/app/dues";
import { MyShareAlert } from "@/components/app/reminders";
import { TransactionForm } from "./transaction-form";
import { SettingsSections } from "./settings";
import { ACCOUNTS, createdGroupsFor, membersOf, ownersOf, roleIn, rosterFor, sampleGroupsFor, type Account } from "@/lib/accounts";
import { groupDetails, groups, members, type Goal, type GoalType } from "@/lib/demo-data";
import type { CreatedGroup, ViewAs } from "@/lib/view-as";
import { OwnerOnly, RoleBadge } from "@/components/app/view-as";
import { CarCreditCardProgress, LoanProgress, LoanSchedule, LoanStats } from "./car-credit";
import { PendingImportsCard } from "@/components/app/import-review";
import { MyCarCreditView } from "@/components/app/my-car-credit";
import { CreateGroupDialog } from "@/components/app/create-group";
import { GoalJoinRequests, MyInvitations, SampleGroupInvite, type DirectoryUser } from "@/components/app/join-group";
import { users } from "@/lib/users-data";
import { NO_JOINS, type GoalJoins } from "@/lib/memberships";
import { NewGoalForm } from "./new-goal";
import type { Template } from "@/lib/goal-templates";
import type { GoalRequest } from "@/lib/goal-requests";
import type { CreatedGoal } from "@/lib/created-goals";
import { CreatedGoalCard } from "./goal-page";
import { CreatedGroupCard } from "./created-group";
import { GoalSetup, GroupSetup, GroupSetupCard } from "./group-settings";
import { LoanAbout, LoanDetailsCard } from "@/components/app/loan-details";
import type { SetupSettings as GroupSettings } from "@/lib/group-settings";
import { fmtDate } from "@/lib/money";
import { goalPath } from "@/lib/screens";
import { cn } from "@/lib/utils";
import { BASE_PATH, CAR_CREDIT } from "@/lib/constants";

export const goalIcon: Record<GoalType, typeof Landmark> = { loan: Car, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
export const typeName: Record<GoalType, string> = { loan: "Loan", shared_money: "Shared money", fitness: "Fitness", tasks: "Tasks", custom: "Custom" };

interface GoalCardProps {
  g: Goal;
  viewAs: ViewAs;
  showJoined?: boolean;
}
function GoalCard({ g, viewAs, showJoined }: GoalCardProps) {
  const Icon = goalIcon[g.type];
  return (
    <Link href={goalPath(g, viewAs)} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className={cn("h-full transition-colors group-hover:bg-accent/40", showJoined && g.joined && "ring-2 ring-success/40")}>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {showJoined && (g.joined
                ? <Badge className="border-0 bg-success/15 text-success"><CircleCheck aria-hidden /> Joined</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Not joined</Badge>)}
              <StatusBadge status={g.status} />
            </span>
          </div>
          <div><p className="font-medium">{g.name}</p><p className="text-xs text-muted-foreground">{typeName[g.type]} · updated {g.last}</p></div>
          {g.id === CAR_CREDIT ? <CarCreditCardProgress /> : <>
            <ProgressBar value={g.progress} label={`${g.name} progress`} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>{g.metric}</span><span className="num font-medium text-foreground">{g.progress}%</span></div>
          </>}
          {g.id === CAR_CREDIT && g.joined && <DuesHint />}
        </CardContent>
      </Card>
    </Link>
  );
}

interface GroupsScreenProps {
  account: Account;
  created: CreatedGroup[];
}
// ---------- Group list ----------
// account: who is looking; roles come from each group (Owner where they own it, Member elsewhere). created: every created group.
export function GroupsScreen({ account, created }: GroupsScreenProps) {
  const active = sampleGroupsFor(account);
  const archived = account === "user1" ? groups.filter((g) => g.archived) : []; // Bernz was in the closed office team
  return (
    <>
      <PageHeader title="My Groups" description="Workspaces you share with family, friends and teams." actions={account !== "admin" && <CreateGroupDialog trigger={<Button><Plus aria-hidden /> New group</Button>} />} />
      <MyInvitations />
      <div className="grid gap-4 md:grid-cols-2">
        {active.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>{g.name}<RoleBadge role={roleIn(account, g.id, created) ?? "member"} /></CardTitle>
              <CardDescription>{g.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <OwnerLine names={ownersOf(g.id, created)} />
              <p className="text-xs text-muted-foreground">{g.members} members · {g.goals.length} goals · created {fmtDate(g.created)}</p>
              <ul className="space-y-1.5">
                {g.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center gap-3 text-sm"><span className="w-40 truncate">{goal.name}</span><div className="flex-1"><ProgressBar value={goal.progress} label={`${goal.name} progress`} /></div><span className="num w-9 text-right text-xs text-muted-foreground">{goal.progress}%</span></li>
                ))}
              </ul>
              <Link href={`${BASE_PATH}/group?group=${g.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open group</Link>
            </CardContent>
          </Card>
        ))}
        {createdGroupsFor(account, created).map((g) => <CreatedGroupCard key={g.id} group={g} role={roleIn(account, g.id, created) ?? "member"} />)}{/* created groups: same card */}
      </div>
      {archived.length > 0 && <SectionTitle>Archived</SectionTitle>}
      {archived.map((g) => (
        <Card key={g.id} size="sm"><CardContent className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-medium">{g.name} <Badge variant="secondary">Archived</Badge></p><p className="text-xs text-muted-foreground">{g.description} Read-only. Restore or delete permanently.</p></div>
          <RoleBadge role="member" />
        </CardContent></Card>
      ))}
    </>
  );
}

export const GroupsEmpty = () => <><PageHeader title="My Groups" /><MyInvitations /><EmptyState title="Create your first group" body="A group is a shared workspace. Invite people, then add goals like a loan, a savings fund or a fitness challenge." cta={{ label: "New group", href: `${BASE_PATH}/groups` }} /></>;

interface GoalsScreenProps {
  account: Account;
  viewAs: ViewAs;
  extra?: CreatedGoal[];
  created?: CreatedGroup[];
}
// ---------- All goals ----------
export function GoalsScreen({ account, viewAs, extra = [], created = [] }: GoalsScreenProps) {
  const active = sampleGroupsFor(account).filter((g) => g.goals.length);
  const role = (groupId: string) => roleIn(account, groupId, created) ?? "member";
  const all = active.flatMap((g) => g.goals);
  return (
    <>
      <PageHeader title="All Goals" description={viewAs === "admin" ? `${all.length} goals across all groups. As System Admin you can open any of them, read-only.` : `${all.length} goals across your groups. You joined ${all.filter((x) => x.joined).length}. Open a card to see the goal.`} actions={<OwnerOnly><Link href={`${BASE_PATH}/new-goal`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link></OwnerOnly>} />
      {active.map((g) => (
        <section key={g.id} aria-labelledby={`goals-${g.id}`} className="space-y-3">
          <SectionTitle aside={<span className="flex items-center gap-2">{viewAs !== "admin" && <span className="text-xs text-muted-foreground">{g.goals.filter((x) => x.joined).length} of {g.goals.length} joined</span>}<RoleBadge role={role(g.id)} /></span>}><span id={`goals-${g.id}`}>{g.name}</span></SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{g.goals.map((x) => <GoalCard key={x.id} g={x} viewAs={role(g.id)} showJoined={viewAs !== "admin"} />)}{extra.filter((x) => x.groupId === g.id).map((x) => <CreatedGoalCard key={x.id} g={x} members={membersOf(g.id, created)} />)}</div>
        </section>
      ))}
      {createdGroupsFor(account, created).filter((g) => extra.some((x) => x.groupId === g.id)).map((g) => ( // created groups this account is in, with their goals
        <section key={g.id} aria-labelledby={`goals-${g.id}`} className="space-y-3">
          <SectionTitle aside={<RoleBadge role={role(g.id)} />}><span id={`goals-${g.id}`}>{g.name}</span></SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{extra.filter((x) => x.groupId === g.id).map((x) => <CreatedGoalCard key={x.id} g={x} members={membersOf(g.id, created)} />)}</div>
        </section>
      ))}
    </>
  );
}

export const GoalsEmpty = () => <><PageHeader title="All Goals" /><EmptyState title="No goals yet" body="Goals live inside groups. Open a group and add a loan, a savings fund or a challenge." cta={{ label: "New goal", href: `${BASE_PATH}/new-goal` }} /></>;

interface GroupScreenProps {
  id?: string;
  account: Account;
  viewAs: ViewAs;
  extra?: CreatedGoal[];
  settings: Record<string, GroupSettings>;
  setup?: string;
  tab?: string;
  joins?: GoalJoins;
  directory?: DirectoryUser[];
}
// ---------- Group overview ----------
// viewAs: the account's role in this group (Owner, Member or admin).
// settings/setup/tab: the group setup (integrations, jobs, notifications per goal), on this page. setup/tab: which row and tab open first.
export function GroupScreen({ id, account, viewAs, extra = [], settings, setup, tab, joins = NO_JOINS, directory = [] }: GroupScreenProps) {
  const g = groups.find((x) => x.id === id && !x.archived) ?? groups[0];
  const detail = groupDetails[g.id];
  const { activity } = detail;
  const roster = rosterFor(g.id, account);
  const names = roster.map((m) => m.name);
  const setupGroup = { id: g.id, name: g.name, goals: [
    ...g.goals.map((x) => ({ id: x.id, name: x.name, loan: x.type === "loan", money: x.type === "loan" || x.type === "shared_money", created: false, members: names })),
    ...extra.map((x) => ({ id: x.id, name: x.name, loan: x.template.widgets.includes("schedule"), money: x.template.measure === "money", created: true, members: names })),
  ] };
  const owner = viewAs === "owner";
  return (
    <>
      <PageHeader title={g.name} description={<>{g.description}<span className="mt-1 block"><OwnerLine names={ownersOf(g.id, [])} /></span></>} actions={<OwnerOnly><SampleGroupInvite groupName={g.name} directory={directory} members={names} goals={g.goals.map((x) => ({ id: x.id, name: x.name }))} invited={users.filter((u) => u.status === "Invited" && u.memberships.some((m) => m.group === g.name)).map((u) => u.email)} /><EditGroupDialog groupName={g.name} goals={[...g.goals.map((x) => ({ id: x.id, name: x.name, members: names, sample: x })), ...extra.map((x) => ({ id: x.id, name: x.name, members: names, created: x }))]} /><Button variant="outline">Archive</Button><Button><Plus aria-hidden /> New goal</Button></OwnerOnly>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Active goals" value={g.goals.length + extra.length} icon={Target} hint="Progress is shown per goal, never summed across units" />
        <StatCard label="Members" value={g.members} icon={Users} hint={viewAs === "admin" ? "System Admin is not counted" : `${ACCOUNTS[account].name}, you are ${owner ? "the Owner" : "a Member"} here`} />
      </div>
      <SectionTitle>Goals</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(sampleGroupsFor(account, joins).find((x) => x.id === g.id) ?? g).goals.map((x) => <GoalCard key={x.id} g={x} viewAs={viewAs} showJoined={viewAs !== "admin"} />)}{extra.map((x) => <CreatedGoalCard key={x.id} g={x} members={roster.map((m) => m.name)} />)}</div>
      <GroupApprovalsFor groupId={g.id} groupName={g.name} />
      {owner && <GoalJoinRequests group={g.id} joins={joins} goals={g.goals.map((x) => ({ id: x.id, name: x.name, money: x.type === "loan" || x.type === "shared_money", href: goalPath({ ...x, joined: true }, "owner") }))} />}
      {/* Members see their goals' setup beside the roster; Owners and the System Admin have Goal setup below, so the roster takes the full width */}
      <div className={cn("grid gap-4", viewAs === "member" && "lg:grid-cols-3")}>
        <Card className={cn(viewAs === "member" && "lg:col-span-2")}>
          <CardHeader><CardTitle>Members and roles</CardTitle><CardDescription>The Owner changes anything; Members can only view. Roles are enforced by the server in production; the UI only hides actions.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y">
              {roster.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium">{m.name}{m.you && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                  <RoleBadge role={m.role === "Owner" ? "owner" : "member"} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
              <span><span className="font-medium">System Admin</span>{viewAs === "admin" && <span className="text-muted-foreground"> (you)</span>} <span className="text-muted-foreground">· has access to every group · not counted in members, totals or charts</span></span>
              <RoleBadge role="admin" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
        {viewAs === "member" && <GroupSetupCard group={setupGroup} all={settings} />}
        </div>
      </div>
      {viewAs !== "member" && <GroupSetup group={setupGroup} role={viewAs} all={settings} open={setup} tab={tab} />}
      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent><ul className="divide-y">{activity.map(([who, what, when]) => (
          <li key={what} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span><span className="font-medium">{who}</span> {what}</span><span className="text-muted-foreground">{when}</span></li>
        ))}</ul></CardContent>
      </Card>
    </>
  );
}

interface LoanScreenProps {
  noSchedule?: boolean;
  role: ViewAs;
  settings: Record<string, GroupSettings>;
}
// ---------- Loan ----------
// role: this account's role in Family, decided on the server. A Member's page is built without the group's
// numbers (fund totals, everyone's shares, charts, per-member list), so they are never sent to their browser.
// The Owner gets three tabs: the group dashboard first, then "Your share", the same page a Member sees, then
// "Goal settings" (the goal's details, plus its row of the parent group's Goal setup).
// The System Admin has no share of their own, so only the dashboard.
export function LoanScreen({ noSchedule = false, role, settings }: LoanScreenProps) {
  const group = role !== "member";
  const family = groups.find((g) => g.id === "family")!;
  const setupGroup = { id: family.id, name: family.name, goals: [{ id: CAR_CREDIT, name: "Car Credit", loan: true, money: true, created: false, members: members.map((m) => m.name) }] };
  const mine = (
    <>
      <LoanStats group={false} noSchedule={noSchedule} />
      {!noSchedule && <>
        <MyCarCreditView />
        <LoanProgress />
        <LoanSchedule />
      </>}
    </>
  );
  const dashboard = (
    <>
      <PendingImportsCard />
      <LoanStats group noSchedule={noSchedule} />
      {!noSchedule && <>
        <DuesCard />
        <LoanProgress />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardHeader><CardTitle>Monthly contributions</CardTitle></CardHeader><CardContent><MonthlyContributionsChart /></CardContent></Card>
          <Card><CardHeader><CardTitle>Contributions by member</CardTitle></CardHeader><CardContent><ByMemberChart /></CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle>Deposits vs. payments and expenses</CardTitle></CardHeader><CardContent><InOutChart /></CardContent></Card>
        <LoanSchedule />
      </>}
      <SectionTitle>Contributions by member</SectionTitle>
      <MemberContributions />
    </>
  );
  return (
    <>
      <PageHeader title="Car Credit" description={<LoanAbout />} actions={<><SampleApprovals goalId={CAR_CREDIT} /><AddTransactionDialog goalId={CAR_CREDIT} /><Link href={`${BASE_PATH}/transactions`} className={buttonVariants({ variant: "outline" })}>{group ? "All transactions" : "Your transactions"}</Link></>} />
      <MyShareAlert />
      <SampleMySubmissions goalId={CAR_CREDIT} />
      {noSchedule && <Alert><Info aria-hidden /><AlertTitle>No loan schedule yet</AlertTitle><AlertDescription>Set the monthly amount, term and first due date to see the balance and due dates. Member contributions are never used to estimate the loan balance.</AlertDescription></Alert>}
      {role === "owner" ? (
        <Tabs defaultValue="dashboard" className="gap-4">
          <TabsList><TabsTrigger value="dashboard">Group dashboard</TabsTrigger><TabsTrigger value="mine">Your share</TabsTrigger><TabsTrigger value="settings">Goal settings</TabsTrigger></TabsList>
          <TabsContent value="dashboard" className="space-y-6">{dashboard}</TabsContent>
          <TabsContent value="mine" className="space-y-6">{mine}</TabsContent>
          <TabsContent value="settings" className="space-y-6"><LoanDetailsCard /><GoalSetup group={setupGroup} goalId={CAR_CREDIT} role={role} all={settings} /></TabsContent>
        </Tabs>
      ) : group ? dashboard : mine}
    </>
  );
}

interface NewGoalScreenProps {
  viewAs: ViewAs;
  groups: { id: string; name: string; members: string[] }[];
  defaultGroup?: string;
  templates: Template[];
  requests: GoalRequest[];
}
// ---------- Create goal ----------
// groups: where this user is the Owner (Family when previewing as Owner, plus groups they created).
export function NewGoalScreen({ viewAs, groups: owned, defaultGroup, templates, requests }: NewGoalScreenProps) {
  if (!owned.length) return <><PageHeader title="Create a goal" /><Alert><Info aria-hidden /><AlertTitle>Only the group Owner can create goals</AlertTitle><AlertDescription>{viewAs === "admin" ? "System Admins have view-only access to every group." : "Members can view and monitor goals. Ask the Owner to add the goal."}</AlertDescription></Alert></>;
  // Built-in templates plus the System Admin's own; the form shows only published ones available in the chosen group.
  return <NewGoalForm templates={templates} groups={owned} defaultGroup={defaultGroup} requests={requests} />;
}

interface TransactionsScreenProps {
  role: ViewAs;
}
// ---------- Transactions ----------
export function TransactionsScreen({ role }: TransactionsScreenProps) {
  const group = role !== "member";
  return (
    <>
      <PageHeader title="Transactions" description={group ? "Car Credit · every record, newest first. Corrections are added as new rows." : "Car Credit · your records, newest first. The Owner sees everyone's."} actions={<span className="flex gap-2">{/* one row: the description wraps instead */}<SampleApprovals goalId={CAR_CREDIT} /><AddTransactionDialog goalId={CAR_CREDIT} /></span>} />
      <SampleMySubmissions goalId={CAR_CREDIT} />
      <TransactionsTable goalId={CAR_CREDIT} onlyMine={!group} />
      {group && <Card><CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Append-only. Latest changes first.</CardDescription></CardHeader><CardContent><ul className="divide-y text-sm">{[["Babylyn", "reversed a duplicate expense of ₱4,800.00 (DEMO-DUP02)", "Aug 2, 2026 4:12 PM"], ["Bernz", "changed Billy's deposit from Pending to Confirmed", "Oct 3, 2026 10:02 AM"]].map(([w, a, d]) => (
        <li key={a} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{w}</span> {a}</span><span className="text-muted-foreground">{d}</span></li>))}</ul></CardContent></Card>}
    </>
  );
}

export const TransactionsEmpty = () => <><PageHeader title="Transactions" actions={<><SampleApprovals goalId={CAR_CREDIT} /><AddTransactionDialog goalId={CAR_CREDIT} /></>} /><SampleMySubmissions goalId={CAR_CREDIT} /><EmptyState title="No transactions yet" body="Add the first deposit or lender payment, or import from email once Gmail is connected." /></>;

interface AddTransactionScreenProps {
  showErrors: boolean;
}
export function AddTransactionScreen({ showErrors }: AddTransactionScreenProps) {
  return (
    <>
      <PageHeader title="Add transaction" description={showErrors ? "Validation state: fields with problems explain what to fix and keep what you typed." : "The same form opens in a dialog from the Transactions screen."} />
      <Card className="max-w-2xl"><CardContent><TransactionForm showErrors={showErrors} /></CardContent></Card>
    </>
  );
}

interface ImportScreenProps {
  empty?: boolean;
}
// ---------- Import ----------
export function ImportScreen({ empty = false }: ImportScreenProps) {
  return (
    <>
      <PageHeader title="Import review" description="Payments your Gmail import jobs found. Nothing becomes a record until you confirm it." actions={<OwnerOnly><Link href={`${BASE_PATH}/group?group=family&setup=car-credit&tab=jobs#setup`} className={buttonVariants({ variant: "outline" })}>Import jobs</Link></OwnerOnly>} />
      <Alert><Info aria-hidden /><AlertTitle>Real payments first, samples below</AlertTitle><AlertDescription>&ldquo;From your import jobs&rdquo; holds real payments from Gmail, and confirming one adds a record to its goal. &ldquo;Sample candidates&rdquo; are fictional.</AlertDescription></Alert>
      <ImportQueue mode={empty ? "empty" : "default"} />
    </>
  );
}

export const SettingsScreen = () => <><PageHeader title="Settings" description="Your profile, payment cards and preferences. Group settings are on each group page." /><SettingsSections /></>;

