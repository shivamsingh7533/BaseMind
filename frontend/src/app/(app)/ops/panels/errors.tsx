import { format } from "date-fns";
import { AlertTriangle, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OpsErrorsData } from "@/lib/api";

function humanize(evt: string): string {
  return evt.replace(/_/g, " ");
}

export function ErrorsPanel({ errors }: { errors: OpsErrorsData | null }) {
  const counts24 = errors?.counts24h ?? {};
  const counts7 = errors?.counts7d ?? {};
  const recent = errors?.recent ?? [];

  const allTypes = Array.from(new Set([...Object.keys(counts24), ...Object.keys(counts7)]));
  const empty = allTypes.length === 0 && recent.length === 0;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h1 className="font-heading text-xl font-semibold text-white">Errors</h1>
        <p className="mt-1 text-sm text-slate-400">
          Event log breakdown from the last 24h vs last 7 days.
        </p>

        {empty ? (
          <div className="mt-6 rounded-xl bg-emerald-500/10 p-10 text-center ring-1 ring-emerald-500/20">
            <ShieldX className="mx-auto size-8 text-emerald-400" />
            <p className="mt-3 text-sm text-emerald-300">No errors or attention events recorded.</p>
            <p className="mt-1 text-xs text-emerald-500/80">Everything is running clean.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-widest text-slate-500">
                    <th scope="col" className="px-4 py-3 font-medium">Event type</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last 24h</th>
                    <th scope="col" className="px-4 py-3 font-medium">Last 7 days</th>
                    <th scope="col" className="px-4 py-3 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {allTypes.map((type) => {
                    const c24 = counts24[type] ?? 0;
                    const c7 = counts7[type] ?? 0;
                    const trend = c7 > 0 ? Math.round((c24 / c7) * 100) : 0;
                    const rising = c24 > c7 / 7 * 1.5;
                    return (
                      <tr key={type} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-medium capitalize text-white">{humanize(type)}</td>
                        <td className="px-4 py-3">
                          <span className={c24 > 0 ? "font-semibold text-red-400" : "text-slate-500"}>{c24}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{c7}</td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-full font-medium ${rising ? "bg-red-500/20 text-red-400" : "bg-slate-500/20 text-slate-400"}`}>
                            {rising ? `${trend}% · rising` : "steady"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <AlertTriangle className="size-3.5" /> Recent error events
              </h3>
              {recent.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No recent error events.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {recent.map((e) => (
                    <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium text-white">
                          <span className={`size-1.5 rounded-full ${e.severity === "error" ? "bg-red-500" : "bg-amber-500"}`} />
                          {humanize(e.event_type)}
                        </p>
                        <span className="text-xs text-slate-500">
                          {e.created_at ? format(new Date(e.created_at), "MMM d, HH:mm:ss") : ""}
                        </span>
                      </div>
                      {e.detail ? (
                        <p className="mt-1.5 break-words font-mono text-xs text-slate-400">{e.detail}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}