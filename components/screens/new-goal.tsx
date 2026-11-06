"use client";

import { useState } from "react";
import { TODAY } from "@/lib/demo-data";
import { toast } from "sonner";
import { Lock, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, SectionTitle } from "@/components/app/primitives";
import { useCreatedGoals, useSaveCreatedGoals, writeCookie } from "@/components/app/view-as";
import { type GoalScope } from "@/lib/created-goals";
import { type GoalRequest } from "@/lib/goal-requests";
import { DashboardPreview, templateIcon } from "@/components/app/dashboard-preview";
import { availableIn, isReadyMade, modeOf, type FieldKind, type Template, type TemplateField } from "@/lib/goal-templates";
import { cn } from "@/lib/utils";
import { BASE_PATH, GOAL_REQUESTS_COOKIE, MAX_CREATED_GOALS, MAX_GOAL_REQUESTS } from "@/lib/constants";

const newGoalId = (name: string) => `goal-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "goal"}-${Date.now().toString(36).slice(-4)}`;
const newRequestId = () => `GR-${Date.now().toString(36).slice(-6)}`;
const inputType: Record<FieldKind, string> = { money: "text", number: "number", date: "date", text: "text" };
const requestTone = { Open: "Waiting for the System Admin", Built: "Ready", Rejected: "Rejected" } as const;

interface TemplateOptionProps {
  t: Template;
  checked: boolean;
  onPick: () => void;
}
function TemplateOption({ t, checked, onPick }: TemplateOptionProps) {
  const Icon = templateIcon[t.icon];
  const locked = t.fields.filter((f) => modeOf(f) === "locked");
  return (
    <label className="relative cursor-pointer">
      <input type="radio" name="tpl" checked={checked} onChange={onPick} className="peer sr-only" />
      <Card className="h-full transition-colors peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2"><span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>{!t.builtIn && <Badge variant="secondary">Added by admin</Badge>}</div>
        <p className="font-medium">{t.name}</p><p className="text-sm text-muted-foreground">{t.description}</p>
        {locked.length > 0 && <p className="flex items-start gap-1 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden /><span>{locked.map((f) => `${f.label}: ${f.value}`).join(" · ")}</span></p>}
      </CardContent></Card>
    </label>
  );
}

interface NewGoalFormProps {
  templates: Template[];
  groups: { id: string; name: string; members: string[] }[];
  defaultGroup?: string;
  requests: GoalRequest[];
}
// ---------- Create goal (Owner): pick a group, then a ready-made goal or a template, fill what is left, see the dashboard it gets ----------
// requests: this Owner's "Request a goal type" requests, so they can see what happened to them.
export function NewGoalForm({ templates, groups, defaultGroup, requests: initialRequests }: NewGoalFormProps) {
  const goals = useCreatedGoals();
  const save = useSaveCreatedGoals();
  const [groupId, setGroupId] = useState(defaultGroup ?? groups[0]?.id ?? "");
  const [status, setStatus] = useState<"Active" | "Paused">("Active");
  const [pick, setPick] = useState(templates.find((t) => t.id === "loan")?.id ?? templates[0]?.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [scopeChoice, setScopeChoice] = useState<GoalScope | null>(null); // null = what the template suggests
  const [picked, setPicked] = useState<string[] | null>(null); // null = everyone in the group
  const [requests, setRequests] = useState(initialRequests);
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState({ name: "", what: "", tried: false });

  const group = groups.find((g) => g.id === groupId);
  const avail = templates.filter((x) => availableIn(x, groupId));
  const t = avail.find((x) => x.id === pick) ?? avail[0];
  const readyMade = avail.filter(isReadyMade);
  const others = avail.filter((x) => !isReadyMade(x));
  const members = group?.members ?? [];
  const chosen = (picked ?? members).filter((m) => members.includes(m));

  const sendRequest = () => {
    setAsk((a) => ({ ...a, tried: true }));
    if (ask.name.trim().length < 3 || ask.what.trim().length < 10) return;
    const r: GoalRequest = { id: newRequestId(), name: ask.name.trim(), what: ask.what.trim(), group: group?.name ?? "-", by: "Bernz", created: "Oct 26, 2026, 10:00 AM", status: "Open" };
    const next = [r, ...requests].slice(0, MAX_GOAL_REQUESTS);
    if (!writeCookie(GOAL_REQUESTS_COOKIE, next)) return;
    setRequests(next); setAsking(false); setAsk({ name: "", what: "", tried: false });
    toast.success("Request sent to the System Admin", { description: `${r.id} · You will get an email when "${r.name}" is ready.` });
  };
  const requestButton = <Button variant="outline" onClick={() => setAsking(true)}><MessageSquarePlus aria-hidden /> Request a goal type</Button>;
  const requestDialog = (
    <Dialog open={asking} onOpenChange={setAsking}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a goal type</DialogTitle><DialogDescription>Tell the System Admin what kind of goal you need. They can build a template for it; you will see it in Create goal.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="rq-name">Name</Label><Input id="rq-name" value={ask.name} onChange={(e) => setAsk((a) => ({ ...a, name: e.target.value }))} placeholder="Tuition Fund" aria-invalid={(ask.tried && ask.name.trim().length < 3) || undefined} />{ask.tried && ask.name.trim().length < 3 && <p role="alert" className="text-xs text-destructive">Use at least 3 characters.</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="rq-what">What should it track?</Label><Textarea id="rq-what" rows={3} value={ask.what} onChange={(e) => setAsk((a) => ({ ...a, what: e.target.value }))} placeholder="Save for each semester's tuition, with due dates per semester" aria-invalid={(ask.tried && ask.what.trim().length < 10) || undefined} />{ask.tried && ask.what.trim().length < 10 && <p role="alert" className="text-xs text-destructive">Describe it in a few words (at least 10 characters).</p>}</div>
          <p className="text-xs text-muted-foreground">For {group?.name ?? "your group"}.</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button><Button disabled={requests.length >= MAX_GOAL_REQUESTS && requests.every((r) => r.status === "Open")} onClick={sendRequest}>Send request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
  const requestList = requests.length > 0 && (
    <Card>
      <CardHeader><CardTitle>Your goal type requests</CardTitle></CardHeader>
      <CardContent><ul className="divide-y text-sm">{requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><span className="font-mono text-xs text-muted-foreground">{r.id}</span> <span className="font-medium">{r.name}</span> · {r.group}{r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}</span>
          <Badge variant={r.status === "Built" ? "secondary" : "outline"} className={cn(r.status === "Rejected" && "text-destructive")}>{requestTone[r.status]}</Badge>
        </li>
      ))}</ul></CardContent>
    </Card>
  );
  const top = (
    <>
      <PageHeader title="Create a goal" description="Pick a group, then a ready-made goal or a template. Values the System Admin set are locked." actions={requestButton} />
      <Card><CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="g-group">Group</Label><NativeSelect id="g-group" value={groupId} onChange={(e) => { setGroupId(e.target.value); setPicked(null); setTried(false); }}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect><p className="text-xs text-muted-foreground">Groups where you are the Owner.</p></div>
        <div className="space-y-1.5"><Label htmlFor="g-status">Status</Label><NativeSelect id="g-status" value={status} onChange={(e) => setStatus(e.target.value as "Active" | "Paused")}><option>Active</option><option>Paused</option></NativeSelect></div>
      </CardContent></Card>
    </>
  );
  if (!t) return <>{top}<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No goal types are available for {group?.name}. Request one and the System Admin can add it.</p>{requestList}{requestDialog}</>;

  const key = (label: string) => `${t.id}:${label}`;
  const valueOf = (f: TemplateField) => (modeOf(f) === "locked" ? f.value ?? "" : values[key(f.label)] ?? (modeOf(f) === "suggested" ? f.value ?? "" : ""));
  const nameField: TemplateField = { label: "Goal name", kind: "text", required: true };
  const goalName = values[key("Goal name")] ?? (isReadyMade(t) ? t.name : "");
  const fields = [nameField, ...t.fields];
  const valueFor = (f: TemplateField) => (f === nameField ? goalName : valueOf(f));
  const missing = fields.filter((f) => f.required && !valueFor(f).trim()).map((f) => f.label);
  const badMoney = t.fields.filter((f) => f.kind === "money" && valueOf(f) && !/^\d+(\.\d{1,2})?$/.test(valueOf(f).replace(/,/g, ""))).map((f) => f.label);
  // The System Admin can fix single/each per template; otherwise a "per member" target suggests one goal per member and the Owner can switch.
  const fixedScope = t.scope === "single" || t.scope === "each" ? t.scope : null;
  const scope: GoalScope = fixedScope ?? scopeChoice ?? (t.fields.some((f) => /per member/i.test(f.label)) ? "each" : "single");
  const targetField = t.fields.find((f) => f.kind === "money" || f.kind === "number")?.label;
  const noOne = scope === "each" && chosen.length === 0;
  const choose = (id: string) => { setPick(id); setTried(false); setScopeChoice(null); };

  const create = () => {
    setTried(true);
    if (missing.length || badMoney.length || !groupId || noOne) return;
    const name = goalName.trim();
    const id = newGoalId(name);
    save([...goals, {
      id, name, groupId, status, created: TODAY, templateId: t.id,
      template: { name: t.name, icon: t.icon, measure: t.measure, fields: t.fields.map(({ label, kind, required, mode }) => ({ label, kind, required, ...(mode === "locked" ? { mode } : {}) })), widgets: t.widgets },
      values: Object.fromEntries(t.fields.map((f) => [f.label, valueOf(f)]).filter(([, v]) => v)),
      scope, participants: scope === "each" && chosen.length < members.length ? chosen : undefined,
    }], `${BASE_PATH}/my-goal?goal=${id}`);
    toast.success(`${name} created`, { description: scope === "each" ? `One goal for each of ${chosen.length} members` : `One shared goal for ${group?.name}` });
  };
  return (
    <>
      {top}
      {readyMade.length > 0 && <>
        <SectionTitle aside={<span className="text-xs text-muted-foreground">Set up by the System Admin: pick one and choose who takes part</span>}>Ready-made goals</SectionTitle>
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="sr-only">Ready-made goals</legend>{readyMade.map((x) => <TemplateOption key={x.id} t={x} checked={t.id === x.id} onPick={() => choose(x.id)} />)}</fieldset>
      </>}
      {others.length > 0 && <>
        <SectionTitle>Templates</SectionTitle>
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="sr-only">Goal templates</legend>{others.map((x) => <TemplateOption key={x.id} t={x} checked={t.id === x.id} onPick={() => choose(x.id)} />)}</fieldset>
      </>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.name} details</CardTitle><CardDescription>For {group?.name}.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">Who is this goal for?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([["single", "One shared goal", "Everyone adds to the same target. Example: save ₱10,000 together."], ["each", "Each member has their own goal", "Everyone gets the same target. Example: walk 10,000 km each."]] as const).map(([v, title, hint]) => (
                  <label key={v} className={cn("flex items-start gap-2 rounded-lg border p-3", scope === v && "border-primary bg-primary/5", fixedScope ? fixedScope !== v && "opacity-50" : "cursor-pointer")}>
                    <input type="radio" name="g-scope" value={v} checked={scope === v} disabled={!!fixedScope} onChange={() => setScopeChoice(v)} className="mt-0.5 accent-primary" />
                    <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
                  </label>
                ))}
              </div>
              {fixedScope && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden />Set by the System Admin for this goal type.</p>}
              {scope === "each" && (
                <div className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Who takes part? <span className="font-normal text-muted-foreground">{chosen.length} of {members.length}</span></p>
                    <Button variant="ghost" size="sm" onClick={() => setPicked(chosen.length === members.length ? [] : null)}>{chosen.length === members.length ? "Clear all" : "Select all"}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">{members.map((m) => (
                    <label key={m} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm", chosen.includes(m) && "border-primary bg-primary/5")}>
                      <input type="checkbox" checked={chosen.includes(m)} onChange={(e) => setPicked(e.target.checked ? [...chosen, m] : chosen.filter((x) => x !== m))} className="accent-primary" />{m}
                    </label>
                  ))}</div>
                  {tried && noOne && <p role="alert" className="text-xs text-destructive">Pick at least one member.</p>}
                </div>
              )}
            </fieldset>

            {fields.map((f) => {
              const id = `g-${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              const bad = tried && (missing.includes(f.label) || badMoney.includes(f.label));
              const mode = modeOf(f);
              return (
                <div key={key(f.label)} className="space-y-1.5">
                  <Label htmlFor={id}>{f.label}{f.kind === "money" && " (₱)"}{!f.required && mode !== "locked" && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
                  {mode === "locked"
                    ? <div id={id} className="flex h-8 items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 text-sm"><Lock className="size-3 text-muted-foreground" aria-hidden /><span className="num">{f.value}</span></div>
                    : <Input id={id} type={inputType[f.kind]} inputMode={f.kind === "money" ? "decimal" : undefined} value={valueFor(f)} onChange={(e) => setValues((v) => ({ ...v, [key(f.label)]: e.target.value }))} aria-invalid={bad || undefined} aria-describedby={bad ? `${id}-err` : undefined} />}
                  {bad ? <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{missing.includes(f.label) ? `Enter ${f.label.toLowerCase()}.` : "Use an amount like 24000 or 24000.50."}</p>
                    : mode === "locked" ? <p className="text-xs text-muted-foreground">Set by the System Admin.</p>
                    : mode === "suggested" ? <p className="text-xs text-muted-foreground">Suggested by the System Admin; you can change it.</p>
                    : f.label === targetField && <p className="text-xs text-muted-foreground">{scope === "each" ? "Each member gets this target." : "The whole group works toward this together."}</p>}
                </div>
              );
            })}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="outline" onClick={() => history.back()}>Back</Button>
              <Button disabled={goals.length >= MAX_CREATED_GOALS} onClick={create}>Create goal</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Goal dashboard</CardTitle><CardDescription className={cn(!t.builtIn && "text-primary")}>{t.builtIn ? "Sections of a built-in template." : "Set by the System Admin for this template."}</CardDescription></CardHeader>
          <CardContent><DashboardPreview widgets={t.widgets} /></CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">Can&apos;t find the goal you need? <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setAsking(true)}>Request a goal type</button> from the System Admin.</p>
      {requestList}
      {requestDialog}
    </>
  );
}
