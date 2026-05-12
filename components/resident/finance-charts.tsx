"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const PIE_COLORS = [
  "#1e40af", // deep blue
  "#0891b2", // cyan
  "#15803d", // green
  "#c2410c", // orange
  "#7c3aed", // violet
  "#be123c", // rose
  "#a16207", // amber
  "#475569", // slate
];

export function IncomeExpenseBarChart({
  data,
}: {
  data: { month: string; income: number; expense: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) =>
              v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
            }
          />
          <Tooltip
            formatter={(v: number) => formatCurrency(Number(v))}
            contentStyle={{ borderRadius: 10, fontSize: 14 }}
          />
          <Legend wrapperStyle={{ fontSize: 14 }} />
          <Bar dataKey="income"  fill="#15803d" name="Income"  radius={[6, 6, 0, 0]} />
          <Bar dataKey="expense" fill="#be123c" name="Expense" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseCategoryPie({
  data,
}: {
  data: { category: string; amount: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-muted-foreground">
        No expenses this month yet.
      </div>
    );
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            outerRadius={100}
            label={(entry: { category: string; amount: number; percent?: number }) =>
              `${entry.category} ${entry.percent ? `${(entry.percent * 100).toFixed(0)}%` : ""}`
            }
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => formatCurrency(Number(v))}
            contentStyle={{ borderRadius: 10, fontSize: 14 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
