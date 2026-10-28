"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Crown, Eye, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { CREATED_GROUPS_COOKIE, EMAIL_MODE_COOKIE, MAX_CREATED_GROUPS, viewAsLabel, type CreatedGroup, type EmailMode, type ViewAs } from "@/lib/view-as";
import { ACCOUNT_COOKIE, ACCOUNTS, type Account } from "@/lib/accounts";
import { toast } from "sonner";
import { CREATED_GOALS_COOKIE, MAX_CREATED_GOALS, type CreatedGoal } from "@/lib/created-goals";
import { cn } from "@/lib/utils";

// The account the preview is viewed as (who "you" are), and the role on the current page (Owner/Member per group, or admin).
const AccountContext = createContext<Account>("admin");
export const AccountProvider = ({ value, children }: { value: Account; children: ReactNode }) => <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
export const useAccount = () => useContext(AccountContext);
/** The current account name ("Bernz", "Babylyn"), or null for the System Admin. */
export const useMe = () => { const a = useAccount(); return a === "admin" ? null : ACCOUNTS[a].name; };

const ViewAsContext = createContext<ViewAs>("admin");
export const ViewAsProvider = ({ value, children }: { value: ViewAs; children: ReactNode }) => <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
export const useViewAs = () => useContext(ViewAsContext);

/** Renders its children only for the group Owner. The UI only hides actions; the server must enforce it too. */
export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useViewAs() === "owner" ? children : fallback;
}

const roleIcon = { owner: Crown, member: Eye, admin: ShieldCheck } as const;
const roleTone = { owner: "bg-primary/10 text-primary", member: "bg-muted text-muted-foreground", admin: "bg-warning-soft text-warning" } as const;

/** Role indicator. Pass `role` for a fixed role, or leave it out to show the role on the current page. */
export function RoleBadge({ role, className }: { role?: ViewAs; className?: string }) {
  const current = useViewAs();
  const r = role ?? current;
  const Icon = roleIcon[r];
  return <Badge variant="secondary" className={cn("border-0", roleTone[r], className)}><Icon aria-hidden /> {viewAsLabel[r]}{r === "admin" && " · viewer"}</Badge>;
}

export function ViewAsSwitch() {
  const router = useRouter();
  const value = useAccount();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden sm:inline">View as</span>
      <NativeSelect
        aria-label="View the preview as"
        value={value}
        onChange={(e) => { document.cookie = `${ACCOUNT_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}
        className="h-8 w-36 text-sm sm:w-44"
      >
        {(Object.keys(ACCOUNTS) as Account[]).map((a) => <option key={a} value={a}>{ACCOUNTS[a].label}</option>)}
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

// ---------- Groups the current user created (they are the Owner of each) ----------
// The layout (and so the sidebar) is not re-rendered on navigation, so the latest list is also kept here in state.
const CreatedGroupsContext = createContext<{ list: CreatedGroup[]; set: (l: CreatedGroup[]) => void }>({ list: [], set: () => {} });
export function CreatedGroupsProvider({ value, children }: { value: CreatedGroup[]; children: ReactNode }) {
  const [local, setLocal] = useState<CreatedGroup[] | null>(null); // null until this session changes the list
  return <CreatedGroupsContext.Provider value={{ list: local ?? value, set: setLocal }}>{children}</CreatedGroupsContext.Provider>;
}
export const useCreatedGroups = () => useContext(CreatedGroupsContext).list;
export function useSaveCreatedGroups() {
  const router = useRouter();
  const { set } = useContext(CreatedGroupsContext);
  return (list: CreatedGroup[], then?: string) => {
    const kept = list.slice(0, MAX_CREATED_GROUPS);
    if (!writeCookie(CREATED_GROUPS_COOKIE, kept)) return;
    set(kept);
    if (then) router.push(then); else router.refresh();
  };
}

// ---------- Goals created in the preview (same pattern as created groups) ----------
const CreatedGoalsContext = createContext<{ list: CreatedGoal[]; set: (l: CreatedGoal[]) => void }>({ list: [], set: () => {} });
export function CreatedGoalsProvider({ value, children }: { value: CreatedGoal[]; children: ReactNode }) {
  const [local, setLocal] = useState<CreatedGoal[] | null>(null);
  return <CreatedGoalsContext.Provider value={{ list: local ?? value, set: setLocal }}>{children}</CreatedGoalsContext.Provider>;
}
export const useCreatedGoals = () => useContext(CreatedGoalsContext).list;
export function useSaveCreatedGoals() {
  const router = useRouter();
  const { set } = useContext(CreatedGoalsContext);
  return (list: CreatedGoal[], then?: string) => {
    const kept = list.slice(0, MAX_CREATED_GOALS);
    if (!writeCookie(CREATED_GOALS_COOKIE, kept)) return;
    set(kept);
    if (then) router.push(then); else router.refresh();
  };
}

// Browsers drop cookies over about 4 KB without telling anyone, so refuse and explain instead of losing data.
export function writeCookie(name: string, value: unknown) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  if (encoded.length > 3800) { toast.error("The preview's storage is full", { description: "Delete a goal or group you made, then try again." }); return false; }
  document.cookie = `${name}=${encoded}; path=/; max-age=31536000; samesite=lax`;
  return true;
}
