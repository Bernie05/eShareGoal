"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, MailOpen, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount, useCreatedGoals, useCreatedGroups, useSaveCreatedGroups, useSendEmail, writeCookie } from "@/components/app/view-as";
import { ACCOUNTS, creatorOf } from "@/lib/accounts";
import { daysLeft, goalsOf, inviteState, type GoalJoins } from "@/lib/memberships";
import type { CreatedGroup } from "@/lib/view-as";
import { cn } from "@/lib/utils";
import { BASE_PATH, GOAL_JOINS_COOKIE, LOCALE } from "@/lib/constants";

// Joining groups and goals (rules in lib/memberships.ts). The preview has one browser for every account: switch to the
// invited account (User 2) to accept an invitation, then back to the Owner to see it.
function useMyEmail() { const a = useAccount(); return a === "admin" ? null : ACCOUNTS[a].email.toLowerCase(); }
const when = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });

// ---------- Invitations for the signed-in person: accept or decline ----------
export function MyInvitations() {
  const me = useMyEmail();
  const all = useCreatedGroups();
  const save = useSaveCreatedGroups();
  const goals = useCreatedGoals();
  if (!me) return null;
  const invited = all.filter((g) => g.invites.includes(me) && !g.joined?.includes(me) && !g.declined?.includes(me));
  if (!invited.length) return null;
  const update = (g: CreatedGroup, patch: Partial<CreatedGroup>, then?: string) => save(all.map((x) => (x.id === g.id ? { ...x, ...patch } : x)), then);
  return (
    <Card className="border-info/40">
      <CardHeader><CardTitle className="flex items-center gap-2"><MailOpen className="size-4" aria-hidden /> Invitations for you</CardTitle><CardDescription>Groups that invited {me}.</CardDescription></CardHeader>
      <CardContent>
        <ul className="divide-y">
          {invited.map((g) => {
            const state = inviteState(g, me), left = daysLeft(g, me);
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1"><span className="block font-medium">{g.name}</span><span className="block text-xs text-muted-foreground">From {creatorOf(g)} · {scopeLabel(goalsOf(g, me), goals.filter((x) => x.groupId === g.id))}{g.description && ` · ${g.description}`}</span></span>
                {state === "expired"
                  ? <span className="text-xs text-warning">Expired. Ask {creatorOf(g)} to send it again.</span>
                  : <>
                    {left !== null && <span className="text-xs text-muted-foreground">Expires in {left} {left === 1 ? "day" : "days"}</span>}
                    <Button size="sm" onClick={() => { update(g, { joined: [...(g.joined ?? []), me] }, `${BASE_PATH}/group?group=${g.id}`); toast.success(`You joined ${g.name}`, { description: "Open its goals and ask to join the ones you take part in." }); }}><Check aria-hidden /> Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => { update(g, { declined: [...(g.declined ?? []), me] }); toast(`Invitation to ${g.name} declined`); }}><X aria-hidden /> Decline</Button>
                  </>}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- Invite people who already use eShareGoal (group page, Owners) ----------
// directory: active accounts only (no System Admin, no pending, rejected or revoked ones), from the server. Emails show
// partly hidden so the list does not hand out everyone's address; search matches the name or the full email.
export type DirectoryUser = { name: string; email: string };
const hideEmail = (e: string) => { const [n, d] = e.split("@"); return `${n.slice(0, 2)}•••@${d}`; };

/** members: names already in the group; invited: emails with an open invitation. onInvite: false when it could not be saved. */
/** The goals someone is in: the whole group (null), or only the ones ticked. Used when inviting and when changing a member. */
export type GoalOption = { id: string; name: string };
interface GoalScopePickerProps {
  goals: GoalOption[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
  idPrefix: string;
}
export function GoalScopePicker({ goals, value, onChange, idPrefix }: GoalScopePickerProps) {
  if (!goals.length) return <p className="text-xs text-muted-foreground">This group has no goals yet: they join the whole group, and every goal added later.</p>;
  const some = value !== null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Add them to</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${idPrefix}-scope`} className="size-4 accent-primary" checked={!some} onChange={() => onChange(null)} /> The whole group <span className="text-xs text-muted-foreground">(all {goals.length} goals, and new ones)</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${idPrefix}-scope`} className="size-4 accent-primary" checked={some} onChange={() => onChange([])} /> Only some goals</label>
      {some && (
        <ul className="ml-6 grid gap-1.5 sm:grid-cols-2">{goals.map((g) => (
          <li key={g.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={value.includes(g.id)} onChange={(e) => onChange(e.target.checked ? [...value, g.id] : value.filter((x) => x !== g.id))} /> {g.name}</label></li>
        ))}</ul>
      )}
      {some && !value.length && <p role="alert" className="ml-6 text-xs text-destructive">Tick at least one goal.</p>}
    </fieldset>
  );
}
/** "All goals" or the goal names, for a member row or an invitation. */
export const scopeLabel = (ids: string[] | null, goals: GoalOption[]) => (ids ? `Only ${ids.map((id) => goals.find((g) => g.id === id)?.name).filter(Boolean).join(", ") || "removed goals"}` : "All goals");

interface InviteUsersDialogProps {
  groupName: string; directory: DirectoryUser[]; members: string[]; invited: string[]; room: number; goals?: GoalOption[]; onInvite: (emails: string[], goals: string[] | null) => boolean;
}
export function InviteUsersDialog({ groupName, directory, members, invited, room, goals = [], onInvite }: InviteUsersDialogProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const term = q.trim().toLowerCase();
  const shown = directory.filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase() === term || u.email.toLowerCase().startsWith(term));
  const stateOf = (u: DirectoryUser) => members.includes(u.name) ? "Member" : invited.includes(u.email) ? "Invited" : null;
  const toggle = (e: string) => setPicked((p) => (p.includes(e) ? p.filter((x) => x !== e) : p.length < room ? [...p, e] : (toast.error(`You can invite ${room} more ${room === 1 ? "person" : "people"} to this group.`), p)));
  const close = () => { setOpen(false); setQ(""); setPicked([]); setScope(null); };
  // Every goal ticked is the same as the whole group, except that new goals would not be included: keep it as picked.
  const badScope = scope !== null && !scope.length;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><UserPlus aria-hidden /> Invite people</Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Invite people to {groupName}</DialogTitle><DialogDescription>People who already use eShareGoal. They get an invitation to accept within 7 days, and join as Members.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="iu-search">Search by name or email</Label>
            <Input id="iu-search" type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Ana, or ana.cruz@example.com" />
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border" aria-label="People on eShareGoal">
            {shown.map((u) => {
              const state = stateOf(u), on = picked.includes(u.email);
              return (
                <li key={u.email}>
                  <label className={cn("flex items-center gap-3 px-3 py-2 text-sm", state ? "opacity-60" : "cursor-pointer hover:bg-accent/40", on && "bg-accent/50")}>
                    <input type="checkbox" className="size-4 accent-primary" disabled={!!state} checked={on || !!state} onChange={() => toggle(u.email)} />
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{u.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.name}</span><span className="block truncate text-xs text-muted-foreground">{hideEmail(u.email)}</span></span>
                    {state && <Badge variant="secondary">{state === "Member" ? "Already a member" : "Invited"}</Badge>}
                  </label>
                </li>
              );
            })}
            {!shown.length && <li className="p-4 text-center text-sm text-muted-foreground">No one matches. Not on eShareGoal yet? Invite them by email instead.</li>}
          </ul>
          <p className="text-xs text-muted-foreground">{picked.length ? `${picked.length} selected` : "Pick one or more people."} · room for {room} more</p>
          {picked.length > 0 && <div className="rounded-lg border p-3"><GoalScopePicker goals={goals} value={scope} onChange={setScope} idPrefix="iu" /></div>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={!picked.length || badScope} onClick={() => { if (onInvite(picked, scope)) close(); }}><UserPlus aria-hidden /> Invite {picked.length || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SampleGroupInviteProps {
  groupName: string;
  directory: DirectoryUser[];
  members: string[];
  invited: string[];
  goals: GoalOption[];
}
/** Sample groups (Family): their member lists are fixed in the preview, so inviting only sends the emails. */
export function SampleGroupInvite({ groupName, directory, members, invited, goals }: SampleGroupInviteProps) {
  const send = useSendEmail();
  return <InviteUsersDialog groupName={groupName} directory={directory} members={members} invited={invited} room={10} goals={goals}
    onInvite={(emails, ids) => { const what = scopeLabel(ids, goals); for (const e of emails) send(e, `You are invited to ${groupName} on eShareGoal (${what.toLowerCase()})`); toast.success(`${emails.length} ${emails.length === 1 ? "invitation" : "invitations"} sent`, { description: "Sample group: its member list stays as it is in the preview. Groups you create keep the invitations." }); return true; }} />;
}

// ---------- Goal join requests (sample goals): a member asks, an Owner approves ----------
function useSaveJoins() {
  const router = useRouter();
  return (next: GoalJoins) => { if (!writeCookie(GOAL_JOINS_COOKIE, next)) return false; router.refresh(); return true; };
}

interface JoinGoalButtonProps {
  goal: { id: string; name: string };
  group: string;
  owner: string;
  joins: GoalJoins;
}
/** On a goal's info page, for a group member who has not joined it. */
export function JoinGoalButton({ goal, group, owner, joins }: JoinGoalButtonProps) {
  const account = useAccount();
  const saveJoins = useSaveJoins();
  const send = useSendEmail();
  if (account === "admin") return null;
  const me = ACCOUNTS[account].name;
  const mine = joins.requests.find((r) => r.goal === goal.id && r.name === me);
  const declined = joins.declined.find((r) => r.goal === goal.id && r.name === me);
  if (mine) return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1"><Clock className="size-3" aria-hidden /> Request sent {when(mine.at)} · waiting for {owner}</Badge>
      <Button variant="ghost" size="sm" onClick={() => saveJoins({ ...joins, requests: joins.requests.filter((r) => r !== mine) }) && toast("Request cancelled")}>Cancel request</Button>
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-2">
      {declined && <span className="text-xs text-muted-foreground">{owner} declined your last request ({when(declined.at)}).</span>}
      <Button onClick={() => {
        if (saveJoins({ ...joins, requests: [...joins.requests, { goal: goal.id, group, name: me, at: new Date().toISOString() }], declined: joins.declined.filter((r) => !(r.goal === goal.id && r.name === me)) })) {
          send(`${owner} (Owner)`, `${me} asked to join ${goal.name}`);
          toast.success(`Asked to join ${goal.name}`, { description: `${owner} approves it, then the goal opens for you.` });
        }
      }}><UserPlus aria-hidden /> {declined ? "Ask again" : "Ask to join"}</Button>
    </span>
  );
}

interface GoalJoinRequestsProps {
  group: string;
  goals: { id: string; name: string; money: boolean; href: string }[];
  joins: GoalJoins;
}
/** On the group page, for its Owners: requests to join the group's goals. money: goals with shares to set after approving. */
export function GoalJoinRequests({ group, goals, joins }: GoalJoinRequestsProps) {
  const saveJoins = useSaveJoins();
  const send = useSendEmail();
  const list = joins.requests.filter((r) => r.group === group && goals.some((g) => g.id === r.goal));
  if (!list.length) return null;
  const goal = (id: string) => goals.find((g) => g.id === id)!;
  const decide = (r: (typeof list)[number], ok: boolean) => {
    const rest = joins.requests.filter((x) => x !== r);
    const next = ok ? { ...joins, requests: rest, approved: [...joins.approved, { goal: r.goal, name: r.name }] } : { ...joins, requests: rest, declined: [...joins.declined, { goal: r.goal, name: r.name, at: new Date().toISOString() }] };
    if (!saveJoins(next)) return;
    send(r.name, ok ? `You joined ${goal(r.goal).name}` : `Your request to join ${goal(r.goal).name} was declined`);
    toast.success(ok ? `${r.name} joined ${goal(r.goal).name}` : `Request from ${r.name} declined`, ok && goal(r.goal).money ? { description: "Set their share in the goal's settings so dues and reminders include them." } : undefined);
  };
  return (
    <Card className="border-info/40">
      <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-4" aria-hidden /> Requests to join goals</CardTitle><CardDescription>Members of this group who asked to take part in a goal.</CardDescription></CardHeader>
      <CardContent>
        <ul className="divide-y">{list.map((r) => (
          <li key={`${r.goal}-${r.name}`} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1"><span className="block"><span className="font-medium">{r.name}</span> wants to join <a href={goal(r.goal).href} className="font-medium underline underline-offset-2">{goal(r.goal).name}</a></span><span className="block text-xs text-muted-foreground">Asked {when(r.at)}{goal(r.goal).money && " · money goal: set their share after approving"}</span></span>
            <Button size="sm" onClick={() => decide(r, true)}><Check aria-hidden /> Approve</Button>
            <Button size="sm" variant="outline" onClick={() => decide(r, false)}><X aria-hidden /> Decline</Button>
          </li>
        ))}</ul>
      </CardContent>
    </Card>
  );
}
