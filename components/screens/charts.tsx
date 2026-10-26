"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { byMember, members, monthly, type GoalPoint } from "@/lib/demo-data";

const peso0 = (v: number) => "₱" + v.toLocaleString("en-PH");
const axis = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

const memberConfig: ChartConfig = Object.fromEntries(members.map((m) => [m.id, { label: m.name, color: m.color }]));
const flowConfig: ChartConfig = { incoming: { label: "Deposits in", color: "var(--success)" }, outgoing: { label: "Payments and expenses out", color: "var(--destructive)" } };

// Every chart needs a text alternative: aria-label here, and the data is also in the tables on the same screen.
export function MonthlyContributionsChart() {
  return (
    <ChartContainer config={memberConfig} className="h-64 w-full" role="img" aria-label="Monthly contributions by member, stacked bars">
      <BarChart data={monthly}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={48} tickFormatter={(v) => `${v / 1000}k`} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span className="num">{String(n)}: {peso0(Number(v))}</span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {members.map((m) => <Bar key={m.id} dataKey={m.id} stackId="a" fill={`var(--color-${m.id})`} />)}
      </BarChart>
    </ChartContainer>
  );
}

export function InOutChart() {
  return (
    <ChartContainer config={flowConfig} className="h-64 w-full" role="img" aria-label="Deposits versus payments and expenses per month">
      <BarChart data={monthly}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={48} tickFormatter={(v) => `${v / 1000}k`} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span className="num">{String(n)}: {peso0(Number(v))}</span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="incoming" fill="var(--color-incoming)" radius={3} />
        <Bar dataKey="outgoing" fill="var(--color-outgoing)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

export function ByMemberChart() {
  const data = byMember.map((b) => ({ id: b.member.id, name: b.member.name, value: b.total / 100 }));
  return (
    <ChartContainer config={memberConfig} className="mx-auto h-56 w-full" role="img" aria-label="Share of total contributions by member">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="id" formatter={(v, n) => <span className="num">{String(n)}: {peso0(Number(v))}</span>} />} />
        <Pie data={data} dataKey="value" nameKey="id" innerRadius={52} outerRadius={84} strokeWidth={2} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.id} fill={`var(--color-${d.id})`} />)}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="id" />} />
      </PieChart>
    </ChartContainer>
  );
}

/** One goal's monthly series for the current user: pesos for money goals, counts for progress goals. */
export function MyGoalChart({ data, unit, label }: { data: GoalPoint[]; unit: "peso" | "count"; label: string }) {
  const config: ChartConfig = { value: { label, color: unit === "peso" ? "var(--chart-1)" : "var(--chart-2)" } };
  return (
    <ChartContainer config={config} className="h-48 w-full" role="img" aria-label={label}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={unit === "peso" ? 44 : 28} allowDecimals={false} tickFormatter={(v) => (unit === "peso" ? `${v / 1000}k` : String(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="num">{label}: {unit === "peso" ? peso0(Number(v)) : String(v)}</span>} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
