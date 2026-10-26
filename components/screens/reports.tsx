"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Eye, Play, RotateCcw, Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, StatCard, StatusBadge, toneText } from "@/components/app/primitives";
import { useSendEmail } from "@/components/app/view-as";
import { reports as initial, type Report, type ReportStatus } from "@/lib/reports-data";
import { cn } from "@/lib/utils";

const PAGE = 10;
const empty = { q: "", type: "", status: "", priority: "" };
const now = "Oct 26, 9:45 AM";
const priorityTone = { High: toneText.danger, Medium: toneText.warning, Low: "text-muted-foreground" } as const;

// ---------- Reports: System Admin only. Everything reported by users or found by the system, in one inbox ----------
export function ReportsScreen() {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState(empty);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const send = useSendEmail();
  const set = (patch: Partial<typeof empty>) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const open = rows.find((r) => r.id === openId) ?? null;

  const move = (r: Report, status: ReportStatus, verb: string) => {
    const line = `${now} · ${verb} by System Admin${note.trim() ? `: ${note.trim()}` : ""}`;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status, timeline: [...x.timeline, line] } : x)));
    if (r.by !== "System" && (status === "Resolved" || status === "Dismissed")) send(`${r.by.toLowerCase().split(" ")[0]}@example.com`, `Your report ${r.id} was ${status.toLowerCase()}`);
    setNote("");
  };

  const hits = useMemo(() => rows.filter((r) => {
    const q = f.q.trim().toLowerCase();
    return (!q || [r.id, r.title, r.body, r.by, r.group ?? "", r.about.ref ?? ""].some((s) => s.toLowerCase().includes(q)))
      && (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!f.priority || r.priority === f.priority);
  }), [rows, f]);
  const count = (s: ReportStatus) => rows.filter((r) => r.status === s).length;
  const active = Object.values(f).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(hits.length / PAGE));
  const from = page * PAGE;
  const sel = (id: keyof typeof empty, label: string, opts: string[], all: string) => (
    <div className="space-y-1.5"><Label htmlFor={`r-${id}`}>{label}</Label><NativeSelect id={`r-${id}`} value={f[id]} onChange={(e) => set({ [id]: e.target.value })}><option value="">{all}</option>{opts.map((o) => <option key={o}>{o}</option>)}</NativeSelect></div>
  );

  return (
    <>
      <PageHeader title="Reports" description="Problems people reported, reports about users, and problems the system found. Newest first." />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={count("Open")} tone="warning" hint="Not looked at yet" />
        <StatCard label="In review" value={count("In review")} />
        <StatCard label="High priority open" value={rows.filter((r) => r.priority === "High" && r.status !== "Resolved" && r.status !== "Dismissed").length} tone="danger" />
        <StatCard label="Closed" value={count("Resolved") + count("Dismissed")} tone="success" hint="Resolved or dismissed" />
      </div>

      <Card><CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="r-q">Search</Label><div className="relative"><Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden /><Input id="r-q" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Report ID, title, person, reference…" className="pl-8" /></div></div>
          {sel("type", "Type", ["Issue", "User report", "Payment dispute", "Sign-up flag", "System"], "All types")}
          {sel("status", "Status", ["Open", "In review", "Resolved", "Dismissed"], "All statuses")}
          {sel("priority", "Priority", ["High", "Medium", "Low"], "All priorities")}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground" aria-live="polite"><span className="num font-medium text-foreground">{hits.length}</span> of {rows.length} reports</span>
          {active > 0 && <Button variant="ghost" size="sm" onClick={() => set(empty)}><X aria-hidden /> Clear ({active})</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="overflow-x-auto">
        {hits.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No reports match these filters.</p> : <>
          <Table>
            <TableHeader><TableRow><TableHead>Report</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>Where</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
            <TableBody>{hits.slice(from, from + PAGE).map((r) => (
              <TableRow key={r.id} className={cn("cursor-pointer", r.status === "Open" && "font-medium")} onClick={() => setOpenId(r.id)}>
                <TableCell><span className="font-mono text-xs text-muted-foreground">{r.id}</span><p>{r.title}</p></TableCell>
                <TableCell>{r.type}</TableCell><TableCell>{r.by}</TableCell><TableCell className="font-normal">{r.group ?? "-"}</TableCell>
                <TableCell className={priorityTone[r.priority]}>{r.priority}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell><TableCell className="font-normal">{r.created}</TableCell>
                <TableCell><Button variant="ghost" size="icon-sm" aria-label={`Open ${r.id}`} onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}><Eye aria-hidden /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <nav aria-label="Report pages" className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
            <span className="num">{from + 1}-{Math.min(from + PAGE, hits.length)} of {hits.length}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft aria-hidden /> Previous</Button>
              <span className="num">Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight aria-hidden /></Button>
            </div>
          </nav>
        </>}
      </CardContent></Card>

      <Sheet open={open !== null} onOpenChange={(o) => { if (!o) { setOpenId(null); setNote(""); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{open.id}</span>{open.title}</SheetTitle>
              <SheetDescription>{open.type} · from {open.by} · {open.created}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6 text-sm">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={open.status} /><span className={cn("text-xs font-medium", priorityTone[open.priority])}>{open.priority} priority</span>{open.group && <span className="text-xs text-muted-foreground">{open.group}</span>}</div>
              <p className="rounded-lg bg-muted/40 p-3">{open.body}</p>
              {(open.about.user || open.about.ref) && (
                <div className="flex flex-wrap gap-2">
                  {open.about.user && <Link href="/design-preview/users" className={buttonVariants({ variant: "outline", size: "sm" })}>Open in Users</Link>}
                  {open.about.ref && <Link href="/design-preview/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>Find {open.about.ref} in Activity History</Link>}
                </div>
              )}
              <section className="space-y-2">
                <h3 className="font-semibold">Timeline</h3>
                <ol className="space-y-1.5 border-l pl-3">{open.timeline.map((t) => <li key={t}>{t}</li>)}</ol>
              </section>
              <section className="space-y-2">
                <Label htmlFor="r-note">Note {open.by !== "System" && "(sent to the reporter when you close the report)"}</Label>
                <Textarea id="r-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you found or did…" />
                <div className="flex flex-wrap gap-2">
                  {open.status === "Open" && <Button variant="outline" onClick={() => move(open, "In review", "Review started")}><Play aria-hidden /> Start review</Button>}
                  {(open.status === "Open" || open.status === "In review") && <>
                    <Button disabled={!note.trim()} onClick={() => move(open, "Resolved", "Resolved")}><CheckCheck aria-hidden /> Resolve</Button>
                    <Button variant="ghost" disabled={!note.trim()} onClick={() => move(open, "Dismissed", "Dismissed")}><X aria-hidden /> Dismiss</Button>
                  </>}
                  {(open.status === "Resolved" || open.status === "Dismissed") && <Button variant="outline" onClick={() => move(open, "Open", "Reopened")}><RotateCcw aria-hidden /> Reopen</Button>}
                </div>
                {(open.status === "Open" || open.status === "In review") && <p className="text-xs text-muted-foreground">Resolve and Dismiss need a note so the reporter knows what happened.</p>}
              </section>
            </div>
          </>}
        </SheetContent>
      </Sheet>
    </>
  );
}
