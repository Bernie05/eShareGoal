"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, type ReactNode } from "react";
import {
  Activity, Bell, CalendarClock, ChevronDown, ChevronRight, Flag, Dumbbell, Home, Landmark, LayoutGrid, Menu, Moon, PiggyBank,
  Plug, Plus, Search, Settings, ShieldCheck, Sun, Target, UserCog, Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { groups, type GoalType } from "@/lib/demo-data";
import { canOpen, goalPath, screens } from "@/lib/screens";
import { openReports } from "@/lib/reports-data";
import type { EmailMode, ViewAs } from "@/lib/view-as";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmailModeProvider, OwnerOnly, useViewAs, ViewAsProvider, ViewAsSwitch } from "./view-as";
import { cn } from "@/lib/utils";

const base = "/design-preview";
const goalIcon: Record<GoalType, typeof Landmark> = { loan: Landmark, shared_money: PiggyBank, fitness: Dumbbell, tasks: Target, custom: Target };

const nav = [
  { label: "Dashboard", icon: Home, href: `${base}/dashboard` },
  { label: "My Groups", icon: Users, href: `${base}/groups` },
  { label: "All Goals", icon: LayoutGrid, href: `${base}/goals` },
  { label: "Activity History", icon: Activity, href: `${base}/activity` },
  { label: "Notifications", icon: Bell, href: `${base}/notifications`, badge: "3" },
  { label: "Integrations", icon: Plug, href: `${base}/integrations` },
  { label: "Scheduled Jobs", icon: CalendarClock, href: `${base}/jobs` },
  { label: "Users", icon: UserCog, href: `${base}/users` },
  { label: "Reports", icon: Flag, href: `${base}/reports`, badge: String(openReports) },
  { label: "Settings", icon: Settings, href: `${base}/settings` },
];

function NavLink({ href, active, className, children }: { href: string; active?: boolean; className?: string; children: ReactNode }) {
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

function SidebarBody() {
  const viewAs = useViewAs();
  const path = usePathname();
  const params = useSearchParams();
  // Same path, and every ?key=value in the link matches the current URL (goal and group pages share one path).
  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    return p === path && [...new URLSearchParams(q).entries()].every(([k, v]) => params.get(k) === v);
  };
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link href={base} className="flex items-center gap-2 px-2 py-1.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Target className="size-4" aria-hidden /></span>
        <span className="text-base font-semibold tracking-tight">eShareGoal</span>
      </Link>
      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {nav.filter((n) => canOpen(n.href.split("/").pop()!, viewAs)).map((n) => ( // each link only for roles that may open it
            <li key={n.label}>
              <NavLink href={n.href} active={isActive(n.href)}>
                <n.icon className="size-4" aria-hidden /><span className="flex-1">{n.label}</span>
                {n.badge && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{n.badge}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <div>
          <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Groups</p>
          <ul className="space-y-0.5">
            {groups.filter((g) => !g.archived).map((g) => (
              <li key={g.id}>
                <Collapsible defaultOpen={g.id === "family"}>
                  <div className="group/row flex items-center">
                    <CollapsibleTrigger aria-label={`Toggle ${g.name} goals`} className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring [&[data-panel-open]>svg]:rotate-90">
                      <ChevronRight className="size-4 transition-transform" aria-hidden />
                    </CollapsibleTrigger>
                    <NavLink href={`${base}/group?group=${g.id}`} className="flex-1 py-1.5" active={isActive(`${base}/group?group=${g.id}`)}>{g.name}</NavLink>
                  </div>
                  <CollapsibleContent>
                    <ul className="ml-3.5 space-y-0.5 border-l border-sidebar-border pl-2">
                      {g.goals.map((goal) => {
                        const Icon = goalIcon[goal.type];
                        const href = goalPath(goal, viewAs);
                        return (
                          <li key={goal.id}>
                            <NavLink href={href} active={isActive(href) && (!goal.joined || goal.id === "car-credit" || goal.id === "fitness-30" || goal.id === "emergency-fund")} className="py-1.5">
                              <Icon className="size-3.5 text-muted-foreground" aria-hidden /><span className="truncate">{goal.name}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="grid gap-2">
        <OwnerOnly><Link href={`${base}/new-goal`} className={buttonVariants({ size: "default" })}><Plus aria-hidden /> New goal</Link></OwnerOnly>
        {viewAs !== "admin" && <Link href={`${base}/groups`} className={buttonVariants({ variant: "outline" })}><Users aria-hidden /> New group</Link>}
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
  const groupId = useSearchParams().get("group");
  const groupName = groups.find((g) => g.id === groupId)?.name;
  const found = slug === "group" && groupName ? ["My Groups", groupName] : screens.find((s) => s.slug === slug)?.crumbs ?? ["Dashboard"];
  // System Admins have no My Groups page; their group list is the Dashboard ("All groups").
  const crumbs = useViewAs() === "admin" ? found.map((c) => (c === "My Groups" ? "All groups" : c)) : found;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={c}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            <li className={cn("truncate", i === crumbs.length - 1 && "font-medium text-foreground")} aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c}</li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({ viewAs, emailMode, children }: { viewAs: ViewAs; emailMode: EmailMode; children: ReactNode }) {
  return (
    <ViewAsProvider value={viewAs}><EmailModeProvider value={emailMode}>
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
            <ViewAsSwitch />
            <Button variant="outline" className="hidden w-56 justify-start text-muted-foreground md:inline-flex" aria-label="Search or jump to">
              <Search aria-hidden /> Search or jump to… <kbd className="ml-auto rounded border px-1 text-xs">Ctrl K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search"><Search aria-hidden /></Button>
            {viewAs !== "member" && <Link href={viewAs === "admin" ? `${base}/reports` : `${base}/notifications`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")} aria-label={viewAs === "admin" ? `Reports, ${openReports} open` : "Notifications, 3 unread"}>
              <Bell aria-hidden /><span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" aria-hidden />
            </Link>}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Avatar size="sm"><AvatarFallback>{viewAs === "admin" ? "SA" : "BS"}</AvatarFallback></Avatar><ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{viewAs === "admin" ? "System Admin (demo)" : "Bernz (demo)"}<br /><span className="font-normal text-muted-foreground">{viewAs === "admin" ? "admin@example.com" : "bernz@example.com"}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Account settings</DropdownMenuItem>
                <DropdownMenuItem>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
          {viewAs === "admin" && <Alert><ShieldCheck aria-hidden /><AlertTitle>You are viewing as System Admin</AlertTitle><AlertDescription>You are in every group as a viewer. You cannot change anything, and you are not counted in members, totals or charts.</AlertDescription></Alert>}
          {children}
        </main>
      </div>
    </div>
    </EmailModeProvider></ViewAsProvider>
  );
}
