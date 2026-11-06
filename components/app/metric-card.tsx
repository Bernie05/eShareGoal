import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/app/primitives";

// One dashboard number for the System Admin, as "this many of the total" (or a plain count).
// total: shown as "value / total" with a bar; none = a plain count (unit after it).
export type Metric = { label: string; Icon: LucideIcon; value: number; total?: number; unit?: string; details: string[]; href: string; link: string; tone?: "success" | "primary" };
interface MetricCardProps {
  m: Metric;
}
export function MetricCard({ m }: MetricCardProps) {
  const pct = m.total ? Math.round((m.value / m.total) * 100) : 0;
  const of = m.total !== undefined;
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{m.label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><m.Icon className="size-4" aria-hidden /></span>
        </div>
        <p className="num text-2xl font-semibold">{m.value}<span className="text-base font-normal text-muted-foreground">{of && ` / ${m.total}`}{m.unit && ` ${m.unit}`}</span></p>
        {of && <ProgressBar value={pct} tone={m.tone} label={`${m.label}: ${m.value} of ${m.total}`} />}
        <ul className="space-y-0.5 text-xs text-muted-foreground">{m.details.map((d) => <li key={d}>{d}</li>)}</ul>
        <Link href={m.href} className="mt-auto pt-1 text-xs font-medium text-primary hover:underline">{m.link} →</Link>
      </CardContent>
    </Card>
  );
}

