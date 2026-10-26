import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Eye, Flag, Plus, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatusBadge } from "@/components/app/primitives";
import { goalIcon, typeName } from "./screens";
import { groups } from "@/lib/demo-data";
import { fmtDate } from "@/lib/money";
import { goalPath } from "@/lib/screens";

// ---------- Goal info: what a group member sees about a goal they have not joined ----------
// Only the purpose, who joined and when it started. Progress, amounts and records stay hidden until you join.
export function GoalInfoScreen({ id }: { id?: string }) {
  const group = groups.find((g) => g.goals.some((x) => x.id === id));
  const goal = group?.goals.find((x) => x.id === id);
  if (!group || !goal) notFound();
  if (goal.joined || !goal.info) return <Alert><AlertTitle>You already joined {goal.name}</AlertTitle><AlertDescription><Link href={goalPath(goal, "member")} className="underline">Open the goal</Link></AlertDescription></Alert>;
  const { about, target, started, joinedBy } = goal.info;
  const Icon = goalIcon[goal.type];
  return (
    <>
      <PageHeader
        title={goal.name}
        description={`${typeName[goal.type]} goal in ${group.name}`}
        actions={<><Link href="/design-preview/goals" className={buttonVariants({ variant: "outline" })}>Back to All Goals</Link><Button><Plus aria-hidden /> Join this goal</Button></>}
      />
      <Alert>
        <Eye aria-hidden />
        <AlertTitle>You have not joined this goal</AlertTitle>
        <AlertDescription>You can see what it is for, who joined and when it started. Progress and records show up after you join.</AlertDescription>
      </Alert>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>What this goal is for</CardTitle>
            <CardDescription>{about}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flag className="size-3.5" aria-hidden /> Goal</dt><dd className="mt-1 font-medium">{target}</dd></div>
              <div className="rounded-lg border p-3"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden /> Started</dt><dd className="mt-1 font-medium">{fmtDate(started)}</dd></div>
              <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={goal.status} /></dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="size-4" aria-hidden /> Who joined</CardTitle>
            <CardDescription>{joinedBy.length} of {group.members} members in {group.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {joinedBy.map((name) => (
                <li key={name} className="flex items-center gap-2.5"><Avatar className="size-8"><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="font-medium">{name}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
