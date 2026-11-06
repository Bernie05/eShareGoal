"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, LogOut, Plus, Target, Trash2, UserCheck, UserMinus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, OwnerLine, PageHeader, SectionTitle, StatCard } from "@/components/app/primitives";
import { EditGroupDialog } from "@/components/app/edit-group";
import { writeRecords } from "@/components/app/records";
import { GroupApprovalsFor } from "@/components/app/approvals";
import { OwnerOnly, RoleBadge, useMe, useCreatedGoals, useCreatedGroups, useSaveCreatedGoals, useSaveCreatedGroups, useSendEmail, ViewAsProvider } from "@/components/app/view-as";
import { CreatedGoalCard, CreatedGoalProgressRow } from "./goal-page";
import { groups } from "@/lib/demo-data";
import { fmtDate } from "@/lib/money";
import { nameFromEmail, type CreatedGroup, type ViewAs } from "@/lib/view-as";
import { createdMembers, creatorOf, ownersOf } from "@/lib/accounts";
import { daysLeft, goalMembers, goalsOf, inGoalOf, inviteState, withGoals } from "@/lib/memberships";
import { GoalScopePicker, InviteUsersDialog, scopeLabel, type DirectoryUser } from "@/components/app/join-group";
import type { SetupSettings as GroupSettings } from "@/lib/group-settings";
import { GroupSetup, GroupSetupCard } from "./group-settings";
import { BASE_PATH } from "@/lib/constants";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreatedGroupScreenProps {
  group: CreatedGroup;
  role: ViewAs;
  settings: Record<string, GroupSettings>;
  setup?: string;
  tab?: string;
  directory?: DirectoryUser[];
}
// ---------- A group made in the preview. Its creator is Owner; Owners create, edit and delete everything in it ----------
// role: the viewer's role here. Owners change things, Members only view, the System Admin views every group.
// Only the creator changes other people's roles.
// settings/setup/tab: the group setup (integrations, jobs, notifications per goal) on this page; setup/tab: which row and tab open first.
// directory: people on eShareGoal the Owner can invite (active accounts, from the server).
export function CreatedGroupScreen({ group: g, role, settings, setup, tab, directory = [] }: CreatedGroupScreenProps) {
  const all = useCreatedGroups();
  const save = useSaveCreatedGroups();
  const allGoals = useCreatedGoals();
  const saveGoals = useSaveCreatedGoals();
  const send = useSendEmail();
  const goals = allGoals.filter((x) => x.groupId === g.id);
  const joined = g.joined ?? [];
  const owners = g.owners ?? [];
  const members = createdMembers(g);
  // Who takes part in each goal: invitations can be for some goals only (lib/memberships.ts).
  const creatorName = creatorOf(g);
  const inGoal = (goalId: string) => goalMembers(g, goalId, creatorName);
  const goalOptions = goals.map((x) => ({ id: x.id, name: x.name }));
  const setupGroup = { id: g.id, name: g.name, goals: goals.map((x) => ({ id: x.id, name: x.name, loan: x.template.widgets.includes("schedule"), money: x.template.measure === "money", created: true, members: inGoal(x.id) })) };
  const creator = creatorOf(g);
  const me = useMe();
  const isCreator = me === creator;
  const isMe = (e: string) => !!me && nameFromEmail(e).toLowerCase() === me.toLowerCase();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invite, setInvite] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const update = (patch: Partial<CreatedGroup>) => save(all.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
  const inviteErr = !invite.trim() ? "" : !EMAIL.test(invite.trim()) ? "Enter a valid email." : g.invites.includes(invite.trim().toLowerCase()) ? "Already invited." : g.invites.length >= 10 ? "Up to 10 people in the preview." : "";

  const now = () => new Date().toISOString();
  const without = <T,>(rec: Record<string, T> | undefined, k: string) => Object.fromEntries(Object.entries(rec ?? {}).filter(([x]) => x !== k));
  const addInvite = () => {
    const e = invite.trim().toLowerCase();
    if (!e || inviteErr) return;
    update({ invites: [...g.invites, e], sent: { ...g.sent, [e]: now() } }); send(e, `You are invited to ${g.name} on eShareGoal`); setInvite("");
  };
  // Resending renews the 7 days and lets someone who declined accept after all.
  const resend = (e: string) => { update({ sent: { ...g.sent, [e]: now() }, declined: g.declined?.filter((x) => x !== e) }); send(e, `Reminder: you are invited to ${g.name}`); };
  const remove = (e: string) => {
    update({ invites: g.invites.filter((x) => x !== e), joined: joined.filter((x) => x !== e), owners: owners.filter((x) => x !== e), sent: without(g.sent, e), declined: g.declined?.filter((x) => x !== e), goals: without(g.goals, e) });
    toast(joined.includes(e) ? `${nameFromEmail(e)} removed from ${g.name}` : `Invitation for ${e} cancelled`); setRemoving(null);
  };
  const myEmail = g.invites.find((e) => isMe(e) && joined.includes(e));
  // A Member only sees the goals they are in; Owners and the System Admin see every goal.
  const shownGoals = role === "member" && myEmail ? goals.filter((x) => inGoalOf(g, myEmail, x.id)) : goals;
  const [scoping, setScoping] = useState<{ email: string; value: string[] | null } | null>(null);
  const [leaving, setLeaving] = useState(false);

  return (
    <ViewAsProvider value={role}>
      <PageHeader
        title={g.name}
        description={<>{g.description || "No description yet."}<span className="mt-1 block"><OwnerLine names={ownersOf(g.id, [g])} /></span></>}
        actions={<>
          {myEmail && !isCreator && <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setLeaving(true)}><LogOut aria-hidden /> Leave group</Button>}
          <OwnerOnly>
            <InviteUsersDialog groupName={g.name} directory={directory} members={members} room={10 - g.invites.length} goals={goalOptions}
              invited={g.invites.filter((e) => !joined.includes(e) && !g.declined?.includes(e))}
              onInvite={(emails, ids) => {
                const fresh = emails.filter((e) => !g.invites.includes(e));
                const stamp = Object.fromEntries(emails.map((e) => [e, now()]));
                const scoped = emails.reduce((acc, e) => withGoals({ ...g, goals: acc }, e, ids), g.goals ?? {});
                update({ invites: [...g.invites, ...fresh], sent: { ...g.sent, ...stamp }, declined: g.declined?.filter((e) => !emails.includes(e)), goals: scoped });
                for (const e of emails) send(e, `You are invited to ${g.name} on eShareGoal`);
                toast.success(`${emails.length} ${emails.length === 1 ? "invitation" : "invitations"} sent`, { description: "They accept from their Dashboard within 7 days." });
                return true;
              }} />
            <EditGroupDialog groupName={g.name} goals={goals.map((x) => ({ id: x.id, name: x.name, members: inGoal(x.id), created: x }))} group={(done) => (
              <GroupDetailsForm key={g.id} name={g.name} description={g.description} nameErr={(n) => n.trim().length < 3 ? "Use at least 3 characters." : n.trim().length > 40 ? "Use 40 characters or fewer." : [...groups, ...all].some((x) => x.id !== g.id && x.name.toLowerCase() === n.trim().toLowerCase()) ? "You already have a group with this name." : ""}
                onCancel={done} onSave={(name, description) => { update({ name, description }); toast.success("Group updated"); done(); }} />
            )} />
            <Button variant="outline" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden /> Delete group</Button>
            <Link href={`${BASE_PATH}/new-goal?group=${g.id}`} className={buttonVariants()}><Plus aria-hidden /> New goal</Link>
          </OwnerOnly>
        </>}
      />
      {/* Same layout as the sample groups (Family); this group is fully editable because the user owns it. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Active goals" value={goals.length} icon={Target} hint="Progress is shown per goal, never summed across units" />
        <StatCard label="Members" value={members.length} icon={Users} hint={role === "admin" ? "System Admin is not counted" : `You are ${isCreator ? "the Owner (you created this group)" : role === "owner" ? "an Owner" : "a Member"}${owners.length ? ` · ${owners.length + 1} Owners` : ""}`} />
      </div>
      <SectionTitle>Goals</SectionTitle>
      {shownGoals.length
        ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shownGoals.map((x) => <CreatedGoalCard key={x.id} g={x} members={inGoal(x.id)} />)}</div>
        : goals.length ? <EmptyState title="You are not in a goal yet" body="The Owner added you to the group but not to any of its goals. Ask them to add you to the goals you take part in." />
        : <EmptyState title="No goals yet" body="Add a loan, a savings fund or a challenge. Members you invite will see it once they join." cta={{ label: "Add the first goal", href: `${BASE_PATH}/new-goal?group=${g.id}` }} />}
      <GroupApprovalsFor groupId={g.id} groupName={g.name} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Members and roles</CardTitle><CardDescription>Owners can change everything in the group; Members can only view. Only the creator ({creator}) can change roles. Enforced by the server in production.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y text-sm">
              <li className="flex flex-wrap items-center justify-between gap-3 py-2.5"><span className="font-medium">{creator} <span className="font-normal text-muted-foreground">({isCreator ? "you, " : ""}created the group)</span></span><RoleBadge role="owner" /></li>
              {g.invites.map((e) => {
                const isJoined = joined.includes(e); const isOwner = owners.includes(e);
                const state = inviteState(g, e), left = daysLeft(g, e);
                return (
                  <li key={e} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">{isJoined ? <><span className="font-medium">{nameFromEmail(e)}</span>{isMe(e) && <span className="text-muted-foreground"> (you)</span>} <span className="text-xs text-muted-foreground">{e}</span></> : e}<span className="block text-xs text-muted-foreground">{scopeLabel(goalsOf(g, e), goalOptions)}</span></span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {isJoined ? <RoleBadge role={isOwner ? "owner" : "member"} />
                        : state === "declined" ? <Badge variant="outline" className="text-muted-foreground">Declined</Badge>
                        : state === "expired" ? <Badge variant="secondary" className="border-0 bg-destructive-soft text-destructive">Expired</Badge>
                        : <Badge variant="secondary" className="border-0 bg-warning-soft text-warning">Invited{left !== null && ` · ${left} ${left === 1 ? "day" : "days"} left`}</Badge>}
                      <OwnerOnly>{isJoined
                        ? isCreator && <Button variant="ghost" size="sm" onClick={() => { update({ owners: isOwner ? owners.filter((x) => x !== e) : [...owners, e] }); toast(`${nameFromEmail(e)} is now ${isOwner ? "a Member" : "an Owner"}`); send(e, `Your role in ${g.name} is now ${isOwner ? "Member" : "Owner"}`); }}><Crown aria-hidden /> {isOwner ? "Make Member" : "Make Owner"}</Button>
                        : <>
                            <Button variant="ghost" size="sm" onClick={() => { resend(e); toast(`Invitation sent again to ${e}`, { description: "It is valid for 7 more days." }); }}>Resend</Button>
                            <Button variant="ghost" size="sm" title="Preview only: pretend they accepted" onClick={() => { update({ joined: [...joined, e] }); toast(`${nameFromEmail(e)} joined (simulated)`); }}><UserCheck aria-hidden /> Mark as joined</Button>
                          </>}
                      {goals.length > 0 && <Button variant="ghost" size="sm" onClick={() => setScoping({ email: e, value: goalsOf(g, e) })}><Target aria-hidden /> Goals</Button>}
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(e)}><UserMinus aria-hidden /> {isJoined ? "Remove" : "Cancel"}</Button></OwnerOnly>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
              <span><span className="font-medium">System Admin</span> <span className="text-muted-foreground">· has access to every group · not counted in members, totals or charts</span></span>
              <RoleBadge role="admin" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
        {role === "member" && <GroupSetupCard group={{ ...setupGroup, goals: setupGroup.goals.filter((x) => shownGoals.some((s) => s.id === x.id)) }} all={settings} />}
        <Card>
          <CardHeader><CardTitle>Invite people</CardTitle><CardDescription>Use Invite people at the top to pick someone already on eShareGoal, or invite any email here. They accept within 7 days and join as Members.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <OwnerOnly><div className="space-y-1.5">
              <Label htmlFor="cg-invite">Invite by email</Label>
              <div className="flex gap-2">
                <Input id="cg-invite" type="email" placeholder="ana@example.com" value={invite} onChange={(e) => setInvite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInvite()} aria-invalid={!!inviteErr || undefined} aria-describedby="cg-invite-msg" />
                <Button variant="outline" disabled={!invite.trim() || !!inviteErr} onClick={addInvite}><Plus aria-hidden /> Invite</Button>
              </div>
              {inviteErr && <p id="cg-invite-msg" role="alert" className="text-xs text-destructive">{inviteErr}</p>}
            </div></OwnerOnly>
          </CardContent>
        </Card>
        </div>
      </div>
      {role !== "member" && <GroupSetup group={setupGroup} role={role} all={settings} open={setup} tab={tab} />}
      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent><ul className="divide-y text-sm">
          {owners.map((e) => <li key={`o-${e}`} className="py-2"><span className="font-medium">{creator}</span> made {nameFromEmail(e)} an Owner</li>)}
          {joined.map((e) => <li key={`j-${e}`} className="py-2"><span className="font-medium">{nameFromEmail(e)}</span> joined the group</li>)}
          {g.invites.length > 0 && <li className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{creator}</span> invited {g.invites.length} {g.invites.length === 1 ? "person" : "people"}</span><span className="text-muted-foreground">{fmtDate(g.created)}</span></li>}
          <li className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{creator}</span> created the group and became its Owner</span><span className="text-muted-foreground">{fmtDate(g.created)}</span></li>
        </ul></CardContent>
      </Card>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{removing && joined.includes(removing) ? `Remove ${nameFromEmail(removing)}?` : "Cancel this invitation?"}</DialogTitle><DialogDescription>{removing && joined.includes(removing) ? "They lose access to the group. Records about them stay in each goal's history." : removing}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setRemoving(null)}>Keep</Button><Button variant="destructive" onClick={() => remove(removing!)}>{removing && joined.includes(removing) ? "Remove member" : "Cancel invitation"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={scoping !== null} onOpenChange={(o) => !o && setScoping(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Goals for {scoping && nameFromEmail(scoping.email)}</DialogTitle><DialogDescription>Which of {g.name}&apos;s goals they take part in. They only see and get reminders for these.</DialogDescription></DialogHeader>
          {scoping && <GoalScopePicker goals={goalOptions} value={scoping.value} onChange={(value) => setScoping({ ...scoping, value })} idPrefix="cg-scope" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoping(null)}>Cancel</Button>
            <Button disabled={!!scoping?.value && !scoping.value.length} onClick={() => { if (!scoping) return; update({ goals: withGoals(g, scoping.email, scoping.value) }); send(scoping.email, `Your goals in ${g.name}: ${scopeLabel(scoping.value, goalOptions).toLowerCase()}`); toast.success(`${nameFromEmail(scoping.email)}: ${scopeLabel(scoping.value, goalOptions)}`); setScoping(null); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leave {g.name}?</DialogTitle><DialogDescription>You lose access to the group and its goals. Records about you stay in each goal&apos;s history. To come back, an Owner has to invite you again.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaving(false)}>Stay</Button>
            <Button variant="destructive" onClick={() => { if (!myEmail) return; save(all.map((x) => (x.id === g.id ? { ...x, invites: x.invites.filter((e) => e !== myEmail), joined: joined.filter((e) => e !== myEmail), owners: owners.filter((e) => e !== myEmail), sent: without(x.sent, myEmail), goals: without(x.goals, myEmail) } : x)), `${BASE_PATH}/groups`); send(`${creator} (Owner)`, `${me} left ${g.name}`); toast(`You left ${g.name}`); }}><LogOut aria-hidden /> Leave group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {g.name}?</DialogTitle><DialogDescription>The group, its invitations{goals.length ? ` and its ${goals.length} goal${goals.length === 1 ? "" : "s"} with their records` : ""} are removed. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { for (const x of goals) writeRecords(x.id, []); if (goals.length) saveGoals(allGoals.filter((x) => x.groupId !== g.id)); save(all.filter((x) => x.id !== g.id), `${BASE_PATH}/groups`); toast(`${g.name} deleted`); }}>Delete group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ViewAsProvider>
  );
}

interface GroupDetailsFormProps {
  name: string;
  description: string;
  nameErr: (name: string) => string;
  onCancel: () => void;
  onSave: (name: string, description: string) => void;
}
/** Edit group → Group name and description. */
function GroupDetailsForm({ name: initialName, description: initialDescription, nameErr: check, onCancel, onSave }: GroupDetailsFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const nameErr = check(name);
  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="cg-name">Group name</Label><Input id="cg-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameErr || undefined} />{nameErr && <p role="alert" className="text-xs text-destructive">{nameErr}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="cg-desc">What is it for?</Label><Textarea id="cg-desc" rows={2} maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} /><p className="text-xs text-muted-foreground">{description.length}/120</p></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onCancel}>Cancel</Button><Button disabled={!!nameErr} onClick={() => onSave(name.trim(), description.trim())}>Save changes</Button></DialogFooter>
    </>
  );
}

interface CreatedGroupCardProps {
  group: CreatedGroup;
  role: ViewAs;
}
/** My Groups card for a created group: the same card as the sample groups, with the viewer's role there. */
export function CreatedGroupCard({ group: g, role }: CreatedGroupCardProps) {
  const goals = useCreatedGoals().filter((x) => x.groupId === g.id);
  const members = createdMembers(g);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>{g.name}<RoleBadge role={role} /></CardTitle>
        <CardDescription>{g.description || "No description yet."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <OwnerLine names={ownersOf(g.id, [g])} />
        <p className="text-xs text-muted-foreground">{members.length} {members.length === 1 ? "member" : "members"} · {goals.length} {goals.length === 1 ? "goal" : "goals"} · created {fmtDate(g.created)}</p>
        {goals.length > 0 ? <ul className="space-y-1.5">{goals.map((x) => <CreatedGoalProgressRow key={x.id} g={x} members={members} />)}</ul> : <p className="text-sm text-muted-foreground">No goals yet.</p>}
        <Link href={`${BASE_PATH}/group?group=${g.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open group</Link>
      </CardContent>
    </Card>
  );
}
