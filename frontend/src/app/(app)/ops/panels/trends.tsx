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
import { Activity, Bot, MessageSquare, Users } from "lucide-react";
import type { OpsTrendPoint } from "@/lib/api";

const SERIES = [
  {
    key: "queries",
    label: "Queries",
    color: "#2dd4bf",
    icon: Activity,
  },
  {
    key: "conversations",
    label: "Conversations",
    color: "#a78bfa",
    icon: MessageSquare,
  },
  {
    key: "newUsers",
    label: "New users",
    color: "#60a5fa",
    icon: Users,
  },
  {
    key: "newAgents",
    label: "New agents",
    color: "#fbbf24",
    icon: Bot,
  },
] as const;

export function TrendsPanel({ trends }: { trends: OpsTrendPoint[] | null }) {
  const data = trends ?? [];

  if (data.length === 0) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
          <h2 className="font-heading text-xl font-semibold text-white">Trends (14 days)</h2>
          <div className="mt-6 rounded-xl bg-slate-800/50 p-10 text-center">
            <p className="text-sm text-slate-500">
              No activity in the last 14 days — charts fill in as usage happens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white">Trends (14 days)</h2>
        <p className="mt-1 text-sm text-slate-400">
          Daily usage from real query, conversation, user and agent data.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {SERIES.map((s) => {
            const total = data.reduce((sum, d) => sum + d[s.key], 0);
            return (
              <div
                key={s.key}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    <s.icon className="size-3.5" style={{ color: s.color }} /> {s.label}
                  </p>
                  <span className="text-xs text-slate-400">{total} total</span>
                </div>
                <div className="mt-4 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <defs>
                        <linearGradient id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0} />
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
                        formatter={(value) => [String(value ?? 0), s.label]}
                      />
                      <Area
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={2}
                        fill={`url(#grad-${s.key})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}