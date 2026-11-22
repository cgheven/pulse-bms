"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export type RevExpPoint = { month: string; revenue: number; spend: number };

const GREEN = "hsl(151 70% 55%)";
const ROSE = "hsl(350 80% 68%)";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueExpensesChart({ data }: { data: RevExpPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={GREEN} stopOpacity={0.25} />
            <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={ROSE} stopOpacity={0.2} />
            <stop offset="95%" stopColor={ROSE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 28% 16%)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(215 16% 55%)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(215 16% 55%)" }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={GREEN}
          fill="url(#revGrad)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: GREEN }}
        />
        <Area
          type="monotone"
          dataKey="spend"
          name="Spend"
          stroke={ROSE}
          fill="url(#spendGrad)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: ROSE }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
