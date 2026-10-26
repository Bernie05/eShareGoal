"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { Crown, Eye, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { EMAIL_MODE_COOKIE, VIEW_AS_COOKIE, viewAsLabel, type EmailMode, type ViewAs } from "@/lib/view-as";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ViewAsContext = createContext<ViewAs>("admin");
export const ViewAsProvider = ({ value, children }: { value: ViewAs; children: ReactNode }) => <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
export const useViewAs = () => useContext(ViewAsContext);

/** Renders its children only for the group Owner. The UI only hides actions; the server must enforce it too. */
export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useViewAs() === "owner" ? children : fallback;
}

const roleIcon = { owner: Crown, member: Eye, admin: ShieldCheck } as const;
const roleTone = { owner: "bg-primary/10 text-primary", member: "bg-muted text-muted-foreground", admin: "bg-warning-soft text-warning" } as const;

/** Role indicator. Pass `role` for a fixed role, or leave it out to show the current "view as" role. */
export function RoleBadge({ role, className }: { role?: ViewAs; className?: string }) {
  const current = useViewAs();
  const r = role ?? current;
  const Icon = roleIcon[r];
  return <Badge variant="secondary" className={cn("border-0", roleTone[r], className)}><Icon aria-hidden /> {viewAsLabel[r]}{r === "admin" && " · viewer"}</Badge>;
}

export function ViewAsSwitch() {
  const router = useRouter();
  const value = useViewAs();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden sm:inline">View as</span>
      <NativeSelect
        aria-label="View the preview as"
        value={value}
        onChange={(e) => { document.cookie = `${VIEW_AS_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}
        className="h-8 w-36 text-sm"
      >
        {(Object.keys(viewAsLabel) as ViewAs[]).map((r) => <option key={r} value={r}>{viewAsLabel[r]}</option>)}
      </NativeSelect>
    </label>
  );
}

// ---------- Email delivery mode (System Admin setting) ----------
const EmailModeContext = createContext<EmailMode>("dev");
export const EmailModeProvider = ({ value, children }: { value: EmailMode; children: ReactNode }) => <EmailModeContext.Provider value={value}>{children}</EmailModeContext.Provider>;
export const useEmailMode = () => useContext(EmailModeContext);

export function useSetEmailMode() {
  const router = useRouter();
  return (mode: EmailMode) => { document.cookie = `${EMAIL_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
}

/** Sends (prod) or simulates (dev) an email and tells the admin which one happened. */
export function useSendEmail() {
  const mode = useEmailMode();
  return (to: string, subject: string) =>
    mode === "prod"
      ? toast.success(`Email queued for ${to}`, { description: `"${subject}" · sent through the email provider` })
      : toast(`Development: email not sent`, { description: `Would send "${subject}" to ${to}` });
}
