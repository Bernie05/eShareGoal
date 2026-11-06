import Link from "next/link";
import { Clock, Dumbbell, Car, Landmark, ListChecks, PiggyBank, Plus, Target, Trophy, UserRound, Users, Flag } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/app/primitives";
import { users, type UserStatus } from "@/lib/users-data";
import { reports } from "@/lib/reports-data";
import type { GoalRequest } from "@/lib/goal-requests";
import type { Template } from "@/lib/goal-templates";
import { MetricCard, type Metric } from "@/components/app/metric-card";
import { TemplatesMetric } from "@/components/app/admin-metrics";
import { MyGoalChart } from "./charts";
import { groups, myActivityFor, type GoalType, type MyGoalDetail } from "@/lib/demo-data";
import { ACCOUNTS, createdGroupsFor, membersOf, roleIn, sampleGroupsFor, type Account } from "@/lib/accounts";
import { goalPath } from "@/lib/screens";
import type { CreatedGroup, ViewAs } from "@/lib/view-as";
import { CreatedGoalAccordionItem } from "./goal-page";
import { fmtDate } from "@/lib/money";
import type { CreatedGoal } from "@/lib/created-goals";
import { OwnerOnly, RoleBadge } from "@/components/app/view-as";
import { MyInvitations } from "@/components/app/join-group";
import { BASE_PATH } from "@/lib/constants";


interface AdminMetricsProps {
  requests: GoalRequest[];
  created: CreatedGroup[];
  newGoals: CreatedGoal[];
  templates: Template[];
}
// ---------- System Admin: site-wide numbers, each as "this many of the total" ----------
/** requests: Owners' goal type requests (shown in Reports). created / newGoals: groups and goals made in the preview. templates: goal templates. */
function AdminMetrics({ requests, created, newGoals, templates }: AdminMetricsProps) {
  // Users: active of every user account (the System Admin is not counted).
  const people = users.filter((u) => u.site === "User");
  const usersBy = (st: UserStatus) => people.filter((u) => u.status === st).length;
  // Reports: an issue is active while Open or In review. Goal type requests count as reports (Open until built or rejected).
  const all = [...reports.map((r) => ({ status: r.status, high: r.priority === "High" })), ...requests.map((r) => ({ status: r.status === "Built" ? "Resolved" : r.status === "Rejected" ? "Dismissed" : "Open", high: false }))];
  const activeReports = all.filter((r) => r.status === "Open" || r.status === "In review");
  // Groups (parent) and their goals (sub goals): live sample groups, plus the ones made in the preview.
  const live = groups.filter((g) => !g.archived);
  const sampleGoals = live.flatMap((g) => g.goals);
  const goalCount = sampleGoals.length + newGoals.length;
  const done = sampleGoals.filter((x) => x.status === "Completed" || x.progress >= 100);
  const closest = sampleGoals.filter((x) => !done.includes(x) && x.status === "Active").sort((x, y) => y.progress - x.progress)[0];
  const paused = sampleGoals.filter((x) => x.status === "Paused").length + newGoals.filter((x) => x.status === "Paused").length;
  const metrics: Metric[] = [
    { label: "Active users", Icon: UserRound, value: usersBy("Active"), total: people.length, tone: "success", href: `${BASE_PATH}/users`, link: "Open Users",
      details: [`${usersBy("Pending review")} pending review · ${usersBy("Invited")} invited`, `${usersBy("Rejected")} rejected · ${usersBy("Revoked")} revoked`] },
    { label: "Active issues", Icon: Flag, value: activeReports.length, total: all.length, unit: "reports", tone: "primary", href: `${BASE_PATH}/reports`, link: "Open Reports",
      details: [`${all.filter((r) => r.status === "Open").length} open · ${all.filter((r) => r.status === "In review").length} in review`, `${activeReports.filter((r) => r.high).length} high priority · ${all.length - activeReports.length} closed`] },
    { label: "Goals achieved", Icon: Trophy, value: done.length, total: goalCount, unit: "goals", tone: "success", href: `${BASE_PATH}/goals`, link: "Open All goals",
      details: [closest ? `Closest: ${closest.name} (${closest.progress}%)` : "No active goal", `${goalCount - done.length} still in progress`] },
    { label: "Groups and goals", Icon: Users, value: live.length + created.length, unit: `groups · ${goalCount} goals`, href: `${BASE_PATH}/dashboard`, link: "See every group below",
      details: ["Groups are the parent; goals are the sub goals inside them", `Goals: ${goalCount - paused} active · ${paused} paused`] },
  ];
  // Templates and workflows partly live in this browser (email templates, workflows), so those two cards render on the client.
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((m) => <MetricCard key={m.label} m={m} />)}<TemplatesMetric goal={templates.map((t) => t.status)} /></div>;
}
const goalIcon: Record<GoalType, typeof Landmark> = { loan: Car, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
// The accordion panel underlines links and spaces paragraphs by default; dashboard panels hold cards, so turn both off.
const panel = "[&_a]:no-underline [&_p:not(:last-child)]:mb-0";

interface GoalDashboardProps {
  g: MyGoalDetail;
  viewAs: ViewAs;
}
// ---------- One goal's dashboard (inner accordion panel) ----------
function GoalDashboard({ g, viewAs }: GoalDashboardProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {g.stats.map((s) => <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <Card size="sm" className="lg:col-span-3">
          <CardHeader><CardTitle>{g.chart.title}, last 12 months</CardTitle></CardHeader>
          <CardContent><MyGoalChart data={g.chart.data} unit={g.chart.unit} label={g.chart.title} /></CardContent>
        </Card>
        <Card size="sm" className="lg:col-span-2">
          <CardHeader><CardTitle>Your recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {g.recent.filter(([what]) => viewAs === "owner" || !what.startsWith("Confirmed")).map(([what, when]) => (
                <li key={what + when} className="flex items-start justify-between gap-3"><span>{what}</span><span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" aria-hidden />{when}</span></li>
              ))}
            </ul>
            <Link href={goalPath({ ...g, joined: true }, viewAs)} className={buttonVariants({ variant: "outline", size: "sm" })}>Open {g.name}</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


interface DashboardScreenProps {
  account: Account;
  created: CreatedGroup[];
  newGoals?: CreatedGoal[];
  requests?: GoalRequest[];
  templates?: Template[];
}
// ---------- Dashboard: groups (outer accordion) > goals (inner accordion) ----------
// account: who is looking. created: every created group (this account sees the ones it is in).
// Roles are per group: the same user is Owner where they own the group and Member elsewhere.
export function DashboardScreen({ account, created, newGoals = [], requests = [], templates = [] }: DashboardScreenProps) {
  const me = ACCOUNTS[account];
  const admin = account === "admin";
  const role = (groupId: string): ViewAs => roleIn(account, groupId, created) ?? "member";
  const mineCreated = createdGroupsFor(account, created);
  // A System Admin sees every goal in every active group; a user sees the goals they joined, with their own numbers.
  const rows = admin
    ? sampleGroupsFor(account).map((g) => ({ g, last: "", goals: g.goals.map((x) => ({ ...x, detail: undefined as MyGoalDetail | undefined })) }))
    : myActivityFor(me.name).map((a) => ({ g: sampleGroupsFor(account).find((g) => g.id === a.groupId)!, last: a.last, goals: a.goals.map((x) => ({ ...x, detail: x as MyGoalDetail | undefined })) }));
  const roles = [...rows.map(({ g }) => g), ...mineCreated].map((g) => ({ name: g.name, r: role(g.id) }));
  const where = (r: ViewAs) => roles.filter((x) => x.r === r).map((x) => x.name).join(", ");
  const note = admin ? "Read-only access to every group."
    : [where("owner") && `Owner of ${where("owner")} (you add records and change goals there)`, where("member") && `Member of ${where("member")} (view only)`].filter(Boolean).join(" · ") || "You are not in a group yet.";
  return (
    <>
      <PageHeader
        title={admin ? "All groups" : `Welcome back, ${me.name}`}
        description={admin ? "Every group and goal on eShareGoal, read-only." : "Your groups and goals. Open a goal to see your activity in it."}
        actions={<><OwnerOnly><Link href={`${BASE_PATH}/new-goal`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link></OwnerOnly></>}
      />
      <MyInvitations />
      {admin && <AdminMetrics requests={requests} created={created} newGoals={newGoals} templates={templates} />}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">You are viewing as</span>{admin ? <RoleBadge role="admin" className="text-sm" /> : <span className="font-medium">{me.label}</span>}
        <span className="text-muted-foreground">{note}</span>
      </div>
      <Accordion multiple defaultValue={[rows[0]?.g.id ?? mineCreated[0]?.id ?? ""]} className="gap-3">
        {rows.map(({ g, last, goals }) => (
          <AccordionItem key={g.id} value={g.id} className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
            <AccordionTrigger className="min-w-0 items-center gap-3 px-4 py-3.5 hover:no-underline">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-base font-medium">{g.name}<RoleBadge role={role(g.id)} /></span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {g.members} members · {admin ? `${g.goals.length} goals` : `${goals.length} of ${g.goals.length} goals joined · last activity ${last}`}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className={`px-4 pt-1 pb-4 ${panel}`}>
              <Accordion multiple defaultValue={[goals[0].id]} className="gap-2">
                {goals.map((goal) => {
                  const Icon = goalIcon[goal.type];
                  return (
                    <AccordionItem key={goal.id} value={goal.id} className="rounded-lg border not-last:border-b">
                      <AccordionTrigger className="min-w-0 items-center gap-3 px-3 py-2.5 hover:no-underline">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-2">{goal.name}<StatusBadge status="Active" /></span>
                          <span className="flex items-center gap-3"><span className="block h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, goal.progress)}%` }} /></span><span className="num w-24 text-right text-xs text-muted-foreground">{goal.progress}% done</span></span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">{goal.metric}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className={`px-3 pt-1 pb-3 ${panel}`}>
                        {goal.detail
                          ? <GoalDashboard g={goal.detail} viewAs={role(g.id)} />
                          : <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"><span className="text-muted-foreground">System admins have no activity of their own. Open the goal to see every record.</span><Link href={goalPath({ ...goal, joined: true }, "admin")} className={buttonVariants({ variant: "outline", size: "sm" })}>Open {goal.name}</Link></div>}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
                {newGoals.filter((x) => x.groupId === g.id).map((x) => <CreatedGoalAccordionItem key={x.id} g={x} members={membersOf(g.id, created)} panelClass={panel} />)}
              </Accordion>
              <Link href={`${BASE_PATH}/group?group=${g.id}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-3`}>Open {g.name} group</Link>
            </AccordionContent>
          </AccordionItem>
        ))}
        {mineCreated.map((g) => { // created groups: same item as the sample groups
          const mine = newGoals.filter((x) => x.groupId === g.id);
          const people = membersOf(g.id, created);
          const r = role(g.id);
          return (
            <AccordionItem key={g.id} value={g.id} className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
              <AccordionTrigger className="min-w-0 items-center gap-3 px-4 py-3.5 hover:no-underline">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-base font-medium">{g.name}<RoleBadge role={r} /></span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{people.length} {people.length === 1 ? "member" : "members"} · {mine.length} {mine.length === 1 ? "goal" : "goals"} · created {fmtDate(g.created)}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className={`px-4 pt-1 pb-4 ${panel}`}>
                {mine.length
                  ? <Accordion multiple defaultValue={[mine[0].id]} className="gap-2">{mine.map((x) => <CreatedGoalAccordionItem key={x.id} g={x} members={people} panelClass={panel} />)}</Accordion>
                  : <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"><span className="text-muted-foreground">No goals yet.{r === "owner" && " As the Owner you can add the first one."}</span>{r === "owner" && <Link href={`${BASE_PATH}/new-goal?group=${g.id}`} className={buttonVariants({ size: "sm" })}><Plus aria-hidden /> Add a goal</Link>}</div>}
                <Link href={`${BASE_PATH}/group?group=${g.id}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-3`}>Open {g.name} group</Link>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
}

export const DashboardEmpty = () => <><PageHeader title="Welcome to eShareGoal" /><MyInvitations /><EmptyState title="You have not joined a group yet" body="Create a group, or accept an invitation when a group's Owner invites you. Your groups and goals will show up here." cta={{ label: "New group", href: `${BASE_PATH}/groups` }} /></>;
