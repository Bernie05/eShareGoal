"use client";

import { useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { groups } from "@/lib/demo-data";
import { useCreatedGroups, useMe, useSaveCreatedGroups, useSendEmail } from "./view-as";
import { BASE_PATH, MAX_CREATED_GROUPS } from "@/lib/constants";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "group";

interface CreateGroupDialogProps {
  trigger: ReactElement;
}
/** New group: anyone except the System Admin. Whoever creates a group is its Owner. */
export function CreateGroupDialog({ trigger }: CreateGroupDialogProps) {
  const created = useCreatedGroups();
  const me = useMe() ?? "Bernz";
  const save = useSaveCreatedGroups();
  const send = useSendEmail();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invites, setInvites] = useState("");
  const [tried, setTried] = useState(false);

  const taken = [...groups.map((g) => g.name), ...created.map((g) => g.name)].some((n) => n.toLowerCase() === name.trim().toLowerCase());
  const emails = invites.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const badEmails = emails.filter((e) => !EMAIL.test(e));
  const errors = {
    name: name.trim().length < 3 ? "Use at least 3 characters." : name.trim().length > 40 ? "Use 40 characters or fewer." : taken ? "You already have a group with this name." : "",
    description: description.length > 120 ? "Use 120 characters or fewer." : "",
    invites: badEmails.length ? `Check ${badEmails.join(", ")}: not a valid email.` : emails.length > 10 ? "Invite up to 10 people at a time." : "",
  };
  const full = created.length >= MAX_CREATED_GROUPS;

  const submit = () => {
    setTried(true);
    if (full || Object.values(errors).some(Boolean)) return;
    const id = `my-${slug(name)}-${Date.now().toString(36).slice(-4)}`;
    save([...created, { id, name: name.trim(), description: description.trim(), created: new Date().toISOString().slice(0, 10), by: me, invites: emails }], `${BASE_PATH}/group?group=${id}`);
    toast.success(`${name.trim()} created`, { description: "You are its Owner." });
    for (const e of emails) send(e, `You are invited to ${name.trim()} on eShareGoal`);
    setOpen(false); setName(""); setDescription(""); setInvites(""); setTried(false);
  };
  const msg = (k: keyof typeof errors, hint?: string) =>
    tried && errors[k] ? <p id={`ng-${k}-msg`} role="alert" className="text-xs text-destructive">{errors[k]}</p> : hint ? <p id={`ng-${k}-msg`} className="text-xs text-muted-foreground">{hint}</p> : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5"><Crown className="size-3.5" aria-hidden /> You will be the Owner of this group, even if you are a Member in others.</DialogDescription>
        </DialogHeader>
        {full ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">The preview keeps up to {MAX_CREATED_GROUPS} new groups. Delete one first.</p> : (
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="ng-name">Group name</Label><Input id="ng-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Barangay Basketball Team" aria-invalid={(tried && !!errors.name) || undefined} aria-describedby="ng-name-msg" />{msg("name")}</div>
            <div className="space-y-1.5"><Label htmlFor="ng-description">What is it for? (optional)</Label><Textarea id="ng-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={(tried && !!errors.description) || undefined} aria-describedby="ng-description-msg" />{msg("description", `${description.length}/120`)}</div>
            <div className="space-y-1.5"><Label htmlFor="ng-invites">Invite people (optional)</Label><Input id="ng-invites" value={invites} onChange={(e) => setInvites(e.target.value)} placeholder="ana@example.com, ben@example.com" aria-invalid={(tried && !!errors.invites) || undefined} aria-describedby="ng-invites-msg" />{msg("invites", "Separate emails with commas. They join as Members.")}</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {!full && <Button onClick={submit}>Create group</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
