import { Bot, Crown, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OpsAgent } from "@/lib/api";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-slate-500/20 text-slate-400",
  training: "bg-amber-500/20 text-amber-400",
};

export function AgentsPanel({ agents }: { agents: OpsAgent[] | null }) {
  const rows = agents ?? [];
  const activeCount = rows.filter((a) => a.active).length;
  const slowCount = rows.filter((a) => a.isSlow).length;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold text-white">Agents</h1>
            <p className="mt-1 text-sm text-slate-400">
              Top {rows.length} by queries in last 24h · {activeCount} active · {slowCount} slow
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Crown className="size-4 text-amber-500" /> ranked by queries
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-800/50 p-10 text-center">
            <p className="text-sm text-slate-500">
              No agents deployed yet — they appear here as tenants create them.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {rows.map((a, i) => (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      i === 0
                        ? "bg-amber-500/20 text-amber-400"
                        : i === 1
                          ? "bg-slate-500/20 text-slate-300"
                          : i === 2
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400">
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{a.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {a.ownerEmail ?? "—"} · {a.queries24h} queries/24h
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge className={`rounded-full font-medium ${STATUS_COLOR[a.status] ?? STATUS_COLOR.paused}`}>
                    {a.status}
                  </Badge>
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      a.isSlow ? "text-amber-400" : "text-slate-400"
                    }`}
                  >
                    <Gauge className="size-3.5" />
                    {a.avgLatencyMs}ms
                    {a.isSlow ? " · slow" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          An agent is flagged slow when its average latency exceeds the ops threshold.
        </p>
      </div>
    </div>
  );
}