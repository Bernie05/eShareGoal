import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Download, Dumbbell, Info, Landmark, ListChecks, PiggyBank, Plus, Search, Target, Users, Wallet, CircleCheck, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, ProgressBar, SectionTitle, StatCard, StatusBadge, Unavailable, toneText } from "@/components/app/primitives";
import { ByMemberChart, InOutChart, MonthlyContributionsChart } from "./charts";
import { AddTransactionDialog, ImportQueue, MemberContributions } from "./interactive";
import { TransactionForm } from "./transaction-form";
import { SettingsTabs } from "./settings";
import { groupDetails, groups, loan, members, nextDue, rosterFor, TODAY, totals, transactions, upcoming, type Goal, type GoalType } from "@/lib/demo-data";
import type { ViewAs } from "@/lib/view-as";
import { OwnerOnly, RoleBadge } from "@/components/app/view-as";
import { addMonths, fmtDate, peso } from "@/lib/money";
import { goalPath } from "@/lib/screens";
import { cn } from "@/lib/utils";

const base = "/design-preview";
export const goalIcon: Record<GoalType, typeof Landmark> = { loan: Landmark, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
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
          <ProgressBar value={g.progress} label={`${g.name} progress`} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>{g.metric}</span><span className="num font-medium text-foreground">{g.progress}%</span></div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------- Group list ----------
export function GroupsScreen({ viewAs }: { viewAs: ViewAs }) {
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);
  return (
    <>
      <PageHeader title="My Groups" description="Workspaces you share with family, friends and teams." actions={viewAs !== "admin" && <Button><Plus aria-hidden /> New group</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {active.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>{g.name}</CardTitle>
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
      </div>
      <SectionTitle>Archived</SectionTitle>
      {archived.map((g) => (
        <Card key={g.id} size="sm"><CardContent className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-medium">{g.name} <Badge variant="secondary">Archived</Badge></p><p className="text-xs text-muted-foreground">{g.description} Read-only. Restore or delete permanently.</p></div>
          <OwnerOnly><div className="flex gap-2"><Button variant="outline" size="sm">Restore</Button><Button variant="destructive" size="sm">Delete…</Button></div></OwnerOnly>
        </CardContent></Card>
      ))}
    </>
  );
}

export const GroupsEmpty = () => <><PageHeader title="My Groups" /><EmptyState title="Create your first group" body="A group is a shared workspace. Invite people, then add goals like a loan, a savings fund or a fitness challenge." cta={{ label: "New group", href: `${base}/groups` }} /></>;

// ---------- All goals ----------
export function GoalsScreen({ viewAs }: { viewAs: ViewAs }) {
  const active = groups.filter((g) => !g.archived && g.goals.length);
  const all = active.flatMap((g) => g.goals);
  return (
    <>
      <PageHeader title="All Goals" description={viewAs === "admin" ? `${all.length} goals across all groups. As System Admin you can open any of them, read-only.` : `${all.length} goals across your groups. You joined ${all.filter((x) => x.joined).length}. Open a card to see the goal.`} actions={<OwnerOnly><Link href={`${base}/new-goal`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link></OwnerOnly>} />
      {active.map((g) => (
        <section key={g.id} aria-labelledby={`goals-${g.id}`} className="space-y-3">
          <SectionTitle aside={viewAs !== "admin" && <span className="text-xs text-muted-foreground">{g.goals.filter((x) => x.joined).length} of {g.goals.length} joined</span>}><span id={`goals-${g.id}`}>{g.name}</span></SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{g.goals.map((x) => <GoalCard key={x.id} g={x} viewAs={viewAs} showJoined={viewAs !== "admin"} />)}</div>
        </section>
      ))}
    </>
  );
}

export const GoalsEmpty = () => <><PageHeader title="All Goals" /><EmptyState title="No goals yet" body="Goals live inside groups. Open a group and add a loan, a savings fund or a challenge." cta={{ label: "New goal", href: `${base}/new-goal` }} /></>;

// ---------- Group overview ----------
export function GroupScreen({ id, viewAs }: { id?: string; viewAs: ViewAs }) {
  const g = groups.find((x) => x.id === id && !x.archived) ?? groups[0];
  const detail = groupDetails[g.id];
  const { funds, invite, activity } = detail;
  const roster = rosterFor(detail, viewAs);
  const owner = viewAs === "owner";
  return (
    <>
      <PageHeader title={g.name} description={g.description} actions={<OwnerOnly><Button variant="outline">Edit group</Button><Button variant="outline">Archive</Button><Button><Plus aria-hidden /> New goal</Button></OwnerOnly>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Available Group Funds" value={peso(funds)} tone="success" icon={Wallet} hint="Deposits (incl. pending) minus payments and expenses" />
        <StatCard label="Active goals" value={g.goals.length} icon={Target} hint="Progress is shown per goal, never summed across units" />
        <StatCard label="Members" value={g.members} icon={Users} hint={viewAs === "admin" ? "System Admin is not counted" : `You are ${owner ? "the Owner" : "a Member"}`} />
      </div>
      <SectionTitle>Goals</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{g.goals.map((x) => <GoalCard key={x.id} g={x} viewAs={viewAs} />)}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={owner ? "lg:col-span-2" : "lg:col-span-3"}>
          <CardHeader><CardTitle>Members and roles</CardTitle><CardDescription>The Owner changes anything; Members can only view. Roles are enforced by the server in production; the UI only hides actions.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y">
              {roster.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium">{m.name}{m.you && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                  <span className="flex items-center gap-2"><RoleBadge role={m.role === "Owner" ? "owner" : "member"} />{owner && !m.you && <Button variant="ghost" size="sm">Change role</Button>}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
              <span><span className="font-medium">System Admin</span>{viewAs === "admin" && <span className="text-muted-foreground"> (you)</span>} <span className="text-muted-foreground">· has access to every group · not counted in members, totals or charts</span></span>
              <RoleBadge role="admin" />
            </div>
          </CardContent>
        </Card>
        {owner && <Card>
          <CardHeader><CardTitle>Invite people</CardTitle><CardDescription>Share this code. Real invitations need email delivery from the backend.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2"><code className="font-mono text-sm">{invite}</code><Button variant="ghost" size="icon-sm" aria-label="Copy invitation code"><Copy aria-hidden /></Button></div>
          </CardContent>
        </Card>}
      </div>
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
export function SharedMoneyScreen() {
  const target = 30_000_000, saved = 12_600_000;
  const pct = Math.round((saved / target) * 100);
  return (
    <>
      <PageHeader title="Emergency Fund" description="Shared savings for the family. Target ₱300,000 by Dec 31, 2027." actions={<OwnerOnly><AddTransactionDialog /><Button variant="outline">Goal settings</Button></OwnerOnly>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saved so far" value={peso(saved)} tone="success" icon={PiggyBank} hint={`${pct}% of target`} />
        <StatCard label="Remaining to target" value={peso(target - saved)} icon={Target} hint="14 months left" />
        <StatCard label="Available balance" value={peso(saved - 1_850_000)} icon={Wallet} hint="After withdrawals" />
        <StatCard label="Monthly pace needed" value={peso(Math.ceil((target - saved) / 14))} icon={CalendarClock} hint="To reach the target on time" />
      </div>
      <Card><CardContent className="space-y-2"><div className="flex justify-between text-sm"><span className="font-medium">Progress to target</span><span className="num">{pct}%</span></div><ProgressBar value={pct} label="Progress to target" /></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Monthly contributions</CardTitle></CardHeader><CardContent><MonthlyContributionsChart /></CardContent></Card>
        <Card><CardHeader><CardTitle>By member</CardTitle></CardHeader><CardContent><ByMemberChart /></CardContent></Card>
      </div>
      <SectionTitle>Contributions by member</SectionTitle>
      <MemberContributions />
      <Milestones items={[["₱50,000 saved", "Done", "Mar 2026"], ["₱100,000 saved", "Done", "Aug 2026"], ["₱200,000 saved", "Upcoming", "Mar 2027"], ["₱300,000 saved", "Upcoming", "Dec 2027"]]} />
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
export function LoanScreen({ noSchedule = false }: { noSchedule?: boolean }) {
  const na = <Unavailable why="No loan schedule is configured" />;
  const sched = [
    ...Array.from({ length: 3 }, (_, i) => ({ n: totals.installmentsDone - 2 + i, date: addMonths(loan.firstDue, totals.installmentsDone - 3 + i), paid: true })),
    ...upcoming.map((u) => ({ n: u.n, date: u.date, paid: false })),
  ];
  return (
    <>
      <PageHeader title="Car Credit" description="Family loan with a fixed 60-month schedule. Figures below come from records, not estimates." actions={<><OwnerOnly><AddTransactionDialog /></OwnerOnly><Link href={`${base}/transactions`} className={buttonVariants({ variant: "outline" })}>All transactions</Link></>} />
      {noSchedule && <Alert><Info aria-hidden /><AlertTitle>No loan schedule yet</AlertTitle><AlertDescription>Set the monthly amount, term and first due date to see the balance and due dates. Member contributions are never used to estimate the loan balance.</AlertDescription></Alert>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Contributions" value={peso(totals.contributions)} icon={ArrowDownLeft} tone="success" hint="Deposited into the shared fund" />
        <StatCard label="Available Group Funds" value={peso(totals.available)} icon={Wallet} hint="Fund balance now (pending deposits included)" />
        <StatCard label="Total Paid to Lender" value={noSchedule ? peso(0) : peso(totals.paidToLender)} icon={ArrowUpRight} tone="danger" hint="Confirmed lender payments" />
        <StatCard label="Installments Completed" value={noSchedule ? na : `${totals.installmentsDone}/${loan.term}`} icon={ListChecks} hint={noSchedule ? undefined : `${totals.pct}% of schedule`} />
        <StatCard label="Remaining Loan Balance" value={noSchedule ? na : peso(totals.remaining)} icon={Landmark} hint="From the configured schedule" />
        <StatCard label="Next Payment Due" value={noSchedule ? na : fmtDate(nextDue)} icon={CalendarClock} tone={noSchedule ? undefined : "warning"} hint={noSchedule ? undefined : `${peso(loan.monthly)} · in 11 days`} />
      </div>
      {!noSchedule && (
        <>
          <Card><CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span className="font-medium">Loan repayment progress</span><span className="num">{peso(totals.paid)} of {peso(totals.total)}</span></div>
            <ProgressBar value={totals.pct} label="Loan repayment progress" />
          </CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Monthly contributions</CardTitle></CardHeader><CardContent><MonthlyContributionsChart /></CardContent></Card>
            <Card><CardHeader><CardTitle>Contributions by member</CardTitle></CardHeader><CardContent><ByMemberChart /></CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Deposits vs. payments and expenses</CardTitle></CardHeader><CardContent><InOutChart /></CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Schedule</CardTitle><CardDescription>Next installments and the latest paid ones.</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{sched.map((r) => (
                    <TableRow key={r.n}><TableCell className="num">{r.n}</TableCell><TableCell>{fmtDate(r.date)}</TableCell><TableCell className="num text-right">{peso(loan.monthly)}</TableCell><TableCell><StatusBadge status={r.paid ? "Confirmed" : r.date < TODAY ? "Overdue" : "Upcoming"} /></TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
              <CardContent>
                <ol className="relative ml-2 space-y-3 border-l pl-5">
                  {transactions.filter((t) => t.type === "loan_payment").slice(0, 5).map((t) => (
                    <li key={t.id} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-success ring-4 ring-background" aria-hidden />
                      <span className="font-medium">{t.notes}</span> <span className="num text-destructive">-{peso(t.amount)}</span><span className="block text-xs text-muted-foreground">{fmtDate(t.date)} · {t.method} · {t.ref}</span></li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <SectionTitle>Contributions by member</SectionTitle>
      {noSchedule ? <MemberContributions /> : <MemberContributions />}
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
const templates = [
  [Wallet, "Shared Money", "Savings, deposits, withdrawals and balances"],
  [Landmark, "Loan and Installments", "Fixed schedule, payments and remaining balance"],
  [Dumbbell, "Fitness and Health", "Weight, exercise and weekly updates"],
  [ListChecks, "Tasks and Milestones", "Assigned tasks, deadlines and status"],
  [Target, "Custom Goal", "Your own target, unit and records"],
] as const;
export function NewGoalScreen({ viewAs }: { viewAs: ViewAs }) {
  if (viewAs !== "owner") return <><PageHeader title="Create a goal" /><Alert><Info aria-hidden /><AlertTitle>Only the group Owner can create goals</AlertTitle><AlertDescription>{viewAs === "admin" ? "System Admins have view-only access to every group." : "Members can view and monitor goals. Ask the Owner to add the goal."}</AlertDescription></Alert></>;
  return (
    <>
      <PageHeader title="Create a goal" description="Step 1 of 2: pick a template. Step 2 shows the fields for that template." />
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Goal template</legend>
        {templates.map(([Icon, name, desc], i) => (
          <label key={name} className="relative cursor-pointer">
            <input type="radio" name="tpl" defaultChecked={i === 1} className="peer sr-only" />
            <Card className="h-full transition-colors peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><CardContent className="space-y-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
              <p className="font-medium">{name}</p><p className="text-sm text-muted-foreground">{desc}</p>
            </CardContent></Card>
          </label>
        ))}
      </fieldset>
      <Card>
        <CardHeader><CardTitle>Loan and Installments details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[["g-name", "Goal name", "Car Credit"], ["g-amt", "Monthly amortization (₱)", "24000.00"], ["g-term", "Term (months)", "60"], ["g-first", "First due date", ""]].map(([id, l, v]) => (
            <div key={id} className="space-y-1.5"><Label htmlFor={id}>{l}</Label><Input id={id} defaultValue={v} type={id === "g-first" ? "date" : "text"} /></div>
          ))}
          <div className="space-y-1.5"><Label htmlFor="g-group">Group</Label><NativeSelect id="g-group"><option>Family</option><option>Friends</option></NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="g-status">Status</Label><NativeSelect id="g-status"><option>Active</option><option>Paused</option><option>Completed</option><option>Archived</option></NativeSelect></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="outline">Back</Button><Button>Create goal</Button></div>
        </CardContent>
      </Card>
    </>
  );
}

// ---------- Transactions ----------
export function TransactionsScreen() {
  const rows = transactions.slice(0, 10);
  return (
    <>
      <PageHeader title="Transactions" description="Car Credit · all records, newest first. Corrections are added as new rows; history is never overwritten." actions={<><Button variant="outline"><Download aria-hidden /> Export CSV</Button><OwnerOnly><AddTransactionDialog /></OwnerOnly></>} />
      <Card><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="f-q">Search</Label><div className="relative"><Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden /><Input id="f-q" className="pl-8" placeholder="Reference or note" /></div></div>
        {[["f-m", "Member", ["All", ...members.map((m) => m.name)]], ["f-t", "Type", ["All", "Deposit", "Loan payment", "Expense", "Withdrawal"]], ["f-s", "Status", ["All", "Confirmed", "Pending", "Reversed"]], ["f-src", "Source", ["All", "Manual", "Imported"]]].map(([id, l, o]) => (
          <div key={id as string} className="space-y-1.5"><Label htmlFor={id as string}>{l as string}</Label><NativeSelect id={id as string}>{(o as string[]).map((x) => <option key={x}>{x}</option>)}</NativeSelect></div>
        ))}
        <div className="space-y-1.5"><Label htmlFor="f-from">From</Label><Input id="f-from" type="date" /></div>
        <div className="space-y-1.5"><Label htmlFor="f-to">To</Label><Input id="f-to" type="date" /></div>
      </CardContent></Card>
      <Card><CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((t) => (
            <TableRow key={t.id} className={cn(t.status === "reversed" && "text-muted-foreground line-through decoration-muted-foreground/50")}>
              <TableCell>{fmtDate(t.date)}</TableCell><TableCell>{members.find((m) => m.id === t.memberId)?.name}</TableCell>
              <TableCell>{t.type === "deposit" ? "Deposit" : t.type === "loan_payment" ? "Loan payment" : t.type === "expense" ? "Expense" : "Withdrawal"}</TableCell>
              <TableCell>{t.method}</TableCell><TableCell className="font-mono text-xs">{t.ref ?? "-"}</TableCell><TableCell>{t.source === "imported" ? "Imported" : "Manual"}</TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
              <TableCell className={cn("num text-right font-medium", t.type === "deposit" ? toneText.success : toneText.danger)}>{t.type === "deposit" ? "+" : "-"}{peso(t.amount)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground"><span>Showing 1-10 of {transactions.length}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled>Previous</Button><Button variant="outline" size="sm">Next</Button></div></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Append-only. Latest changes first.</CardDescription></CardHeader><CardContent><ul className="divide-y text-sm">{[["Babylyn", "reversed a duplicate expense of ₱4,800.00 (DEMO-DUP02)", "Aug 2, 2026 4:12 PM"], ["Bernz", "changed Billy's deposit from Pending to Confirmed", "Oct 3, 2026 10:02 AM"]].map(([w, a, d]) => (
        <li key={a} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{w}</span> {a}</span><span className="text-muted-foreground">{d}</span></li>))}</ul></CardContent></Card>
    </>
  );
}

export const TransactionsEmpty = () => <><PageHeader title="Transactions" actions={<OwnerOnly><AddTransactionDialog /></OwnerOnly>} /><EmptyState title="No transactions yet" body="Add the first deposit or lender payment, or import from email once Gmail is connected." /></>;

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
      <PageHeader title="Import review" description="Candidates found in bank notification emails. Nothing becomes a record until you confirm it." actions={<OwnerOnly><Button variant="outline">Sync now</Button><Link href={`${base}/settings`} className={buttonVariants({ variant: "outline" })}>Import rules</Link></OwnerOnly>} />
      <Alert><Info aria-hidden /><AlertTitle>Simulation</AlertTitle><AlertDescription>These emails are fictional samples from a mock Gmail service. No account is connected.</AlertDescription></Alert>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary" className="bg-warning-soft text-warning">2 pending review</Badge><Badge variant="secondary">1 duplicate</Badge><Badge variant="secondary">1 confirmed</Badge><Badge variant="secondary" className="bg-destructive-soft text-destructive">1 error</Badge>
      </div>
      <ImportQueue mode={empty ? "empty" : "default"} />
    </>
  );
}

export const SettingsScreen = () => <><PageHeader title="Settings" description="Preferences for you and your groups." /><SettingsTabs /></>;

