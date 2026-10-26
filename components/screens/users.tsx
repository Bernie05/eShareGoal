"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Ban, Camera, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Crown, Eye, IdCard, RotateCcw, Search, ShieldAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { RoleBadge, useEmailMode, useSendEmail } from "@/components/app/view-as";
import { fmtDate } from "@/lib/money";
import type { User, UserStatus } from "@/lib/users-data";
import { cn } from "@/lib/utils";

const PAGE = 10;
const empty = { q: "", status: "", group: "", role: "" };
type Row = User & { records: number };
type Action = { kind: "approve" | "reject" | "revoke" | "restore" } | { kind: "transfer"; group: string } | null;

const today = "Oct 26, 2026";
const roleBadge = (role: string) => (role === "Owner" ? "owner" : role === "Viewer" ? "admin" : "member") as "owner" | "member" | "admin";
const REJECT_REASONS = ["ID is expired", "ID photo is unreadable", "Name does not match the ID", "Selfie does not match the ID", "Email not confirmed", "Other"];
const REVOKE_REASONS = ["Repeated wrong or duplicate records", "Reported by a group Owner", "Suspicious activity", "User asked to close the account", "Other"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{children}</dd></div>;
}

// Placeholder for an uploaded image: the preview never shows real ID photos.
const IdImage = ({ label, Icon }: { label: string; Icon: typeof IdCard }) => (
  <div className="flex aspect-[3/2] flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground"><Icon className="size-5" aria-hidden />{label}</div>
);

// ---------- Users: System Admin only. Review sign-ups, revoke access, transfer group ownership ----------
export function UsersScreen({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState(empty);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [heirs, setHeirs] = useState<Record<string, string>>({}); // group -> new owner id
  const send = useSendEmail();
  const emailMode = useEmailMode();

  const set = (patch: Partial<typeof empty>) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const open = rows.find((r) => r.id === openId) ?? null;
  const update = (id: string, fn: (u: Row) => Row) => setRows((rs) => rs.map((r) => (r.id === id ? fn(r) : r)));
  const log = (u: Row, line: string): Row => ({ ...u, history: [`${today} · ${line}`, ...u.history] });
  const ownedGroups = (u: Row) => u.memberships.filter((m) => m.role === "Owner").map((m) => m.group);
  // Who can take over a group: other active users already in it, then any other active user (they join as Owner).
  const candidates = (group: string, not: string) => {
    const active = rows.filter((r) => r.id !== not && r.status === "Active" && r.site === "User");
    return { inGroup: active.filter((r) => r.memberships.some((m) => m.group === group)), others: active.filter((r) => !r.memberships.some((m) => m.group === group)) };
  };
  const startAction = (a: Action) => { setReason(""); setNote(""); setHeirs({}); setAction(a); };

  // Move a group's ownership: the new owner becomes Owner (joining if needed), the old owner stays as a Member.
  const transfer = (from: Row, group: string, toId: string) => {
    const to = rows.find((r) => r.id === toId)!;
    setRows((rs) => rs.map((r) => {
      if (r.id === from.id) return log({ ...r, memberships: r.memberships.map((m) => (m.group === group ? { ...m, role: "Member" as const } : m)) }, `Ownership of ${group} moved to ${to.name} by System Admin`);
      if (r.id === toId) return log({ ...r, memberships: r.memberships.some((m) => m.group === group) ? r.memberships.map((m) => (m.group === group ? { ...m, role: "Owner" as const } : m)) : [...r.memberships, { group, role: "Owner" as const }] }, `Became Owner of ${group} (from ${from.name})`);
      return r;
    }));
    send(from.email, `You are no longer the Owner of ${group}`);
    send(to.email, `You are now the Owner of ${group}`);
  };

  const confirm = () => {
    if (!open || !action) return;
    const why = reason === "Other" ? note.trim() : [reason, note.trim()].filter(Boolean).join(": ");
    if (action.kind === "approve") { update(open.id, (u) => log({ ...u, status: "Active" }, "Approved by System Admin")); send(open.email, "Your eShareGoal account is approved"); }
    if (action.kind === "reject") { update(open.id, (u) => log({ ...u, status: "Rejected", note: why }, `Rejected by System Admin: ${why}`)); send(open.email, "Your eShareGoal sign-up was not approved"); }
    if (action.kind === "restore") { update(open.id, (u) => log({ ...u, status: "Active", note: undefined }, "Access restored by System Admin")); send(open.email, "Your eShareGoal access is restored"); }
    if (action.kind === "transfer") transfer(open, action.group, heirs[action.group]);
    if (action.kind === "revoke") {
      for (const g of ownedGroups(open)) transfer(open, g, heirs[g]); // every owned group gets a new Owner first
      update(open.id, (u) => log({ ...u, status: "Revoked", note: why }, `Access revoked by System Admin: ${why}`));
      send(open.email, "Your eShareGoal access was revoked");
    }
    setAction(null);
  };
  const needsReason = action?.kind === "reject" || action?.kind === "revoke";
  const reasonOk = !needsReason || (reason && (reason !== "Other" || note.trim()));
  const heirsOk = action?.kind === "transfer" ? !!heirs[action.group] : action?.kind === "revoke" && open ? ownedGroups(open).every((g) => heirs[g]) : true;

  const groupOpts = [...new Set(rows.flatMap((r) => r.memberships.map((m) => m.group)))].filter((g) => g !== "All groups").sort();
  const hits = useMemo(() => rows.filter((r) => {
    const q = f.q.trim().toLowerCase();
    return (!q || [r.name, r.email, r.verification?.fullName ?? ""].some((s) => s.toLowerCase().includes(q)))
      && (!f.status || r.status === f.status)
      && (!f.group || (f.group === "none" ? r.memberships.length === 0 : r.memberships.some((m) => m.group === f.group)))
      && (!f.role || (f.role === "admin" ? r.site === "System Admin" : r.memberships.some((m) => m.role === f.role)));
  }), [rows, f]);
  const active = Object.values(f).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(hits.length / PAGE));
  const from = page * PAGE;
  const count = (s: UserStatus) => rows.filter((r) => r.status === s).length;
  const pending = count("Pending review");

  const heirSelect = (group: string) => {
    const c = candidates(group, open!.id);
    return (
      <div key={group} className="space-y-1.5">
        <Label htmlFor={`heir-${group}`}>New Owner of {group}</Label>
        <NativeSelect id={`heir-${group}`} value={heirs[group] ?? ""} onChange={(e) => setHeirs((h) => ({ ...h, [group]: e.target.value }))}>
          <option value="">Choose a person…</option>
          {c.inGroup.length > 0 && <optgroup label={`Members of ${group}`}>{c.inGroup.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
          {c.others.length > 0 && <optgroup label="Other users (they join as Owner)">{c.others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
        </NativeSelect>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Users" description="Every account on eShareGoal. Review sign-ups, revoke access and move group ownership." actions={<Link href="/signup" className={buttonVariants({ variant: "outline" })}>Preview the sign-up form</Link>} />
      {pending > 0 && (
        <Alert>
          <ShieldAlert aria-hidden />
          <AlertTitle>{pending} {pending === 1 ? "sign-up is" : "sign-ups are"} waiting for ID review</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>They cannot use eShareGoal until you approve them.</span>
            <Button size="sm" onClick={() => set({ ...empty, status: "Pending review" })}>Review now</Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="All users" value={rows.length} />
        <StatCard label="Active" value={count("Active")} tone="success" />
        <StatCard label="Pending review" value={pending} tone="warning" hint="Waiting for ID review" />
        <StatCard label="Revoked or rejected" value={count("Revoked") + count("Rejected")} tone="danger" />
      </div>

      <Card><CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="u-q">Search</Label>
            <div className="relative"><Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden /><Input id="u-q" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name, legal name or email…" className="pl-8" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="u-status">Status</Label><NativeSelect id="u-status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All statuses</option>{["Active", "Pending review", "Invited", "Revoked", "Rejected"].map((s) => <option key={s}>{s}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="u-group">Group</Label><NativeSelect id="u-group" value={f.group} onChange={(e) => set({ group: e.target.value })}><option value="">All groups</option>{groupOpts.map((g) => <option key={g}>{g}</option>)}<option value="none">No group</option></NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="u-role">Role</Label><NativeSelect id="u-role" value={f.role} onChange={(e) => set({ role: e.target.value })}><option value="">All roles</option><option value="Owner">Owner</option><option value="Member">Member</option><option value="admin">System Admin</option></NativeSelect></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground" aria-live="polite"><span className="num font-medium text-foreground">{hits.length}</span> of {rows.length} users</span>
          {active > 0 && <Button variant="ghost" size="sm" onClick={() => set(empty)}><X aria-hidden /> Clear ({active})</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="overflow-x-auto">
        {hits.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No users match these filters.</p> : <>
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead><TableHead>Groups and roles</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Last active</TableHead><TableHead className="text-right">Records</TableHead><TableHead><span className="sr-only">Details</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>{hits.slice(from, from + PAGE).map((r) => (
              <TableRow key={r.id} className={cn("cursor-pointer", r.status === "Pending review" && "bg-warning-soft/40", (r.status === "Revoked" || r.status === "Rejected") && "text-muted-foreground")} onClick={() => setOpenId(r.id)}>
                <TableCell><p className="font-medium">{r.name}{r.site === "System Admin" && <RoleBadge role="admin" className="ml-2" />}</p><p className="text-xs text-muted-foreground">{r.email}</p></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{r.memberships.length ? r.memberships.map((m) => <Badge key={m.group} variant="outline" className="font-normal">{m.group} · {m.role}</Badge>) : <span className="text-xs text-muted-foreground">No group yet</span>}</div></TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="num">{fmtDate(r.joined)}</TableCell><TableCell>{r.lastActive}</TableCell>
                <TableCell className="num text-right">{r.records}</TableCell>
                <TableCell><Button variant={r.status === "Pending review" ? "outline" : "ghost"} size="sm" aria-label={`${r.status === "Pending review" ? "Review" : "View"} ${r.name}`} onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}><Eye aria-hidden />{r.status === "Pending review" ? " Review" : ""}</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <nav aria-label="User pages" className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
            <span className="num">{from + 1}-{Math.min(from + PAGE, hits.length)} of {hits.length}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft aria-hidden /> Previous</Button>
              <span className="num">Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight aria-hidden /></Button>
            </div>
          </nav>
        </>}
      </CardContent></Card>

      {/* ---------- User details ---------- */}
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">{open.name}<StatusBadge status={open.status} /></SheetTitle>
              <SheetDescription>{open.email} · {open.site}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6 text-sm">
              {open.note && <p className={cn("flex gap-2 rounded-lg bg-warning-soft px-3 py-2", toneText.warning)}><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{open.note}</p>}

              {open.site === "User" && (
                <div className="flex flex-wrap gap-2">
                  {open.status === "Pending review" && <><Button onClick={() => startAction({ kind: "approve" })}><Check aria-hidden /> Approve</Button><Button variant="outline" onClick={() => startAction({ kind: "reject" })}><X aria-hidden /> Reject</Button></>}
                  {open.status === "Active" && <Button variant="destructive" onClick={() => startAction({ kind: "revoke" })}><Ban aria-hidden /> Revoke access</Button>}
                  {open.status === "Revoked" && <Button variant="outline" onClick={() => startAction({ kind: "restore" })}><RotateCcw aria-hidden /> Restore access</Button>}
                  {open.status === "Rejected" && <Button variant="outline" onClick={() => { update(open.id, (u) => log({ ...u, status: "Pending review" }, "Review reopened by System Admin")); }}><RotateCcw aria-hidden /> Reopen review</Button>}
                </div>
              )}

              {open.verification ? (
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold"><IdCard className="size-4" aria-hidden /> Identity</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Field label="Legal name">{open.verification.fullName}</Field>
                    <Field label="Birthdate">{fmtDate(open.verification.birthdate)}</Field>
                    <Field label="Mobile">{open.verification.phone}</Field>
                    <Field label="Address">{open.verification.address}</Field>
                    <Field label="ID type">{open.verification.idType}</Field>
                    <Field label="ID number"><span className="font-mono text-xs">{open.verification.idNumber}</span></Field>
                    <Field label="ID expiry">{fmtDate(open.verification.idExpiry)}</Field>
                    <Field label="Submitted">{fmtDate(open.verification.submitted)}</Field>
                  </dl>
                  <div className="grid grid-cols-3 gap-2"><IdImage label="ID front" Icon={IdCard} /><IdImage label="ID back" Icon={IdCard} /><IdImage label="Selfie" Icon={Camera} /></div>
                  <p className="text-xs text-muted-foreground">Sample placeholders. In production, ID images are stored encrypted, shown only to System Admins, and every view is logged.</p>
                  <ul className="space-y-1 rounded-lg border p-3">
                    {open.verification.checks.map((c) => <li key={c.label} className={cn("flex items-center gap-2", !c.ok && toneText.warning)}>{c.ok ? <CircleCheck className="size-4 text-success" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{c.label}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground">Automatic checks only help. You make the decision.</p>
                </section>
              ) : open.site === "User" && <p className="text-muted-foreground">No ID submitted yet{open.status === "Invited" ? ": they have not signed up." : "."}</p>}

              <section className="space-y-2">
                <h3 className="font-semibold">Groups</h3>
                {open.memberships.length ? (
                  <ul className="divide-y rounded-lg border">{open.memberships.map((m) => (
                    <li key={m.group} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>{m.group}</span>
                      <span className="flex items-center gap-2"><RoleBadge role={roleBadge(m.role)} />{m.role === "Owner" && open.status === "Active" && <Button variant="ghost" size="sm" onClick={() => startAction({ kind: "transfer", group: m.group })}><Crown aria-hidden /> Transfer ownership</Button>}</span>
                    </li>
                  ))}</ul>
                ) : <p className="text-muted-foreground">Not in any group.</p>}
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">Account</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Field label="Joined">{fmtDate(open.joined)}</Field>
                  <Field label="Last active">{open.lastActive}</Field>
                  <Field label="Email">{open.verification?.emailVerified ? <span className="inline-flex items-center gap-1"><BadgeCheck className="size-4 text-success" aria-hidden />Confirmed</span> : "Not confirmed"}</Field>
                  <Field label="Records about them">{open.records}</Field>
                </dl>
                {open.records > 0 && <Link href="/design-preview/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>Open Activity History</Link>}
              </section>

              {open.history.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-semibold">Admin history</h3>
                  <ol className="space-y-1.5 border-l pl-3">{open.history.map((h) => <li key={h}>{h}</li>)}</ol>
                </section>
              )}
            </div>
          </>}
        </SheetContent>
      </Sheet>

      {/* ---------- Confirm an admin action ---------- */}
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          {open && action && <>
            <DialogHeader>
              <DialogTitle>{{ approve: `Approve ${open.name}?`, reject: `Reject ${open.name}?`, revoke: `Revoke access for ${open.name}?`, restore: `Restore access for ${open.name}?`, transfer: "Transfer ownership" }[action.kind]}</DialogTitle>
              <DialogDescription>
                {action.kind === "approve" && "They can sign in and join groups right away."}
                {action.kind === "reject" && "They cannot use eShareGoal. They can sign up again with a valid ID."}
                {action.kind === "revoke" && "They are signed out and cannot sign in. Their past records stay in each group's history."}
                {action.kind === "restore" && "They can sign in again with their old groups and roles."}
                {action.kind === "transfer" && `${action.group}: ${open.name} stays in the group as a Member.`}
              </DialogDescription>
            </DialogHeader>
            {action.kind === "revoke" && ownedGroups(open).length > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm">{open.name} owns {ownedGroups(open).join(" and ")}. Choose a new Owner for each group first.</p>
                {ownedGroups(open).map(heirSelect)}
              </div>
            )}
            {action.kind === "transfer" && heirSelect(action.group)}
            {needsReason && (
              <div className="space-y-3">
                <div className="space-y-1.5"><Label htmlFor="act-reason">Reason</Label>
                  <NativeSelect id="act-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose a reason…</option>{(action.kind === "reject" ? REJECT_REASONS : REVOKE_REASONS).map((r) => <option key={r}>{r}</option>)}</NativeSelect>
                </div>
                <div className="space-y-1.5"><Label htmlFor="act-note">{reason === "Other" ? "Explain (required)" : "Note to the user (optional)"}</Label><Textarea id="act-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{emailMode === "prod" ? "An email will be sent to the people affected." : "Development mode: no email is sent, you will see a notice instead."}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
              <Button variant={action.kind === "revoke" || action.kind === "reject" ? "destructive" : "default"} disabled={!reasonOk || !heirsOk} onClick={confirm}>
                {{ approve: "Approve", reject: "Reject sign-up", revoke: "Revoke access", restore: "Restore access", transfer: "Transfer ownership" }[action.kind]}
              </Button>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
