"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OpsTrendPoint } from "@/lib/api";

export function TrendMiniChart({
  data,
  series,
}: {
  data: OpsTrendPoint[];
  series: { key: string; label: string; color: string };
}) {
  return (
    <div className="mt-4 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id={`grad-${series.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)}
            axisLine={{ stroke: "#1e293b" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value) => [String(value ?? 0), series.label]}
          />
          <Area
            type="monotone"
            dataKey={series.key}
            stroke={series.color}
            strokeWidth={2}
            fill={`url(#grad-${series.key})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}