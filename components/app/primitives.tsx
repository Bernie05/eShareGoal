import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Semantic tones: success = progress/income, danger = expense/overdue, warning = pending, info = neutral. */
export type Tone = "success" | "danger" | "warning" | "info";
const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-destructive-soft text-destructive",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};
export const toneText: Record<Tone, string> = { success: "text-success", danger: "text-destructive", warning: "text-warning", info: "text-info" };

const statusTone: Record<string, Tone> = {
  confirmed: "success", Confirmed: "success", Active: "success",
  pending: "warning", "Pending Review": "warning", Detected: "info", Paused: "warning",
  reversed: "info", Reversed: "info", Pending: "warning", Done: "info", Archived: "info", Completed: "success",
  Rejected: "danger", Error: "danger", Duplicate: "info", Overdue: "danger", Success: "success", Failed: "danger",
  Invited: "warning", Suspended: "danger", "Pending review": "warning", Revoked: "danger", Open: "warning", "In review": "info", Resolved: "success", Dismissed: "info",
};

/** Status is always icon-free text plus colour, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const label = status === "pending" ? "Pending" : status === "confirmed" ? "Confirmed" : status === "reversed" ? "Reversed" : status;
  return <Badge variant="secondary" className={cn("border-0", toneClass[statusTone[status] ?? "info"])}>{label}</Badge>;
}

export function ProgressBar({ value, label, tone = "success" }: { value: number; label: string; tone?: "success" | "primary" }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-primary")} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ComponentType<{ className?: string }> }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          {Icon && <Icon className="size-4" aria-hidden />}
        </div>
        <div className={cn("num text-2xl font-semibold tracking-tight", tone && toneText[tone])}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Shown when a figure cannot be computed: never invent a number. */
export const Unavailable = ({ why }: { why: string }) => (
  <span className="text-base font-medium text-muted-foreground" title={why}>Unavailable</span>
);

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

export function EmptyState({ title, body, cta }: { title: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" aria-hidden /></div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
        </div>
        {cta && <Link href={cta.href} className={buttonVariants()}>{cta.label}</Link>}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ title = "Could not load this page", body = "Something went wrong on our side. Your data is safe. Try again in a moment.", retryHref }: { title?: string; body?: string; retryHref: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {body}{" "}
        <Link href={retryHref} className="font-medium underline underline-offset-2">Retry</Link>
      </AlertDescription>
    </Alert>
  );
}

export function LoadingState() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-80 max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Renders the right UI for the preview ?state= value. Real screens will map query/fetch status the same way. */
export function StateGate({ state, empty, retryHref, children }: { state: "default" | "loading" | "empty" | "error"; empty: ReactNode; retryHref: string; children: ReactNode }) {
  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState retryHref={retryHref} />;
  if (state === "empty") return <>{empty}</>;
  return <>{children}</>;
}
