"use client";

import dynamic from "next/dynamic";
import { Activity, Bot, MessageSquare, Users } from "lucide-react";
import type { OpsTrendPoint } from "@/lib/api";

const TrendMiniChart = dynamic(
  () => import("./trend-mini-chart").then((m) => m.TrendMiniChart),
  { ssr: false, loading: () => <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-800/60" /> }
);

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
            <h1 className="font-heading text-xl font-semibold text-white">Trends (14 days)</h1>
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
        <h1 className="font-heading text-xl font-semibold text-white">Trends (14 days)</h1>
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
                <TrendMiniChart data={data} series={s} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}