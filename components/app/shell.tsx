"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, type ReactNode } from "react";
import {
  Activity, Bell, ChevronDown, ChevronRight, Crown, Flag, Inbox, LayoutTemplate, Mail, Dumbbell, Home, Car, Landmark, LayoutGrid, Menu, Moon, PiggyBank,
  Plus, Search, ShieldCheck, Sun, Target, UserCog, Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { groups, type GoalType } from "@/lib/demo-data";
import { ACCOUNTS, createdGroupsFor, navRole, roleIn, sampleGroupsFor, type Account } from "@/lib/accounts";
import { canOpen, goalPath, screens, settingsGroups, settingsHref } from "@/lib/screens";
import { openReports } from "@/lib/reports-data";
import type { CreatedGroup, EmailMode } from "@/lib/view-as";
import type { CreatedGoal } from "@/lib/created-goals";
import { ApprovalsBell } from "./approvals";
import { PendingImportsBadge } from "./import-review";
import { RemindersBell } from "./reminders";
import { CreateGroupDialog } from "./create-group";
import { templateIcon } from "./dashboard-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountProvider, CreatedGoalsProvider, CreatedGroupsProvider, EmailModeProvider, useAccount, useCreatedGoals, OwnerOnly, useCreatedGroups, useViewAs, ViewAsProvider, ViewAsSwitch } from "./view-as";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";
import { BASE_PATH } from "@/lib/constants";

type Identity = { name: string; email: string; initials: string };
const goalIcon: Record<GoalType, typeof Landmark> = { loan: Car, shared_money: PiggyBank, fitness: Dumbbell, tasks: Target, custom: Target };

const nav = [
  { label: "Dashboard", icon: Home, href: `${BASE_PATH}/dashboard` },
  { label: "My Groups", icon: Users, href: `${BASE_PATH}/groups` },
  { label: "All Goals", icon: LayoutGrid, href: `${BASE_PATH}/goals` },
  { label: "Import review", icon: Inbox, href: `${BASE_PATH}/import` },
  { label: "Activity History", icon: Activity, href: `${BASE_PATH}/activity` },
  { label: "Users", icon: UserCog, href: `${BASE_PATH}/users` },
  { label: "Reports", icon: Flag, href: `${BASE_PATH}/reports`, badge: String(openReports) },
  { label: "Goal Templates", icon: LayoutTemplate, href: `${BASE_PATH}/templates` },
  { label: "Email Templates", icon: Mail, href: `${BASE_PATH}/email-templates` },
];

interface NavLinkProps {
  href: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}
function NavLink({ href, active, className, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring", active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground", className)}
    >
      {children}
    </Link>
  );
}

interface GoalNavItemProps {
  goal: CreatedGoal;
  isActive: (href: string) => boolean;
}
function GoalNavItem({ goal, isActive }: GoalNavItemProps) {
  const Icon = templateIcon[goal.template.icon];
  const href = `${BASE_PATH}/my-goal?goal=${goal.id}`;
  return <li><NavLink href={href} active={isActive(href)} className="py-1.5"><Icon className="size-3.5 text-muted-foreground" aria-hidden /><span className="truncate">{goal.name}</span></NavLink></li>;
}

function SidebarBody() {
  const viewAs = useViewAs();
  const account = useAccount();
  const created = useCreatedGroups();
  const newGoals = useCreatedGoals();
  const path = usePathname();
  const params = useSearchParams();
  // Same path, and every ?key=value in the link matches the current URL (goal and group pages share one path).
  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    return p === path && [...new URLSearchParams(q).entries()].every(([k, v]) => params.get(k) === v);
  };
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link href={BASE_PATH} className="flex items-center gap-2 px-2 py-1.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Target className="size-4" aria-hidden /></span>
        <span className="text-base font-semibold tracking-tight">eShareGoal</span>
      </Link>
      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {nav.filter((n) => canOpen(n.href.split("/").pop()!, viewAs)).map((n) => ( // each link only for roles that may open it
            <li key={n.href}>
              <NavLink href={n.href} active={isActive(n.href)}>
                <n.icon className="size-4" aria-hidden /><span className="flex-1">{n.label}</span>
                {n.href.endsWith("/import") && <PendingImportsBadge />}
                {n.badge && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{n.badge}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <div>
          <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Groups</p>
          <ul className="space-y-0.5">
            {/* The groups this account is in (System Admin: all). Sample and created groups share one tree, so they look and work the same. */}
            {[...sampleGroupsFor(account), ...(createdGroupsFor(account, created).map((g) => ({ id: g.id, name: g.name, goals: [] as typeof groups[number]["goals"] })))].map((g) => (
              <li key={g.id}>
                <Collapsible defaultOpen={g.id === "family"}>
                  <div className="group/row flex items-center">
                    <CollapsibleTrigger aria-label={`Toggle ${g.name} goals`} className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring [&[data-panel-open]>svg]:rotate-90">
                      <ChevronRight className="size-4 transition-transform" aria-hidden />
                    </CollapsibleTrigger>
                    <NavLink href={`${BASE_PATH}/group?group=${g.id}`} className="flex-1 py-1.5" active={isActive(`${BASE_PATH}/group?group=${g.id}`)}>{roleIn(account, g.id, created) === "owner" && <Crown className="size-3.5 shrink-0 text-primary" aria-label="You own this group" />}<span className="truncate">{g.name}</span></NavLink>
                  </div>
                  <CollapsibleContent>
                    <ul className="ml-3.5 space-y-0.5 border-l border-sidebar-border pl-2">
                      {g.goals.map((goal) => {
                        const Icon = goalIcon[goal.type];
                        const href = goalPath(goal, roleIn(account, g.id, created) ?? "member");
                        return (
                          <li key={goal.id}>
                            <NavLink href={href} active={isActive(href)} className="py-1.5">
                              <Icon className="size-3.5 text-muted-foreground" aria-hidden /><span className="truncate">{goal.name}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                      {newGoals.filter((x) => x.groupId === g.id).map((x) => <GoalNavItem key={x.id} goal={x} isActive={isActive} />)}
                      {!g.goals.length && !newGoals.some((x) => x.groupId === g.id) && <li className="px-2.5 py-1.5 text-xs text-muted-foreground">No goals yet</li>}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="grid gap-2">
        <OwnerOnly><Link href={`${BASE_PATH}/new-goal`} className={buttonVariants({ size: "default" })}><Plus aria-hidden /> New goal</Link></OwnerOnly>
        {viewAs !== "admin" && <CreateGroupDialog trigger={<Button variant="outline"><Users aria-hidden /> New group</Button>} />}
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle light or dark theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="hidden dark:block" aria-hidden /><Moon className="dark:hidden" aria-hidden />
    </Button>
  );
}

function Breadcrumb() {
  const path = usePathname();
  const slug = path.split("/")[2];
  const params = useSearchParams();
  const created = useCreatedGroups();
  const groupName = [...groups, ...created].find((g) => g.id === params.get("group"))?.name;
  // Goal pages: Group > Goal from ?goal=, so every goal of the same type gets its own breadcrumb.
  const newGoal = useCreatedGoals().find((x) => x.id === params.get("goal"));
  const owner = groups.find((g) => g.goals.some((x) => x.id === params.get("goal")));
  const goalName = owner?.goals.find((x) => x.id === params.get("goal"))?.name;
  const found = slug === "group" && groupName ? ["My Groups", groupName]
    : newGoal ? [[...groups, ...created].find((g) => g.id === newGoal.groupId)?.name ?? "Group", newGoal.name]
    : owner && goalName && slug !== "goal-info" ? [owner.name, goalName]
    : screens.find((s) => s.slug === slug)?.crumbs ?? ["Dashboard"];
  // System Admins have no My Groups page; their group list is the Dashboard ("All groups").
  const viewAs = useViewAs();
  const account = useAccount();
  const crumbs = viewAs === "admin" ? found.map((c) => (c === "My Groups" ? "All groups" : c)) : found;
  // Where each crumb leads: list pages, then groups, then goals (the same page the sidebar opens for this account).
  const hrefFor = (label: string): string | undefined => {
    if (label === "My Groups") return `${BASE_PATH}/groups`;
    if (label === "All groups") return `${BASE_PATH}/dashboard`;
    const n = nav.find((x) => x.label === label && canOpen(x.href.split("/").pop()!, viewAs));
    if (n) return n.href;
    const g = [...groups, ...created].find((x) => x.name === label);
    if (g) return `${BASE_PATH}/group?group=${g.id}`;
    for (const gr of sampleGroupsFor(account)) {
      const goal = gr.goals.find((x) => x.name === label);
      if (goal) return goalPath(goal, roleIn(account, gr.id, created) ?? "member");
    }
    const s = screens.find((x) => x.crumbs.at(-1) === label);
    return s && canOpen(s.slug, viewAs) ? `${BASE_PATH}/${s.slug}` : undefined;
  };
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const href = last ? undefined : hrefFor(c);
          return (
            <Fragment key={c}>
              {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 sm:block" aria-hidden />}
              <li className={cn("truncate", last ? "font-medium text-foreground" : "hidden sm:list-item")} aria-current={last ? "page" : undefined}>
                {href ? <Link href={href} className="rounded-sm outline-none transition-colors hover:text-foreground hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50">{c}</Link> : c}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

interface AppShellProps {
  /** The development toggle is on: no sign-in, and the View as switch shows. */
  dev: boolean;
  identity: Identity | null;
  account: Account;
  emailMode: EmailMode;
  createdGroups: CreatedGroup[];
  createdGoals: CreatedGoal[];
  children: ReactNode;
}
export function AppShell({ dev, identity, account, emailMode, createdGroups, createdGoals, children }: AppShellProps) {
  return (
    <AccountProvider value={account}><EmailModeProvider value={emailMode}><CreatedGroupsProvider value={createdGroups}><CreatedGoalsProvider value={createdGoals}>
      <ShellFrame dev={dev} identity={identity}>{children}</ShellFrame>
    </CreatedGoalsProvider></CreatedGroupsProvider></EmailModeProvider></AccountProvider>
  );
}

interface ShellFrameProps {
  dev: boolean;
  identity: Identity | null;
  children: ReactNode;
}
// The site-wide role for navigation (admin; owner when the account owns a group; else member), from the live group list,
// so creating a group shows the Owner pages right away. Pages set the role per group.
function ShellFrame({ dev, identity, children }: ShellFrameProps) {
  const account = useAccount();
  const viewAs = navRole(account, useCreatedGroups());
  const me = identity ?? ACCOUNTS[account];
  return (
    <ViewAsProvider value={viewAs}>
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block"><SidebarBody /></aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-6">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" />}><Menu aria-hidden /></SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Groups, goals and settings</SheetDescription>
              <SidebarBody />
            </SheetContent>
          </Sheet>
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-1">
            {dev && <ViewAsSwitch />}
            <Button variant="outline" className="hidden w-56 justify-start text-muted-foreground md:inline-flex" aria-label="Search or jump to">
              <Search aria-hidden /> Search or jump to… <kbd className="ml-auto rounded border px-1 text-xs">Ctrl K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search"><Search aria-hidden /></Button>
            {viewAs !== "admin" && <RemindersBell />}
            {viewAs === "owner" && <ApprovalsBell />}
            {viewAs === "admin" && <Link href={`${BASE_PATH}/reports`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")} aria-label={`Reports, ${openReports} open`}>
              <Bell aria-hidden /><span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" aria-hidden />
            </Link>}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Avatar size="sm"><AvatarFallback>{me.initials}</AvatarFallback></Avatar><ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup><DropdownMenuLabel>{me.name}{dev && " (demo)"}<br /><span className="font-normal text-muted-foreground">{me.email}</span></DropdownMenuLabel></DropdownMenuGroup>
                <DropdownMenuSeparator />
                {settingsGroups(viewAs).map((g) => (
                  <DropdownMenuGroup key={g.label}>
                    <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                    {g.items.map((s) => <DropdownMenuItem key={s.tab} render={<Link href={settingsHref(s.tab)} />}>{s.label}</DropdownMenuItem>)}
                  </DropdownMenuGroup>
                ))}
                {!dev && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => { void signOutAction(); }}>Sign out</DropdownMenuItem></>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
          {viewAs === "admin" && <Alert><ShieldCheck aria-hidden /><AlertTitle>You are viewing as System Admin</AlertTitle><AlertDescription>You are in every group as a viewer. You can change scheduled jobs only, and you are not counted in members, totals or charts.</AlertDescription></Alert>}
          {children}
        </main>
      </div>
    </div>
    </ViewAsProvider>
  );
}
