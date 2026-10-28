"use client";

import { useRouter } from "next/navigation";
import { TODAY } from "@/lib/demo-data";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, SectionTitle } from "@/components/app/primitives";
import { DashboardPreview, templateIcon } from "@/components/app/dashboard-preview";
import { useSendEmail, writeCookie } from "@/components/app/view-as";
import { isReadyMade, MAX_TEMPLATES, modeOf, RETIRED_COOKIE, TEMPLATES_COOKIE, WIDGETS, type FieldKind, type FieldMode, type IconKey, type Measure, type Template, type TemplateScope, type WidgetId } from "@/lib/goal-templates";
import { GOAL_REQUESTS_COOKIE, type GoalRequest } from "@/lib/goal-requests";
import { cn } from "@/lib/utils";

const MEASURES: [Measure, string, string][] = [["money", "Money", "Pesos saved, paid or spent"], ["count", "A number", "Kilos, workouts, books, hours…"], ["checklist", "A checklist", "Tasks that get done"]];
const KIND_LABEL: Record<FieldKind, string> = { money: "Amount (₱)", number: "Number", date: "Date", text: "Text" };
const MODE_LABEL: Record<FieldMode, string> = { owner: "Owner fills it", suggested: "Suggested value", locked: "Locked value" };
const SCOPES: [TemplateScope, string, string][] = [["choose", "Owner chooses", "One shared goal or one per member"], ["single", "Always one shared goal", "Everyone adds to the same target"], ["each", "Always each member", "Everyone gets the same target"]];
const inputType: Record<FieldKind, string> = { money: "text", number: "number", date: "date", text: "text" };
const newId = (name: string) => `tpl-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36).slice(-4)}`;
const blank = (): Template => ({ id: "", name: "", description: "", icon: "target", measure: "money", fields: [{ label: "Target amount", kind: "money", required: true }], widgets: ["stats", "progress", "monthly", "records"], status: "Draft" });

// The card's Active switch: on = Owners can pick it in Create goal; off = hidden ("Retired"; goals made from it keep working).
// A draft is off until it is switched on, which publishes it.
function TemplateCard({ t, uses, onEdit, onActive, onDelete }: { t: Template; uses: number; onEdit?: () => void; onActive: (on: boolean) => void; onDelete?: () => void }) {
  const Icon = templateIcon[t.icon];
  const retired = t.status === "Retired";
  const active = t.status === "Published";
  return (
    <Card className={cn("h-full", retired && "opacity-75")}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
          <span className="flex flex-wrap justify-end gap-1.5">
            {isReadyMade(t) && <Badge variant="secondary">Ready-made</Badge>}
            {t.builtIn && <Badge variant="outline" className="text-muted-foreground">Built in</Badge>}
            {t.status === "Draft" && <Badge variant="outline">Draft</Badge>}
          </span>
        </div>
        <div><p className="font-medium">{t.name}</p><p className="text-sm text-muted-foreground">{t.description || "No description."}</p></div>
        <p className="text-xs text-muted-foreground">
          {t.fields.length} {t.fields.length === 1 ? "field" : "fields"} · {t.widgets.length} dashboard sections · {uses ? `used by ${uses} ${uses === 1 ? "goal" : "goals"}` : "not used yet"}
        </p>
        <label className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", active ? "border-success/40 bg-success/5" : "bg-muted/40")}>
          <Switch checked={active} onCheckedChange={onActive} aria-label={`${t.name}: ${active ? "active" : "not active"}`} />
          <span className="min-w-0 text-sm">
            <span className={cn("block font-medium", active ? "text-success" : "text-muted-foreground")}>{active ? "Active" : "Not active"}</span>
            <span className="block text-xs text-muted-foreground">
              {active ? (t.groups?.length ? `Owners of ${t.groups.length} ${t.groups.length === 1 ? "group" : "groups"} can pick it` : "Owners of every group can pick it")
                : t.status === "Draft" ? "Draft: switch on to publish it" : uses ? "Hidden from Create goal; goals made from it keep working" : "Hidden from Create goal"}
            </span>
          </span>
        </label>
        <DashboardPreview widgets={t.widgets} className="flex-1" />
        <div className="flex flex-wrap gap-2">
          {!t.builtIn && <Button variant="outline" size="sm" onClick={onEdit}><Pencil aria-hidden /> Edit</Button>}
          {!t.builtIn && <Button variant="ghost" size="sm" disabled={uses > 0} title={uses > 0 ? "In use: retire it instead" : undefined} onClick={onDelete}><Trash2 aria-hidden /> Delete</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Goal templates: System Admin only. Published templates show up in Create goal for group Owners ----------
// inUse: template id -> number of goals made from it. request: a goal-type request to build a template from (from Reports).
export function TemplatesScreen({ custom: initial, builtIns: initialBuiltIns, inUse, groups, requests, request }: {
  custom: Template[]; builtIns: Template[]; inUse: Record<string, number>; groups: { id: string; name: string }[]; requests: GoalRequest[]; request?: GoalRequest;
}) {
  const router = useRouter();
  const send = useSendEmail();
  const [list, setList] = useState(initial);
  const [builtIns, setBuiltIns] = useState(initialBuiltIns);
  const [draft, setDraft] = useState<Template | null>(request?.status === "Open" ? { ...blank(), name: request.name, description: request.what.slice(0, 120) } : null);
  const [fromRequest, setFromRequest] = useState(request?.status === "Open" ? request : undefined);
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);

  const persist = (next: Template[]) => {
    if (!writeCookie(TEMPLATES_COOKIE, next)) return false;
    setList(next);
    router.refresh();
    return true;
  };
  const activeToast = (t: Template, on: boolean) => toast(on ? `${t.name} is active` : `${t.name} is not active`, { description: on ? "Owners can pick it in Create goal." : "Hidden from Create goal. Goals made from it keep working." });
  const setBuiltInActive = (t: Template, on: boolean) => {
    const next = builtIns.map((x) => (x.id === t.id ? { ...x, status: on ? "Published" as const : "Retired" as const } : x));
    if (!writeCookie(RETIRED_COOKIE, next.filter((x) => x.status === "Retired").map((x) => x.id))) return;
    setBuiltIns(next); router.refresh();
    activeToast(t, on);
  };
  const close = () => { setDraft(null); setFromRequest(undefined); setTried(false); };
  const set = (patch: Partial<Template>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setField = (i: number, patch: Partial<Template["fields"][number]>) => set({ fields: draft!.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const allowed = draft ? WIDGETS.filter((w) => w.measures.includes(draft.measure)) : [];
  const uses = draft?.id ? inUse[draft.id] ?? 0 : 0;

  const badValue = (f: Template["fields"][number]) => modeOf(f) !== "owner" && (!f.value?.trim() || ((f.kind === "money" || f.kind === "number") && !/^\d+(\.\d{1,2})?$/.test(f.value.replace(/,/g, ""))));
  const errors = draft ? {
    name: draft.name.trim().length < 3 ? "Use at least 3 characters." : [...builtIns, ...list].some((t) => t.id !== draft.id && t.name.toLowerCase() === draft.name.trim().toLowerCase()) ? "A template with this name already exists." : "",
    fields: draft.fields.length === 0 ? "Add at least one field." : draft.fields.some((f) => !f.label.trim()) ? "Every field needs a label." : draft.fields.some(badValue) ? "Suggested and locked fields need a value (numbers for amounts)." : "",
    widgets: draft.widgets.length === 0 ? "Pick at least one dashboard section." : "",
    groups: draft.groups && draft.groups.length === 0 ? "Pick at least one group, or choose All groups." : "",
  } : { name: "", fields: "", widgets: "", groups: "" };

  const save = (status: Template["status"]) => {
    setTried(true);
    if (!draft || Object.values(errors).some(Boolean)) return;
    const t: Template = {
      ...draft, name: draft.name.trim(), description: draft.description.trim(), status, id: draft.id || newId(draft.name.trim()), created: draft.created ?? TODAY,
      scope: draft.scope === "choose" ? undefined : draft.scope,
      fields: draft.fields.map(({ label, kind, required, mode, value }) => (mode && mode !== "owner" ? { label: label.trim(), kind, required, mode, value: value!.trim() } : { label: label.trim(), kind, required })),
    };
    if (!persist(draft.id ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t])) return;
    if (fromRequest) {
      writeCookie(GOAL_REQUESTS_COOKIE, requests.map((r) => (r.id === fromRequest.id ? { ...r, status: "Built", templateId: t.id, note: `Template "${t.name}" ${status === "Published" ? "published" : "drafted"}` } : r)));
      if (status === "Published") send(`${fromRequest.by.toLowerCase().split(" ")[0]}@example.com`, `Your goal type "${t.name}" is ready in Create goal`);
    }
    toast.success(status === "Published" ? `${t.name} published` : `${t.name} saved as draft`, {
      description: uses ? `The ${uses} ${uses === 1 ? "goal" : "goals"} made from it now show the new dashboard sections.` : status === "Published" ? "Group Owners can pick it in Create goal now." : "Owners will not see it until you publish it.",
    });
    close();
  };
  const changeMeasure = (measure: Measure) => set({ measure, widgets: draft!.widgets.filter((w) => WIDGETS.find((x) => x.id === w)!.measures.includes(measure)) });
  const toggleWidget = (id: WidgetId) => set({ widgets: draft!.widgets.includes(id) ? draft!.widgets.filter((w) => w !== id) : [...draft!.widgets, id] });
  const moveWidget = (i: number, by: -1 | 1) => { const w = [...draft!.widgets]; [w[i], w[i + by]] = [w[i + by], w[i]]; set({ widgets: w }); };
  const err = (k: keyof typeof errors) => tried && errors[k] ? <p role="alert" className="text-xs text-destructive">{errors[k]}</p> : null;
  const live = list.filter((t) => t.status !== "Retired");

  return (
    <>
      <PageHeader
        title="Goal Templates"
        description="The kinds of goals group Owners can create: what they fill in, what you fix for them, and the dashboard each goal gets."
        actions={<Button disabled={list.length >= MAX_TEMPLATES} onClick={() => { setTried(false); setFromRequest(undefined); setDraft(blank()); }}><Plus aria-hidden /> New template</Button>}
      />
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{live.filter((t) => t.status === "Published").length} active · {live.filter((t) => t.status === "Draft").length} draft · {list.length - live.length} not active</span>}>Your templates</SectionTitle>
      {list.length === 0
        ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No templates yet. Create one to give Owners a new kind of goal, with the dashboard you choose.</p>
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((t) => (
          <TemplateCard key={t.id} t={t} uses={inUse[t.id] ?? 0} onEdit={() => { setTried(false); setFromRequest(undefined); setDraft({ ...t, scope: t.scope ?? "choose" }); }} onDelete={() => setDeleting(t)}
            onActive={(on) => { if (persist(list.map((x) => (x.id === t.id ? { ...x, status: on ? "Published" : "Retired" } : x)))) activeToast(t, on); }} />
        ))}</div>}
      <SectionTitle aside={<span className="text-xs text-muted-foreground">Cannot be edited; switch one off to hide it from Owners</span>}>Built-in templates</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{builtIns.map((t) => <TemplateCard key={t.id} t={t} uses={inUse[t.id] ?? 0} onActive={(on) => setBuiltInActive(t, on)} />)}</div>

      {/* ---------- Builder ---------- */}
      <Sheet open={draft !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
          {draft && <>
            <SheetHeader>
              <SheetTitle>{draft.id ? `Edit ${draft.name}` : "New goal template"}</SheetTitle>
              <SheetDescription>{fromRequest ? `Requested by ${fromRequest.by} (${fromRequest.group}): ${fromRequest.what}` : "Owners pick it in Create goal. Goals made from it show the dashboard below."}</SheetDescription>
            </SheetHeader>
            {uses > 0 && <p className="mx-4 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">{uses} {uses === 1 ? "goal uses" : "goals use"} this template. Dashboard sections you change here apply to {uses === 1 ? "it" : "them"} too; the values Owners entered stay.</p>}
            <div className="grid gap-6 px-4 pb-6 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-5 text-sm">
                <section className="space-y-3">
                  <div className="space-y-1.5"><Label htmlFor="t-name">Template name</Label><Input id="t-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Travel Fund" />{err("name")}</div>
                  <div className="space-y-1.5"><Label htmlFor="t-desc">Short description</Label><Textarea id="t-desc" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Save together for a trip, with a target and a date" /></div>
                  <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Icon</legend>
                    <div className="flex flex-wrap gap-2">{(Object.keys(templateIcon) as IconKey[]).map((k) => { const Icon = templateIcon[k]; return (
                      <button key={k} type="button" aria-label={k} aria-pressed={draft.icon === k} onClick={() => set({ icon: k })} className={cn("flex size-9 items-center justify-center rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.icon === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}><Icon className="size-4" aria-hidden /></button>
                    ); })}</div>
                  </fieldset>
                  <fieldset className="space-y-1.5"><legend className="text-sm font-medium">What does this goal measure?</legend>
                    <div className="grid gap-2 sm:grid-cols-3">{MEASURES.map(([m, l, d]) => (
                      <label key={m} className={cn("cursor-pointer rounded-lg border p-2.5", draft.measure === m && "border-primary bg-primary/5", uses > 0 && "cursor-not-allowed opacity-60")}>
                        <input type="radio" name="t-measure" className="sr-only" checked={draft.measure === m} disabled={uses > 0} onChange={() => changeMeasure(m)} />
                        <span className="block font-medium">{l}</span><span className="block text-xs text-muted-foreground">{d}</span>
                      </label>
                    ))}</div>
                    {uses > 0 && <p className="text-xs text-muted-foreground">Goals already use this template, so what it measures cannot change.</p>}
                  </fieldset>
                </section>

                <section className="space-y-2">
                  <h3 className="font-medium">Fields</h3>
                  <p className="text-xs text-muted-foreground">Goal name and group are always asked. For each field, choose whether the Owner fills it, you suggest a value they can change, or you lock the value.</p>
                  <ul className="space-y-2">{draft.fields.map((f, i) => { const mode = modeOf(f); return (
                    <li key={i} className="space-y-2 rounded-lg border p-2.5">
                      <div className="grid grid-cols-[1fr_8.5rem_auto] items-center gap-2">
                        <Input aria-label={`Field ${i + 1} label`} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Field label" />
                        <NativeSelect aria-label={`Field ${i + 1} type`} value={f.kind} onChange={(e) => setField(i, { kind: e.target.value as FieldKind })}>{(Object.keys(KIND_LABEL) as FieldKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</NativeSelect>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove field ${f.label || i + 1}`} onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}><X aria-hidden /></Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                        <NativeSelect aria-label={`Who sets ${f.label || `field ${i + 1}`}`} value={mode} onChange={(e) => setField(i, { mode: e.target.value as FieldMode, value: e.target.value === "owner" ? undefined : f.value ?? "" })}>{(Object.keys(MODE_LABEL) as FieldMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</NativeSelect>
                        {mode === "owner" ? <span className="text-xs text-muted-foreground">The Owner types it when creating the goal.</span>
                          : <Input aria-label={`${mode === "locked" ? "Locked" : "Suggested"} value for ${f.label || `field ${i + 1}`}`} type={inputType[f.kind]} value={f.value ?? ""} onChange={(e) => setField(i, { value: e.target.value })} placeholder={mode === "locked" ? "Value Owners cannot change" : "Value Owners start with"} aria-invalid={(tried && badValue(f)) || undefined} />}
                        {mode === "locked" ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden />Fixed</span>
                          : <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="accent-primary" />Required</label>}
                      </div>
                    </li>
                  ); })}</ul>
                  {draft.fields.length < 6 && <Button variant="outline" size="sm" onClick={() => set({ fields: [...draft.fields, { label: "", kind: "text", required: false }] })}><Plus aria-hidden /> Add field</Button>}
                  {err("fields")}
                </section>

                <fieldset className="space-y-2">
                  <legend className="mb-1.5 font-medium">Who is the goal for?</legend>
                  <div className="grid gap-2 sm:grid-cols-3">{SCOPES.map(([v, l, d]) => (
                    <label key={v} className={cn("cursor-pointer rounded-lg border p-2.5", (draft.scope ?? "choose") === v && "border-primary bg-primary/5")}>
                      <input type="radio" name="t-scope" className="sr-only" checked={(draft.scope ?? "choose") === v} onChange={() => set({ scope: v })} />
                      <span className="block font-medium">{l}</span><span className="block text-xs text-muted-foreground">{d}</span>
                    </label>
                  ))}</div>
                  <p className="text-xs text-muted-foreground">The Owner always picks which members take part.</p>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="mb-1.5 font-medium">Which groups can use it?</legend>
                  <div className="flex flex-wrap gap-2">
                    {[["all", "All groups"], ["some", "Only chosen groups"]].map(([v, l]) => (
                      <label key={v} className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5", (v === "all") === !draft.groups && "border-primary bg-primary/5")}>
                        <input type="radio" name="t-avail" checked={(v === "all") === !draft.groups} onChange={() => set({ groups: v === "all" ? undefined : [] })} className="accent-primary" />{l}
                      </label>
                    ))}
                  </div>
                  {draft.groups && <div className="flex flex-wrap gap-2">{groups.map((g) => (
                    <label key={g.id} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1", draft.groups!.includes(g.id) && "border-primary bg-primary/5")}>
                      <input type="checkbox" checked={draft.groups!.includes(g.id)} onChange={(e) => set({ groups: e.target.checked ? [...draft.groups!, g.id] : draft.groups!.filter((x) => x !== g.id) })} className="accent-primary" />{g.name}
                    </label>
                  ))}</div>}
                  {err("groups")}
                </fieldset>

                <section className="space-y-2">
                  <h3 className="font-medium">Dashboard sections</h3>
                  <p className="text-xs text-muted-foreground">Only sections that fit &quot;{MEASURES.find((m) => m[0] === draft.measure)![1].toLowerCase()}&quot; are listed. Owners cannot add or remove sections. Use the arrows on the right to change the order.</p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">{allowed.map((w) => (
                    <li key={w.id}><label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5", draft.widgets.includes(w.id) && "border-primary bg-primary/5")}>
                      <input type="checkbox" checked={draft.widgets.includes(w.id)} onChange={() => toggleWidget(w.id)} className="mt-0.5 accent-primary" />
                      <span><span className="block font-medium">{w.label}</span><span className="block text-xs text-muted-foreground">{w.what}</span></span>
                    </label></li>
                  ))}</ul>
                  {err("widgets")}
                </section>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <div className="space-y-2">
                  <p className="flex items-center justify-between gap-2 text-sm font-medium">What the Owner fills in {isReadyMade(draft) && <Badge variant="secondary">Ready-made</Badge>}</p>
                  <ul className="space-y-1 rounded-lg border p-2.5 text-xs">
                    <li className="flex justify-between gap-2"><span>Goal name</span><span className="text-muted-foreground">Owner types it</span></li>
                    <li className="flex justify-between gap-2"><span>Who takes part</span><span className="text-muted-foreground">{draft.scope === "single" ? "Whole group" : draft.scope === "each" ? "Owner picks members" : "Owner chooses"}</span></li>
                    {draft.fields.map((f, i) => (
                      <li key={i} className="flex justify-between gap-2"><span>{f.label || `Field ${i + 1}`}</span>
                        <span className="text-right text-muted-foreground">{modeOf(f) === "locked" ? <span className="inline-flex items-center gap-1 font-medium text-foreground"><Lock className="size-3" aria-hidden />{f.value || "-"}</span> : modeOf(f) === "suggested" ? `Starts at ${f.value || "-"}` : f.required ? "Owner types it" : "Optional"}</span></li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Dashboard preview</p>
                  <DashboardPreview widgets={draft.widgets} />
                  {draft.widgets.length > 1 && (
                    <ol className="space-y-1 text-xs">{draft.widgets.map((id, i) => (
                      <li key={id} className="flex items-center justify-between gap-1 rounded border px-2 py-1">
                        <span>{i + 1}. {WIDGETS.find((w) => w.id === id)!.label}</span>
                        <span className="flex">
                          <Button variant="ghost" size="icon-sm" aria-label={`Move ${id} up`} disabled={i === 0} onClick={() => moveWidget(i, -1)}><ArrowUp aria-hidden /></Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Move ${id} down`} disabled={i === draft.widgets.length - 1} onClick={() => moveWidget(i, 1)}><ArrowDown aria-hidden /></Button>
                        </span>
                      </li>
                    ))}</ol>
                  )}
                </div>
              </aside>
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background px-4 py-3">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button variant="outline" onClick={() => save("Draft")}>Save as draft</Button>
              <Button onClick={() => save("Published")}>Publish</Button>
            </div>
          </>}
        </SheetContent>
      </Sheet>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>Owners can no longer pick it. No goals use it, so nothing else changes.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={() => { if (persist(list.filter((x) => x.id !== deleting!.id))) toast(`${deleting!.name} deleted`); setDeleting(null); }}>Delete template</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
