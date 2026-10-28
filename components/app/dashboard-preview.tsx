import { BookOpen, ChartColumn, ChartPie, CircleGauge, Dumbbell, Home, Landmark, ListChecks, Medal, Plane, Table2, Target, Wallet, type LucideIcon } from "lucide-react";
import { widget, type IconKey, type WidgetId } from "@/lib/goal-templates";
import { cn } from "@/lib/utils";

export const templateIcon: Record<IconKey, LucideIcon> = { wallet: Wallet, landmark: Landmark, dumbbell: Dumbbell, list: ListChecks, target: Target, plane: Plane, home: Home, book: BookOpen };
const widgetIcon: Record<WidgetId, LucideIcon> = {
  stats: CircleGauge, progress: CircleGauge, monthly: ChartColumn, byMember: ChartPie, contributions: Table2, schedule: Table2,
  inout: ChartColumn, checkins: ChartColumn, leaderboard: Medal, milestones: Target, tasks: ListChecks, records: Table2,
};

/** Wireframe of a goal dashboard: one block per section, in the order chosen. Wide sections take the full row. */
export function DashboardPreview({ widgets, className }: { widgets: WidgetId[]; className?: string }) {
  if (!widgets.length) return <p className={cn("rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground", className)}>No dashboard sections yet. Pick at least one.</p>;
  return (
    <ol className={cn("grid grid-cols-2 gap-2", className)} aria-label="Dashboard sections, in order">
      {widgets.map((id, i) => {
        const w = widget(id); const Icon = widgetIcon[id];
        return (
          <li key={id} className={cn("flex min-h-14 items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs", w.wide && "col-span-2")}>
            <span className="num text-muted-foreground">{i + 1}</span><Icon className="size-4 shrink-0 text-primary" aria-hidden /><span className="font-medium">{w.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
