import Link from "next/link";
import { Clock, Dumbbell, Landmark, ListChecks, PiggyBank, Plus, Target, Users } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/app/primitives";
import { MyGoalChart } from "./charts";
import { groups, members, ME, myActivity, type GoalType, type MyGoalDetail } from "@/lib/demo-data";
import { goalPath } from "@/lib/screens";
import type { ViewAs } from "@/lib/view-as";
import { OwnerOnly, RoleBadge } from "@/components/app/view-as";

const base = "/design-preview";
const goalIcon: Record<GoalType, typeof Landmark> = { loan: Landmark, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
// The accordion panel underlines links and spaces paragraphs by default; dashboard panels hold cards, so turn both off.
const panel = "[&_a]:no-underline [&_p:not(:last-child)]:mb-0";

// ---------- One goal's dashboard (inner accordion panel) ----------
function GoalDashboard({ g, viewAs }: { g: MyGoalDetail; viewAs: ViewAs }) {
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

const roleNote: Record<ViewAs, string> = {
  owner: "You can add records and change any goal in these groups.",
  member: "You can view and monitor. Only the group Owner can add records or change goals.",
  admin: "Read-only access to every group.",
};

// ---------- Dashboard: groups (outer accordion) > goals (inner accordion) ----------
export function DashboardScreen({ viewAs }: { viewAs: ViewAs }) {
  const me = members.find((m) => m.id === ME)!;
  const admin = viewAs === "admin";
  // A System Admin sees every goal in every active group; Owners and Members see the goals they joined.
  const rows = admin
    ? groups.filter((g) => !g.archived).map((g) => ({ g, last: "", goals: g.goals.map((x) => ({ ...x, detail: undefined as MyGoalDetail | undefined })) }))
    : myActivity.map((a) => ({ g: groups.find((g) => g.id === a.groupId)!, last: a.last, goals: a.goals.map((x) => ({ ...x, detail: x as MyGoalDetail | undefined })) }));
  return (
    <>
      <PageHeader
        title={admin ? "All groups" : `Welcome back, ${me.name}`}
        description={admin ? "Every group and goal on eShareGoal, read-only." : "Your groups and goals. Open a goal to see your activity in it."}
        actions={<OwnerOnly><Link href={`${base}/new-goal`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link></OwnerOnly>}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">You are viewing as</span><RoleBadge className="text-sm" />
        <span className="text-muted-foreground">{roleNote[viewAs]}</span>
      </div>
      <Accordion multiple defaultValue={[rows[0].g.id]} className="gap-3">
        {rows.map(({ g, last, goals }) => (
          <AccordionItem key={g.id} value={g.id} className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
            <AccordionTrigger className="min-w-0 items-center gap-3 px-4 py-3.5 hover:no-underline">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-base font-medium">{g.name}<RoleBadge /></span>
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
                          ? <GoalDashboard g={goal.detail} viewAs={viewAs} />
                          : <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"><span className="text-muted-foreground">System admins have no activity of their own. Open the goal to see every record.</span><Link href={goalPath({ ...goal, joined: true }, viewAs)} className={buttonVariants({ variant: "outline", size: "sm" })}>Open {goal.name}</Link></div>}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
              <Link href={`${base}/group?group=${g.id}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-3`}>Open {g.name} group</Link>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  );
}

export const DashboardEmpty = () => <><PageHeader title="Welcome to eShareGoal" /><EmptyState title="You have not joined a group yet" body="Create a group or enter an invitation code. Your groups and goals will show up here." cta={{ label: "New group", href: `${base}/groups` }} /></>;
