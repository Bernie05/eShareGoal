"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, FlaskConical, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, SectionTitle } from "@/components/app/primitives";
import { saveOwnWorkflows, useImportWorkflows, useOwnWorkflows } from "@/components/app/workflow-store";
import { LIMITS, type ImportWorkflow } from "@/lib/import-workflows";
import { blankWorkflow, TestDialog, WorkflowEditor, WorkflowInfo, WorkflowSteps } from "./import-workflows";
import { ConfirmDelete } from "@/components/app/confirm-delete";

// ---------- Owner: the workflows their Gmail import jobs can run ----------
// Common ones come from the System Admin (read-only here: test or copy them); the Owner's own are made and changed here
// and can be used in any goal they own (Goal setup → Scheduled jobs → New scheduled job → Pull payments from Gmail).
// inUse: workflow id -> how many import jobs use it (read on the server from every goal's setup).
export function OwnerWorkflowsScreen({ inUse }: { inUse: Record<string, number> }) {
  const common = useImportWorkflows().filter((w) => w.status === "Published");
  const own = useOwnWorkflows();
  const [editing, setEditing] = useState<ImportWorkflow | null>(null);
  const [testing, setTesting] = useState<ImportWorkflow | null>(null);
  const [deleting, setDeleting] = useState<ImportWorkflow | null>(null);
  const full = own.length >= LIMITS.workflows;
  const copy = (w: ImportWorkflow) => setEditing({ ...w, id: "", builtIn: false, name: `${w.name} (my copy)`, status: "Published" });
  const used = (w: ImportWorkflow) => inUse[w.id] ?? 0;

  return (
    <>
      <PageHeader title="Workflows" description="The logic a Gmail import job runs on each pull: which emails are payments (Where) and what to read from them. Use the System Admin's common workflows, or make your own."
        actions={<Button disabled={full} onClick={() => setEditing(blankWorkflow())}><Plus aria-hidden /> New workflow</Button>} />
      <p className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm"><CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>To run one: open a group → <span className="font-medium">Goal setup</span> → <span className="font-medium">Scheduled jobs</span> → <span className="font-medium">New scheduled job</span> → <span className="font-medium">Pull payments from Gmail</span>, pick the workflow and set when to pull.</span></p>

      <section className="space-y-3">
        <SectionTitle>My workflows</SectionTitle>
        {own.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">None yet. Click New workflow, or copy a common one below and change it for your bank&apos;s emails.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {own.map((w) => (
            <Card key={w.id} className="h-full">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Workflow className="size-4" aria-hidden /></span>
                  <Badge variant="secondary">Mine</Badge>
                </div>
                <div className="min-w-0"><p className="font-medium">{w.name}</p>{w.about && <p className="text-sm text-muted-foreground">{w.about}</p>}</div>
                <WorkflowSteps w={w} />
                <p className="text-xs text-muted-foreground">{used(w) ? `Used by ${used(w)} import ${used(w) === 1 ? "job" : "jobs"}` : "Not used by an import job yet"}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTesting(w)}><FlaskConical aria-hidden /> Test</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(w)}><Pencil aria-hidden /> Edit</Button>
                  <Button variant="outline" size="sm" disabled={full} onClick={() => copy(w)}><Copy aria-hidden /> Duplicate</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={used(w) > 0} title={used(w) ? "An import job uses it: change or delete that job first" : undefined} onClick={() => setDeleting(w)}><Trash2 aria-hidden /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <SectionTitle aside={<span className="text-xs text-muted-foreground">From the System Admin · read-only</span>}>Common workflows</SectionTitle>
        {common.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">The System Admin has not published a workflow yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {common.map((w) => (
            <Card key={w.id} className="h-full">
              <CardContent className="flex h-full flex-col gap-3">
                <WorkflowInfo w={w} />
                <p className="text-xs text-muted-foreground">{used(w) ? `Used by ${used(w)} import ${used(w) === 1 ? "job" : "jobs"}` : "Not used by an import job yet"}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTesting(w)}><FlaskConical aria-hidden /> Test</Button>
                  <Button variant="outline" size="sm" disabled={full} onClick={() => copy(w)}><Copy aria-hidden /> Copy to my workflows</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {editing && <WorkflowEditor key={editing.id || "new"} owner initial={editing} all={[...common, ...own]} onClose={() => setEditing(null)}
        onSave={(saved) => saveOwnWorkflows(editing.id ? own.map((x) => (x.id === editing.id ? saved : x)) : [...own, saved])} />}
      {testing && <TestDialog w={testing} onClose={() => setTesting(null)} />}
      {deleting && <ConfirmDelete item={{ name: deleting.name, note: "No import job uses it. This cannot be undone.", remove: () => saveOwnWorkflows(own.filter((x) => x.id !== deleting.id)) || (toast.error("Could not save. This browser's storage is full or blocked."), false) }} onClose={() => setDeleting(null)} />}
    </>
  );
}
