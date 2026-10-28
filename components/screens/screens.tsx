import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Dumbbell, Info, Car, Landmark, ListChecks, PiggyBank, Plus, Target, Users, Wallet, CircleCheck, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, ProgressBar, SectionTitle, StatCard, StatusBadge } from "@/components/app/primitives";
import { ByMemberChart, InOutChart, MonthlyContributionsChart, SavingsMonthlyChart, SavingsShareChart } from "./charts";
import { AddTransactionDialog, ImportQueue, MemberContributions } from "./interactive";
import { TransactionsTable } from "./transactions-table";
import { GroupApprovalsFor, SampleApprovals, SampleMySubmissions } from "@/components/app/approvals";
import { DuesCard, DuesHint, GroupStatusCard } from "@/components/app/dues";
import { MyShareAlert } from "@/components/app/reminders";
import { TransactionForm } from "./transaction-form";
import { SettingsTabs } from "./settings";
import { ACCOUNTS, createdGroupsFor, membersOf, roleIn, rosterFor, sampleGroupsFor, type Account } from "@/lib/accounts";
import { groupDetails, groups, members, type Goal, type GoalType } from "@/lib/demo-data";
import { savingsGoal, savingsPlans } from "@/lib/activity-data";
import type { CreatedGroup, ViewAs } from "@/lib/view-as";
import { OwnerOnly, RoleBadge } from "@/components/app/view-as";
import { CarCreditCardProgress, LoanProgress, LoanSchedule, LoanStats } from "./car-credit";
import { MyCarCreditView } from "@/components/app/my-car-credit";
import { CreateGroupDialog } from "@/components/app/create-group";
import { WalkingDemoButton } from "@/components/app/walking-demo-button";
import { NewGoalForm } from "./new-goal";
import type { Template } from "@/lib/goal-templates";
import type { GoalRequest } from "@/lib/goal-requests";
import type { CreatedGoal } from "@/lib/created-goals";
import { CreatedGoalCard } from "./goal-page";
import { CreatedGroupCard } from "./created-group";
import { GoalSetup, GroupSetup, GroupSetupCard } from "./group-settings";
import { LoanAbout, LoanDetailsCard } from "@/components/app/loan-details";
import type { SetupSettings as GroupSettings } from "@/lib/group-settings";
import { fmtDate, peso } from "@/lib/money";
import { goalPath } from "@/lib/screens";
import { cn } from "@/lib/utils";

const base = "/design-preview";
export const goalIcon: Record<GoalType, typeof Landmark> = { loan: Car, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
export const typeName: Record<GoalType, string> = { loan: "Loan", shared_money: "Shared money", fitness: "Fitness", tasks: "Tasks", custom: "Custom" };

function GoalCard({ g, viewAs, showJoined }: { g: Goal; viewAs: ViewAs; showJoined?: boolean }) {
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
          {g.id === "car-credit" ? <CarCreditCardProgress /> : <>
            <ProgressBar value={g.progress} label={`${g.name} progress`} />
            <div className="flex justify-between text-xs text-muted-foreground"><span>{g.metric}</span><span className="num font-medium text-foreground">{g.progress}%</span></div>
          </>}
          {g.id === "car-credit" && g.joined && <DuesHint />}
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------- Group list ----------
// account: who is looking; roles come from each group (Owner where they own it, Member elsewhere). created: every created group.
export function GroupsScreen({ account, created }: { account: Account; created: CreatedGroup[] }) {
  const active = sampleGroupsFor(account);
  const archived = account === "user1" ? groups.filter((g) => g.archived) : []; // Bernz was in the closed office team
  return (
    <>
      <PageHeader title="My Groups" description="Workspaces you share with family, friends and teams." actions={account !== "admin" && <><WalkingDemoButton /><CreateGroupDialog trigger={<Button><Plus aria-hidden /> New group</Button>} /></>} />
      <div className="grid gap-4 md:grid-cols-2">
        {active.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>{g.name}<RoleBadge role={roleIn(account, g.id, created) ?? "member"} /></CardTitle>
              <CardDescription>{g.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{g.members} members · {g.goals.length} goals · created {fmtDate(g.created)}</p>
              <ul className="space-y-1.5">
                {g.goals.map((goal) => (
                  <li key={goal.id} className="flex items-center gap-3 text-sm"><span className="w-40 truncate">{goal.name}</span><div className="flex-1"><ProgressBar value={goal.progress} label={`${goal.name} progress`} /></div><span className="num w-9 text-right text-xs text-muted-foreground">{goal.progress}%</span></li>
                ))}
              </ul>
              <Link href={`${base}/group?group=${g.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open group</Link>
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

export const GroupsEmpty = () => <><PageHeader title="My Groups" /><EmptyState title="Create your first group" body="A group is a shared workspace. Invite people, then add goals like a loan, a savings fund or a fitness challenge." cta={{ label: "New group", href: `${base}/groups` }} /></>;

// ---------- All goals ----------
export function GoalsScreen({ account, viewAs, extra = [], created = [] }: { account: Account; viewAs: ViewAs; extra?: CreatedGoal[]; created?: CreatedGroup[] }) {
  const active = sampleGroupsFor(account).filter((g) => g.goals.length);
  const role = (groupId: string) => roleIn(account, groupId, created) ?? "member";
  const all = active.flatMap((g) => g.goals);
  return (
    <>
      <PageHeader title="All Goals" description={viewAs === "admin" ? `${all.length} goals across all groups. As System Admin you can open any of them, read-only.` : `${all.length} goals across your groups. You joined ${all.filter((x) => x.joined).length}. Open a card to see the goal.`} actions={<OwnerOnly><Link href={`${base}/new-goal`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link></OwnerOnly>} />
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

export const GoalsEmpty = () => <><PageHeader title="All Goals" /><EmptyState title="No goals yet" body="Goals live inside groups. Open a group and add a loan, a savings fund or a challenge." cta={{ label: "New goal", href: `${base}/new-goal` }} /></>;

// ---------- Group overview ----------
// viewAs: the account's role in this group (Owner, Member or admin).
// settings/setup/tab: the group setup (integrations, jobs, notifications per goal), on this page. setup/tab: which row and tab open first.
export function GroupScreen({ id, account, viewAs, extra = [], settings, setup, tab }: { id?: string; account: Account; viewAs: ViewAs; extra?: CreatedGoal[]; settings: Record<string, GroupSettings>; setup?: string; tab?: string }) {
  const g = groups.find((x) => x.id === id && !x.archived) ?? groups[0];
  const detail = groupDetails[g.id];
  const { invite, activity } = detail;
  const roster = rosterFor(g.id, account);
  const names = roster.map((m) => m.name);
  const setupGroup = { id: g.id, name: g.name, goals: [
    ...g.goals.map((x) => ({ id: x.id, name: x.name, loan: x.type === "loan", money: x.type === "loan" || x.type === "shared_money", created: false, members: names })),
    ...extra.map((x) => ({ id: x.id, name: x.name, loan: x.template.widgets.includes("schedule"), money: x.template.measure === "money", created: true, members: names })),
  ] };
  const owner = viewAs === "owner";
  return (
    <>
      <PageHeader title={g.name} description={g.description} actions={<OwnerOnly><Button variant="outline">Edit group</Button><Button variant="outline">Archive</Button><Button><Plus aria-hidden /> New goal</Button></OwnerOnly>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Active goals" value={g.goals.length + extra.length} icon={Target} hint="Progress is shown per goal, never summed across units" />
        <StatCard label="Members" value={g.members} icon={Users} hint={viewAs === "admin" ? "System Admin is not counted" : `${ACCOUNTS[account].name}, you are ${owner ? "the Owner" : "a Member"} here`} />
      </div>
      <SectionTitle>Goals</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(sampleGroupsFor(account).find((x) => x.id === g.id) ?? g).goals.map((x) => <GoalCard key={x.id} g={x} viewAs={viewAs} showJoined={viewAs !== "admin"} />)}{extra.map((x) => <CreatedGoalCard key={x.id} g={x} members={roster.map((m) => m.name)} />)}</div>
      <GroupApprovalsFor groupId={g.id} groupName={g.name} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
        {owner && <Card>
          <CardHeader><CardTitle>Invite people</CardTitle><CardDescription>Share this code. Real invitations need email delivery from the backend.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2"><code className="font-mono text-sm">{invite}</code><Button variant="ghost" size="icon-sm" aria-label="Copy invitation code"><Copy aria-hidden /></Button></div>
          </CardContent>
        </Card>}
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

// ---------- Shared Money ----------
export function SharedMoneyScreen({ id }: { id: string }) {
  const group = groups.find((g) => g.goals.some((x) => x.id === id && x.type === "shared_money"));
  const goal = group?.goals.find((x) => x.id === id);
  const plan = savingsPlans[id];
  if (!group || !goal || !plan) notFound();
  const s = savingsGoal(id);
  const monthly = plan.kind === "monthly";
  const pct = Math.round(((monthly ? s.thisMonth : s.saved) / plan.target) * 100);
  return (
    <>
      <PageHeader
        title={goal.name}
        description={`${group.name} · ${plan.about} ${monthly ? `Budget ${peso(plan.target)} every month.` : `Target ${peso(plan.target)} by ${plan.by}.`}`}
        actions={<><SampleApprovals goalId={id} /><AddTransactionDialog goalId={id} /><OwnerOnly><Button variant="outline">Goal settings</Button></OwnerOnly></>}
      />
      <SampleMySubmissions goalId={id} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {monthly ? <>
          <StatCard label="Collected this month" value={peso(s.thisMonth)} tone="success" icon={PiggyBank} hint={`${pct}% of ${peso(plan.target)}`} />
          <StatCard label="Still needed this month" value={peso(Math.max(0, plan.target - s.thisMonth))} icon={Target} hint="Budget refills on the 1st" />
          <StatCard label="Average per month" value={peso(Math.round(s.saved / Math.max(1, s.activeMonths)))} icon={CalendarClock} hint={`Over ${s.activeMonths} months`} />
          <StatCard label="Collected in total" value={peso(s.saved)} icon={Wallet} hint={s.pending ? `${s.pending} deposit pending` : "All confirmed"} />
        </> : <>
          <StatCard label="Saved so far" value={peso(s.saved)} tone="success" icon={PiggyBank} hint={`${pct}% of target`} />
          <StatCard label="Remaining to target" value={peso(Math.max(0, plan.target - s.saved))} icon={Target} hint={`${plan.monthsLeft} months left`} />
          <StatCard label="Monthly pace needed" value={peso(Math.ceil(Math.max(0, plan.target - s.saved) / plan.monthsLeft))} icon={CalendarClock} hint="To reach the target on time" />
          <StatCard label="Deposits" value={s.byMember.reduce((n, m) => n + m.count, 0)} icon={Wallet} hint={s.pending ? `${s.pending} pending (counted)` : "All confirmed"} />
        </>}
      </div>
      <Card><CardContent className="space-y-2"><div className="flex justify-between text-sm"><span className="font-medium">{monthly ? "This month's budget" : "Progress to target"}</span><span className="num">{pct}%</span></div><ProgressBar value={pct} label={monthly ? "This month's budget" : "Progress to target"} /></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Deposits per month</CardTitle></CardHeader><CardContent><SavingsMonthlyChart data={s.monthly} people={s.people} goal={goal.name} /></CardContent></Card>
        <Card><CardHeader><CardTitle>By member</CardTitle></CardHeader><CardContent><SavingsShareChart data={s.byMember} goal={goal.name} /></CardContent></Card>
      </div>
      <SectionTitle>Contributions by member</SectionTitle>
      <Card><CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Deposits</TableHead><TableHead>Latest</TableHead><TableHead>Pending</TableHead></TableRow></TableHeader>
          <TableBody>{s.byMember.map((m) => (
            <TableRow key={m.name}>
              <TableCell className="font-medium">{m.name}</TableCell><TableCell className="num text-right">{peso(m.total)}</TableCell><TableCell className="num text-right">{m.count}</TableCell>
              <TableCell>{fmtDate(m.latest)}</TableCell><TableCell>{m.pending ? <StatusBadge status="Pending" /> : <span className="text-muted-foreground">-</span>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
      {plan.kind === "target" && <Milestones items={plan.milestones} />}
      <Link href={`${base}/activity`} className={buttonVariants({ variant: "outline", size: "sm" })}>All records in Activity History</Link>
    </>
  );
}

function Milestones({ items }: { items: string[][] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
      <CardContent><ul className="space-y-2">{items.map(([n, s, d]) => (
        <li key={n} className="flex items-center gap-3 text-sm">
          {s === "Done" ? <CircleCheck className="size-4 text-success" aria-label="Done" /> : <span className="size-4 rounded-full border-2" aria-label="Upcoming" />}
          <span className={cn("flex-1", s === "Done" && "text-muted-foreground")}>{n}</span><span className="text-xs text-muted-foreground">{d}</span>
        </li>
      ))}</ul></CardContent>
    </Card>
  );
}

// ---------- Loan ----------
// role: this account's role in Family, decided on the server. A Member's page is built without the group's
// numbers (fund totals, everyone's shares, charts, per-member list), so they are never sent to their browser.
// The Owner gets three tabs: the group dashboard first, then "Your share", the same page a Member sees, then
// "Goal settings" (the goal's details, plus its row of the parent group's Goal setup).
// The System Admin has no share of their own, so only the dashboard.
export function LoanScreen({ noSchedule = false, role, settings }: { noSchedule?: boolean; role: ViewAs; settings: Record<string, GroupSettings> }) {
  const group = role !== "member";
  const family = groups.find((g) => g.id === "family")!;
  const setupGroup = { id: family.id, name: family.name, goals: [{ id: "car-credit", name: "Car Credit", loan: true, money: true, created: false, members: members.map((m) => m.name) }] };
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
      <LoanStats group noSchedule={noSchedule} />
      {!noSchedule && <>
        <DuesCard />
        <GroupStatusCard />
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
      <PageHeader title="Car Credit" description={<LoanAbout />} actions={<><SampleApprovals goalId="car-credit" /><AddTransactionDialog goalId="car-credit" /><Link href={`${base}/transactions`} className={buttonVariants({ variant: "outline" })}>{group ? "All transactions" : "Your transactions"}</Link></>} />
      <MyShareAlert />
      <SampleMySubmissions goalId="car-credit" />
      {noSchedule && <Alert><Info aria-hidden /><AlertTitle>No loan schedule yet</AlertTitle><AlertDescription>Set the monthly amount, term and first due date to see the balance and due dates. Member contributions are never used to estimate the loan balance.</AlertDescription></Alert>}
      {role === "owner" ? (
        <Tabs defaultValue="dashboard" className="gap-4">
          <TabsList><TabsTrigger value="dashboard">Group dashboard</TabsTrigger><TabsTrigger value="mine">Your share</TabsTrigger><TabsTrigger value="settings">Goal settings</TabsTrigger></TabsList>
          <TabsContent value="dashboard" className="space-y-6">{dashboard}</TabsContent>
          <TabsContent value="mine" className="space-y-6">{mine}</TabsContent>
          <TabsContent value="settings" className="space-y-6"><LoanDetailsCard /><GoalSetup group={setupGroup} goalId="car-credit" role={role} all={settings} /></TabsContent>
        </Tabs>
      ) : group ? dashboard : mine}
    </>
  );
}

// ---------- Generic goal (fitness / tasks / custom) ----------
export function GenericScreen() {
  const parts = [["Bernz", 62, "-2.1 kg"], ["Babylyn", 47, "-1.4 kg"], ["Billy", 33, "-0.9 kg"]] as const;
  return (
    <>
      <PageHeader title="30-Day Fitness Challenge" description="Lose 3 kg each by Nov 12, 2026. Tracked weekly." actions={<OwnerOnly><Button><Plus aria-hidden /> Add progress record</Button><Button variant="outline">Goal settings</Button></OwnerOnly>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Day" value="12 / 30" icon={CalendarClock} hint="18 days left" />
        <StatCard label="Group average" value="-1.5 kg" tone="success" icon={Dumbbell} hint="Target -3 kg each" />
        <StatCard label="Check-ins this week" value="9 / 15" icon={ListChecks} hint="Behind pace by 2" tone="warning" />
      </div>
      <Card>
        <CardHeader><CardTitle>Participants</CardTitle><CardDescription>Each person against the same target. Units stay separate from money goals.</CardDescription></CardHeader>
        <CardContent className="space-y-4">{parts.map(([n, p, d]) => (
          <div key={n} className="space-y-1.5"><div className="flex justify-between text-sm"><span className="font-medium">{n}</span><span className="num text-muted-foreground">{d} · {p}%</span></div><ProgressBar value={p} label={`${n} progress`} tone="primary" /></div>
        ))}</CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Recent records</CardTitle></CardHeader><CardContent><ul className="divide-y text-sm">{[["Billy", "Weigh-in 78.4 kg", "Today"], ["Bernz", "5 km run", "Yesterday"], ["Babylyn", "Weigh-in 61.2 kg", "2 days ago"]].map(([w, a, d]) => (
          <li key={a} className="flex justify-between gap-2 py-2"><span><span className="font-medium">{w}</span> · {a}</span><span className="text-muted-foreground">{d}</span></li>))}</ul></CardContent></Card>
        <Milestones items={[["Week 1 weigh-in complete", "Done", "Nov 5"], ["Halfway: -1.5 kg each", "Upcoming", "Nov 5"], ["Final weigh-in", "Upcoming", "Nov 12"]]} />
      </div>
    </>
  );
}

// ---------- Create goal ----------
// groups: where this user is the Owner (Family and Friends when previewing as Owner, plus groups they created).
export function NewGoalScreen({ viewAs, groups: owned, defaultGroup, templates, requests }: { viewAs: ViewAs; groups: { id: string; name: string; members: string[] }[]; defaultGroup?: string; templates: Template[]; requests: GoalRequest[] }) {
  if (!owned.length) return <><PageHeader title="Create a goal" /><Alert><Info aria-hidden /><AlertTitle>Only the group Owner can create goals</AlertTitle><AlertDescription>{viewAs === "admin" ? "System Admins have view-only access to every group." : "Members can view and monitor goals. Ask the Owner to add the goal."}</AlertDescription></Alert></>;
  // Built-in templates plus the System Admin's own; the form shows only published ones available in the chosen group.
  return <NewGoalForm templates={templates} groups={owned} defaultGroup={defaultGroup} requests={requests} />;
}

// ---------- Transactions ----------
export function TransactionsScreen({ role }: { role: ViewAs }) {
  const group = role !== "member";
  return (
    <>
      <PageHeader title="Transactions" description={group ? "Car Credit · all records, newest first, including approved member submissions. Corrections are added as new rows; history is never overwritten." : "Car Credit · your records only, newest first, including your approved submissions. The Owner sees everyone's."} actions={<><SampleApprovals goalId="car-credit" /><AddTransactionDialog goalId="car-credit" /></>} />
      <SampleMySubmissions goalId="car-credit" />
      <TransactionsTable goalId="car-credit" onlyMine={!group} />
      {group && <Card><CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Append-only. Latest changes first.</CardDescription></CardHeader><CardContent><ul className="divide-y text-sm">{[["Babylyn", "reversed a duplicate expense of ₱4,800.00 (DEMO-DUP02)", "Aug 2, 2026 4:12 PM"], ["Bernz", "changed Billy's deposit from Pending to Confirmed", "Oct 3, 2026 10:02 AM"]].map(([w, a, d]) => (
        <li key={a} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{w}</span> {a}</span><span className="text-muted-foreground">{d}</span></li>))}</ul></CardContent></Card>}
    </>
  );
}

export const TransactionsEmpty = () => <><PageHeader title="Transactions" actions={<><SampleApprovals goalId="car-credit" /><AddTransactionDialog goalId="car-credit" /></>} /><SampleMySubmissions goalId="car-credit" /><EmptyState title="No transactions yet" body="Add the first deposit or lender payment, or import from email once Gmail is connected." /></>;

export function AddTransactionScreen({ showErrors }: { showErrors: boolean }) {
  return (
    <>
      <PageHeader title="Add transaction" description={showErrors ? "Validation state: fields with problems explain what to fix and keep what you typed." : "The same form opens in a dialog from the Transactions screen."} />
      <Card className="max-w-2xl"><CardContent><TransactionForm showErrors={showErrors} /></CardContent></Card>
    </>
  );
}

// ---------- Import ----------
export function ImportScreen({ empty = false }: { empty?: boolean }) {
  return (
    <>
      <PageHeader title="Import review" description="Payments your Gmail import jobs found. Nothing becomes a record until you confirm it." actions={<OwnerOnly><Link href={`${base}/group?group=family&setup=car-credit&tab=jobs#setup`} className={buttonVariants({ variant: "outline" })}>Import jobs</Link><Link href={`${base}/workflows`} className={buttonVariants({ variant: "outline" })}>Workflows</Link></OwnerOnly>} />
      <Alert><Info aria-hidden /><AlertTitle>Simulation</AlertTitle><AlertDescription>The emails are fictional samples from a mock Gmail service. Payments sent here by an import job&apos;s Run now are kept in this browser, and confirming one adds a real record to its goal.</AlertDescription></Alert>
      <ImportQueue mode={empty ? "empty" : "default"} />
    </>
  );
}

export const SettingsScreen = () => <><PageHeader title="Settings" description="Preferences for you and your groups." /><SettingsTabs /></>;

