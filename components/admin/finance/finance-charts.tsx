"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const PIE_COLORS = [
  "hsl(220 85% 38%)",
  "hsl(151 70% 32%)",
  "hsl(38 95% 45%)",
  "hsl(0 75% 45%)",
  "hsl(200 90% 40%)",
  "hsl(280 60% 45%)",
  "hsl(340 70% 45%)",
  "hsl(110 50% 35%)",
];

function shortAmount(v: number) {
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return String(v);
}

export function IncomeExpenseChart({
  data,
}: {
  data: { month: string; income: number; expense: number; net: number }[];
}) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 88%)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={shortAmount} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => formatCurrency(Number(value))}
            labelStyle={{ color: "hsl(220 30% 12%)" }}
          />
          <Legend />
          <Bar dataKey="income" fill="hsl(151 70% 32%)" name="Income" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="hsl(0 75% 45%)" name="Expense" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseBreakdownChart({
  data,
}: {
  data: { category: string; amount: number }[];
}) {
  if (!data.length) {
    return (
      <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
        No expenses this month.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={110}
            label={(e: { category: string }) => e.category}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
