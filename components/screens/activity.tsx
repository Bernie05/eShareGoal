"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Dumbbell, Eye, Landmark, ListChecks, PiggyBank, Search, Target, Users, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatusBadge, toneText } from "@/components/app/primitives";
import { RoleBadge } from "@/components/app/view-as";
import { ISSUE_STATUSES, type Activity } from "@/lib/activity-data";
import { groups, type GoalType } from "@/lib/demo-data";
import { fmtDate, peso } from "@/lib/money";
import type { ViewAs } from "@/lib/view-as";
import { cn } from "@/lib/utils";

const PAGE = 10;
const ALL = "";
const empty = { q: "", member: ALL, kind: ALL, status: ALL, source: ALL, from: "", to: "", issues: false };
type Filters = typeof empty;

const goalIcon: Record<GoalType, typeof Landmark> = { loan: Landmark, shared_money: PiggyBank, fitness: Dumbbell, tasks: ListChecks, custom: Target };
const goalTypeOf = new Map(groups.flatMap((g) => g.goals).map((x) => [x.id, x.type]));
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
const when = (at: string) => `${fmtDate(at.slice(0, 10))}, ${at.slice(11, 16)}`;
const moneyOut = (a: Activity) => a.kind === "Loan payment" || a.kind === "Expense" || a.kind === "Withdrawal";
// Imports are proposals, not money moved yet: show the amount without a sign or colour.
const signed = (a: Activity) => a.amount === null ? "-" : a.kind === "Import" ? peso(a.amount) : `${moneyOut(a) ? "-" : "+"}${peso(a.amount)}`;
const isIssue = (a: Activity) => ISSUE_STATUSES.includes(a.status);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const panel = "[&_a]:no-underline [&_p:not(:last-child)]:mb-0";

function match(a: Activity, f: Filters) {
  const q = f.q.trim().toLowerCase();
  return (!q || [a.subject ?? "", a.by, a.detail, a.ref ?? ""].some((s) => s.toLowerCase().includes(q)))
    && (!f.member || a.subject === f.member) && (!f.kind || a.kind === f.kind) && (!f.status || a.status === f.status)
    && (!f.source || a.source === f.source) && (!f.from || a.at.slice(0, 10) >= f.from) && (!f.to || a.at.slice(0, 10) <= f.to)
    && (!f.issues || isIssue(a));
}

function downloadCsv(rows: Activity[], name: string) {
  const cols = ["When", "Group", "Goal", "Type", "Member", "Recorded by", "Amount (PHP)", "Status", "Source", "Reference", "Detail"];
  const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = rows.map((a) => [a.at.replace("T", " "), a.groupName, a.goal, a.kind, a.subject ?? "", a.by, a.amount === null ? "" : (a.amount / 100).toFixed(2), a.status, a.source, a.ref ?? "", a.detail].map(cell).join(","));
  const url = URL.createObjectURL(new Blob([[cols.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` }).click();
  URL.revokeObjectURL(url);
}

function IssueTag({ n }: { n: number }) {
  return n > 0 ? <span className={cn("shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium", toneText.warning)}><AlertTriangle className="mr-1 inline size-3" aria-hidden />{plural(n, "issue")}</span> : null;
}

// ---------- One goal (or whole-group) section: its own filters, table and Previous / Next pages ----------
function GoalSection({ id, rows, title, onOpen }: { id: string; rows: Activity[]; title: string; onOpen: (a: Activity) => void }) {
  const [f, setF] = useState<Filters>(empty);
  const [page, setPage] = useState(0);
  const set = (patch: Partial<Filters>) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const hits = useMemo(() => rows.filter((a) => match(a, f)), [rows, f]);
  const active = Object.entries(f).filter(([k, v]) => v !== empty[k as keyof Filters]).length;
  const pages = Math.max(1, Math.ceil(hits.length / PAGE));
  const from = page * PAGE;
  const fid = (k: string) => `${id}-${k}`; // unique ids: every section has its own filter fields

  const select = (k: "member" | "kind" | "status" | "source", label: string, opts: string[], allLabel: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={fid(k)}>{label}</Label>
      <NativeSelect id={fid(k)} value={f[k]} onChange={(e) => set({ [k]: e.target.value })}>
        <option value={ALL}>{allLabel}</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </NativeSelect>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={fid("q")}>Search</Label>
            <div className="relative">
              <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input id={fid("q")} value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Reference, member, note…" className="bg-background pl-8" />
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor={fid("from")}>From</Label><Input id={fid("from")} type="date" className="bg-background" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor={fid("to")}>To</Label><Input id={fid("to")} type="date" className="bg-background" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></div>
          {select("status", "Status", uniq(rows.map((a) => a.status)), "All statuses")}
          {select("source", "Source", uniq(rows.map((a) => a.source)), "All sources")}
          {select("member", "Member", uniq(rows.flatMap((a) => (a.subject ? [a.subject] : []))), "All members")}
          {select("kind", "Type", uniq(rows.map((a) => a.kind)), "All types")}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={f.issues} onCheckedChange={(v) => set({ issues: v })} />
            <span className="font-medium">Issues only</span><span className="text-muted-foreground">Pending, reversed, rejected or duplicate</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground" aria-live="polite"><span className="num font-medium text-foreground">{hits.length}</span> of {rows.length} records</span>
            {active > 0 && <Button variant="ghost" size="sm" onClick={() => set(empty)}><X aria-hidden /> Clear ({active})</Button>}
            <Button variant="outline" size="sm" disabled={!hits.length} onClick={() => downloadCsv(hits, `activity-${id}`)}><Download aria-hidden /> CSV</Button>
          </div>
        </div>
      </div>

      {hits.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No records in {title} match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Member</TableHead><TableHead>Recorded by</TableHead>
              <TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead><span className="sr-only">Details</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>{hits.slice(from, from + PAGE).map((a) => (
              <TableRow key={a.id} className={cn("cursor-pointer", isIssue(a) && "bg-warning-soft/40", a.status === "Reversed" && "text-muted-foreground")} onClick={() => onOpen(a)}>
                <TableCell className="num">{when(a.at)}</TableCell><TableCell>{a.kind}</TableCell>
                <TableCell>{a.subject ?? <span className="text-muted-foreground">-</span>}</TableCell><TableCell>{a.by}</TableCell>
                <TableCell className="font-mono text-xs">{a.ref ?? "-"}</TableCell><TableCell><StatusBadge status={a.status} /></TableCell>
                <TableCell className={cn("num text-right font-medium", a.amount !== null && a.kind !== "Import" && (moneyOut(a) ? toneText.danger : toneText.success), a.status === "Reversed" && "line-through")}>{signed(a)}</TableCell>
                <TableCell><Button variant="ghost" size="icon-sm" aria-label={`Details for ${a.kind.toLowerCase()} ${a.ref ?? a.subject ?? ""}, ${when(a.at)}`} onClick={(e) => { e.stopPropagation(); onOpen(a); }}><Eye aria-hidden /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <nav aria-label={`${title} pages`} className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
            <span className="num">{from + 1}-{Math.min(from + PAGE, hits.length)} of {hits.length}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft aria-hidden /> Previous</Button>
              <span className="num">Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight aria-hidden /></Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

// ---------- Activity History: Group (accordion) > Goal (accordion) > filters + table ----------
// The System Admin sees every group; Owners and Members only the goals they joined (rows arrive already scoped).
export function ActivityHistory({ rows, viewAs }: { rows: Activity[]; viewAs: ViewAs }) {
  const [open, setOpen] = useState<Activity | null>(null);
  const admin = viewAs === "admin";

  // Groups in sidebar order; inside each, goals in sidebar order, then a "Whole group" section for group-level rows.
  const tree = useMemo(() => groups.flatMap((g) => {
    const mine = rows.filter((a) => a.groupId === g.id);
    if (!mine.length) return [];
    const sections = [...g.goals.map((x) => ({ id: x.id, title: x.name, type: goalTypeOf.get(x.id) as GoalType | undefined })), { id: "", title: "Whole group", type: undefined }]
      .map((s) => ({ ...s, rows: mine.filter((a) => (a.goalId ?? "") === s.id) }))
      .filter((s) => s.rows.length);
    return [{ id: g.id, name: g.name, rows: mine, sections }];
  }), [rows]);
  const issues = rows.filter(isIssue).length;

  return (
    <>
      <PageHeader
        title="Activity History"
        description={admin ? "Everything recorded in every group. Open a group, then a goal, to filter its records and investigate an issue." : "Activity in the goals you joined. Open a group, then a goal."}
        actions={<Button variant="outline" onClick={() => downloadCsv(rows, "activity-history")} disabled={!rows.length}><Download aria-hidden /> Export all</Button>}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">You are viewing as</span><RoleBadge />
        <span className="text-muted-foreground">{plural(rows.length, "record")} in {plural(tree.length, "group")}{issues > 0 && <> · <span className={cn("font-medium", toneText.warning)}>{issues} need a look</span></>}</span>
      </div>

      {tree.length === 0 ? (
        <EmptyState title="No activity yet" body="Records, imports and changes in your groups will show up here." />
      ) : (
        <Accordion multiple defaultValue={[tree[0].id]} className="gap-3">
          {tree.map((g) => (
            <AccordionItem key={g.id} value={g.id} className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0">
              <AccordionTrigger className="min-w-0 items-center gap-3 px-4 py-3.5 hover:no-underline">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Users className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{g.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{plural(g.sections.length, "section")} · {plural(g.rows.length, "record")} · latest {when(g.rows[0].at)}</span>
                </span>
                <IssueTag n={g.rows.filter(isIssue).length} />
              </AccordionTrigger>
              <AccordionContent className={`px-4 pt-1 pb-4 ${panel}`}>
                <Accordion multiple className="gap-2">
                  {g.sections.map((s) => {
                    const Icon = s.type ? goalIcon[s.type] : Users;
                    return (
                      <AccordionItem key={s.id || "group"} value={s.id || "group"} className="rounded-lg border not-last:border-b">
                        <AccordionTrigger className="min-w-0 items-center gap-3 px-3 py-2.5 hover:no-underline">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{s.title}</span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">{plural(s.rows.length, "record")} · latest {when(s.rows[0].at)}</span>
                          </span>
                          <IssueTag n={s.rows.filter(isIssue).length} />
                        </AccordionTrigger>
                        <AccordionContent keepMounted className={`px-3 pt-1 pb-3 ${panel}`}>{/* keepMounted: filters survive collapsing */}
                          <GoalSection id={`${g.id}-${s.id || "group"}`} rows={s.rows} title={`${g.name} / ${s.title}`} onOpen={setOpen} />
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          {open && <>
            <DialogHeader>
              <DialogTitle>{open.kind}{open.amount !== null && ` · ${peso(open.amount)}`}</DialogTitle>
              <DialogDescription>{open.groupName} · {open.goal} · {when(open.at)}</DialogDescription>
            </DialogHeader>
            {isIssue(open) && <p className={cn("flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm", toneText.warning)}><AlertTriangle className="size-4" aria-hidden /> {open.status}: {open.detail}</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([["Member", open.subject ?? "-"], ["Recorded by", open.by], ["Status", <StatusBadge key="s" status={open.status} />], ["Source", open.source], ["Reference", open.ref ?? "-"], ["Note", open.detail]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className={cn("font-medium", k === "Reference" && "font-mono text-xs")}>{v}</dd></div>
              ))}
            </dl>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Audit trail (append-only)</p>
              <ol className="space-y-1.5 border-l pl-3 text-sm">{open.audit.map((line) => <li key={line}>{line}</li>)}</ol>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
