"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Code, Copy, Eye, Mail, Pencil, Plus, Send, Trash2, Type, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ActiveSwitch, PageHeader, SectionTitle } from "@/components/app/primitives";
import { FilePicker } from "@/components/app/file-picker";
import { shrinkImage } from "@/components/app/records";
import { saveEmailTemplates, useEmailTemplates } from "@/components/app/email-store";
import { useSendEmail } from "@/components/app/view-as";
import { PLACEHOLDERS, PURPOSES, renderEmail, unknownPlaceholders, type EmailTemplate } from "@/lib/email-templates";
import { BABYLYN_EMAIL } from "@/lib/constants";
import { TODAY } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { ADMIN_EMAIL, MAX_BODY, MAX_EMAIL_TEMPLATES, MAX_IMAGES, MAX_PROOF_UPLOAD } from "@/lib/constants";

const purposeLabel = Object.fromEntries(PURPOSES) as Record<EmailTemplate["purpose"], string>;
const newId = (name: string) => `et-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "template"}-${Date.now().toString(36).slice(-4)}`;
const blank = (): EmailTemplate => ({ id: "", name: "", purpose: "any", subject: "", format: "html", body: "", images: [], status: "Draft", updated: TODAY });
/** A file name safe to use in cid: references (the image is saved as JPEG). */
const cidName = (file: string, taken: string[]) => {
  const base = file.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
  let name = `${base}.jpg`; let i = 2;
  while (taken.includes(name)) name = `${base}-${i++}.jpg`;
  return name;
};

interface EmailPreviewProps {
  t: Pick<EmailTemplate, "subject" | "format" | "body" | "images">;
  className?: string;
}
/** The rendered email, as the member would see it. Admin HTML runs in a sandbox with no scripts. */
export function EmailPreview({ t, className }: EmailPreviewProps) {
  const { subject, html } = renderEmail(t);
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white", className)}>
      <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">Subject:</span> {subject || <i>No subject</i>}</p>
        <p>To: Babylyn &lt;{BABYLYN_EMAIL}&gt; · sample values</p>
        {t.format === "text" && t.images.length > 0 && <p>Attachments: {t.images.map((i) => i.name).join(", ")}</p>}
      </div>
      <iframe title="Email preview" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${html}</body>`} className="min-h-80 w-full flex-1 bg-white" />
    </div>
  );
}

interface EditorProps {
  initial: EmailTemplate;
  all: EmailTemplate[];
  onClose: () => void;
}
function Editor({ initial, all, onClose }: EditorProps) {
  const [t, setT] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const send = useSendEmail();
  const set = (patch: Partial<EmailTemplate>) => {
    setT((x) => ({ ...x, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch)))); // fixing a field clears its error
  };
  const unknown = unknownPlaceholders(t);
  const missingImages = t.format === "html" ? [...t.body.matchAll(/cid:([a-z0-9._-]+)/gi)].map((m) => m[1]).filter((n) => !t.images.some((i) => i.name === n)) : [];

  // Puts text where the cursor is in the body (or at the end), and keeps the cursor after it.
  const insert = (text: string) => {
    const el = body.current;
    const at = el ? el.selectionStart : t.body.length, end = el ? el.selectionEnd : t.body.length;
    const next = (t.body.slice(0, at) + text + t.body.slice(end)).slice(0, MAX_BODY);
    set({ body: next });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + text.length, at + text.length); } });
  };
  const addImage = async (file?: File) => {
    if (!file) return;
    if (t.images.length >= MAX_IMAGES) return void toast.error(`Up to ${MAX_IMAGES} images per template`);
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file (JPG, PNG, WebP or GIF)");
    if (file.size > MAX_PROOF_UPLOAD) return void toast.error("That image is over 10 MB");
    setAdding(true);
    try {
      const dataUrl = await shrinkImage(file, 1000);
      const name = cidName(file.name, t.images.map((i) => i.name));
      set({ images: [...t.images, { id: name, name, dataUrl }] });
      if (t.format === "html") insert(`<img src="cid:${name}" alt="" style="max-width:100%;height:auto">`);
    } catch { toast.error("This image could not be read. Try another file."); }
    finally { setAdding(false); }
  };
  const save = (status: EmailTemplate["status"]) => {
    const e: Record<string, string> = {};
    if (!t.name.trim()) e.name = "Give the template a name.";
    else if (all.some((x) => x.id !== t.id && x.name.trim().toLowerCase() === t.name.trim().toLowerCase())) e.name = "Another template has this name.";
    if (!t.subject.trim()) e.subject = "Write a subject.";
    if (!t.body.trim()) e.body = "Write the email.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const saved: EmailTemplate = { ...t, name: t.name.trim(), subject: t.subject.trim(), id: t.id || newId(t.name), status, updated: TODAY, builtIn: false };
    const next = t.id ? all.map((x) => (x.id === t.id ? saved : x)) : [...all, saved];
    if (!saveEmailTemplates(next)) return void toast.error("Could not save. This browser's storage is full (try smaller or fewer images) or blocked.");
    toast.success(status === "Published" ? `${saved.name} published` : `${saved.name} saved as a draft`, { description: status === "Published" ? "Owners can pick it for their jobs now." : "Owners do not see drafts." });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? `Edit ${initial.name}` : "New email template"}</DialogTitle>
          <DialogDescription>Write it in HTML or plain text. Placeholders like {"{{member}}"} are filled in when a job sends it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="et-name">Name</Label><Input id="et-name" value={t.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} aria-describedby="et-name-err" />{errors.name && <p id="et-name-err" className="text-xs text-destructive">{errors.name}</p>}</div>
              <div className="space-y-1.5"><Label htmlFor="et-purpose">Used for</Label><NativeSelect id="et-purpose" value={t.purpose} onChange={(e) => set({ purpose: e.target.value as EmailTemplate["purpose"] })}>{PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="et-subject">Subject</Label><Input id="et-subject" value={t.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} aria-invalid={!!errors.subject} aria-describedby="et-subject-err" />{errors.subject && <p id="et-subject-err" className="text-xs text-destructive">{errors.subject}</p>}</div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="et-body">Email</Label>
                <div role="radiogroup" aria-label="Format" className="flex rounded-lg border p-0.5">
                  {([["html", "HTML", Code], ["text", "Plain text", Type]] as const).map(([v, l, Icon]) => (
                    <button key={v} type="button" role="radio" aria-checked={t.format === v} onClick={() => set({ format: v })} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs", t.format === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}><Icon className="size-3.5" aria-hidden />{l}</button>
                  ))}
                </div>
              </div>
              <Textarea ref={body} id="et-body" rows={14} value={t.body} maxLength={MAX_BODY} onChange={(e) => set({ body: e.target.value })} className={cn(t.format === "html" && "font-mono text-xs")} placeholder={t.format === "html" ? "<h1>Hi {{member}}</h1>\n<p>Your {{month}} share of {{amount}} is due {{due_date}}.</p>" : "Hi {{member}},\n\nYour {{month}} share of {{amount}} is due {{due_date}}."} aria-invalid={!!errors.body} aria-describedby="et-body-err" />
              <p className="flex justify-between text-xs text-muted-foreground"><span id="et-body-err" className="text-destructive">{errors.body}</span><span>{t.body.length.toLocaleString()}/{MAX_BODY.toLocaleString()}</span></p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Insert a placeholder</p>
              <div className="flex flex-wrap gap-1.5">{PLACEHOLDERS.map(([k, l]) => <Button key={k} type="button" variant="outline" size="xs" title={l} onClick={() => insert(`{{${k}}}`)}>{`{{${k}}}`}</Button>)}</div>
              {unknown.length > 0 && <p className="text-xs text-warning">Not filled in by any job: {unknown.map((k) => `{{${k}}}`).join(", ")}. Check the spelling.</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Images <span className="font-normal text-muted-foreground">({t.images.length}/{MAX_IMAGES}{t.format === "html" ? ", shown where you insert them" : ", sent as attachments"})</span></p>
              {t.images.length > 0 && <ul className="space-y-2">{t.images.map((img) => (
                <li key={img.id} className="flex items-center gap-3 rounded-lg border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
                  <img src={img.dataUrl} alt="" className="size-10 rounded border object-cover" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{img.name}</span>
                  {t.format === "html" && <Button type="button" variant="outline" size="sm" onClick={() => insert(`<img src="cid:${img.name}" alt="" style="max-width:100%;height:auto">`)}>Insert</Button>}
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${img.name}`} onClick={() => set({ images: t.images.filter((x) => x.id !== img.id) })}><X aria-hidden /></Button>
                </li>
              ))}</ul>}
              {t.images.length < MAX_IMAGES && <FilePicker id="et-image" fileName={adding ? "Adding…" : ""} placeholder="Attach an image (logo, banner…)" onPick={addImage} />}
              {missingImages.length > 0 && <p className="text-xs text-warning">The email shows images that are not attached: {missingImages.join(", ")}.</p>}
            </div>
          </div>
          <div className="flex min-h-96 flex-col gap-2">
            <p className="text-sm font-medium">Preview</p>
            <EmailPreview t={t} className="flex-1" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => send(ADMIN_EMAIL, renderEmail(t).subject || "(no subject)")}><Send aria-hidden /> Send me a test</Button>
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={() => save("Draft")}>Save as draft</Button>
            <Button onClick={() => save("Published")}>Publish</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmailTemplatesScreenProps {
  inUse: Record<string, number>;
}
// ---------- System Admin: email templates the scheduled jobs send ----------
// inUse: template id -> how many goals' jobs send it (read on the server from every group's setup).
export function EmailTemplatesScreen({ inUse }: EmailTemplatesScreenProps) {
  const all = useEmailTemplates();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [viewing, setViewing] = useState<EmailTemplate | null>(null);
  const custom = all.filter((t) => !t.builtIn).length;
  const remove = (t: EmailTemplate) => { if (saveEmailTemplates(all.filter((x) => x.id !== t.id))) toast(`${t.name} deleted`); };
  const toggle = (t: EmailTemplate) => {
    if (!saveEmailTemplates(all.map((x) => (x.id === t.id ? { ...x, status: x.status === "Published" ? "Draft" : "Published", updated: TODAY } : x)))) return;
    toast(t.status === "Published" ? `${t.name} is not active` : `${t.name} is active`, { description: t.status === "Published" ? "Hidden from Owners." : "Owners can pick it for their jobs." });
  };
  const active = all.filter((t) => t.status === "Published").length;
  return (
    <>
      <PageHeader title="Email templates" description="The emails scheduled jobs send through Gmail. Owners pick one for each job in Group setup → Jobs; active templates only."
        actions={<Button disabled={custom >= MAX_EMAIL_TEMPLATES} title={custom >= MAX_EMAIL_TEMPLATES ? `Up to ${MAX_EMAIL_TEMPLATES} templates` : undefined} onClick={() => setEditing(blank())}><Plus aria-hidden /> New template</Button>} />
      <SectionTitle aside={<span className="text-xs text-muted-foreground">{active} active · {all.length - active} not active</span>}>Templates</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {all.map((t) => {
          const uses = inUse[t.id] ?? 0;
          return (
            <Card key={t.id} className={cn("h-full", t.status === "Draft" && "opacity-90")}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Mail className="size-4" aria-hidden /></span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">{t.format === "html" ? "HTML" : "Text"}</Badge>
                    {t.builtIn && <Badge variant="outline" className="text-muted-foreground">Built in</Badge>}
                  </span>
                </div>
                <div className="min-w-0"><p className="font-medium">{t.name}</p><p className="truncate text-sm text-muted-foreground" title={t.subject}>{t.subject}</p></div>
                <p className="text-xs text-muted-foreground">
                  For {purposeLabel[t.purpose].toLowerCase()} · {t.images.length ? `${t.images.length} ${t.images.length === 1 ? "image" : "images"}` : "no images"}
                  <br />{uses ? `Sent by ${uses} ${uses === 1 ? "job" : "jobs"}` : t.builtIn ? "Default for its job" : "Not picked by a job yet"}
                </p>
                <ActiveSwitch name={t.name} active={t.status === "Published"} onChange={() => toggle(t)} on="Owners can pick it for their jobs" off="Hidden from Owners"
                  locked={t.builtIn ? "Built in: always active, the default for its job" : uses > 0 && t.status === "Published" ? "A job sends it: pick another template there first" : undefined} />
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViewing(t)}><Eye aria-hidden /> Preview</Button>
                  {!t.builtIn && <Button variant="outline" size="sm" onClick={() => setEditing(t)}><Pencil aria-hidden /> Edit</Button>}
                  <Button variant="outline" size="sm" disabled={custom >= MAX_EMAIL_TEMPLATES} onClick={() => setEditing({ ...t, id: "", builtIn: false, name: `${t.name} (copy)`, status: "Draft" })}><Copy aria-hidden /> Duplicate</Button>
                  {!t.builtIn && <Button variant="ghost" size="sm" disabled={uses > 0} title={uses > 0 ? "A job sends it: pick another template there first" : undefined} onClick={() => remove(t)}><Trash2 aria-hidden /> Delete</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {editing && <Editor key={editing.id || "new"} initial={editing} all={all} onClose={() => setEditing(null)} />}
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>{viewing.name}</DialogTitle><DialogDescription>{purposeLabel[viewing.purpose]} · {viewing.format === "html" ? "HTML" : "Plain text"} · sample values</DialogDescription></DialogHeader>
            <EmailPreview t={viewing} className="h-[60vh]" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
