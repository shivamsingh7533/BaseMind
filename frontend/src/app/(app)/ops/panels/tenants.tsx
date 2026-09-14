import { useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { OpsTenant } from "@/lib/api";

const PLAN_COLOR: Record<string, string> = {
  free: "bg-slate-500/20 text-slate-400",
  starter: "bg-teal-500/20 text-teal-400",
  pro: "bg-indigo-500/20 text-indigo-400",
};

export function TenantsPanel({ tenants }: { tenants: OpsTenant[] | null }) {
  const [q, setQ] = useState("");

  const rows = tenants ?? [];
  const filtered = q.trim()
    ? rows.filter(
        (t) =>
          t.email.toLowerCase().includes(q.toLowerCase()) ||
          t.name.toLowerCase().includes(q.toLowerCase()) ||
          t.plan.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold text-white">Tenants</h1>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} workspace{rows.length === 1 ? "" : "s"} · live data from users, agents, documents & conversations
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email, name or plan…"
              aria-label="Search tenants"
              className="bg-slate-800 border-slate-700 py-2 pl-9 text-white placeholder-slate-500 focus-visible:ring-teal-500"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-800/50 p-10 text-center">
            <p className="text-sm text-slate-500">
              No workspaces found — users appear here as they sign up.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-widest text-slate-500">
                  <th scope="col" className="px-4 py-3 font-medium">Tenant</th>
                  <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-4 py-3 font-medium">Agents</th>
                  <th scope="col" className="px-4 py-3 font-medium">Docs</th>
                  <th scope="col" className="px-4 py-3 font-medium">Pending/Failed</th>
                  <th scope="col" className="px-4 py-3 font-medium">Conversations</th>
                  <th scope="col" className="px-4 py-3 font-medium">Queries today</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.email} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`rounded-full font-medium ${PLAN_COLOR[t.plan] ?? PLAN_COLOR.free}`}>
                        {t.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.agents}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300">{t.documents}</p>
                      {Object.keys(t.docTypeCounts).length > 0 ? (
                        <p className="text-xs text-slate-500">
                          {Object.entries(t.docTypeCounts)
                            .map(([k, v]) => `${v} ${k}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-slate-300 ${t.pendingDocs > 0 ? "text-amber-400" : ""}`}>
                        {t.pendingDocs}
                      </span>
                      {" / "}
                      <span className={`${t.failedDocs > 0 ? "text-red-400" : "text-slate-300"}`}>
                        {t.failedDocs}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.conversations}</td>
                    <td className="px-4 py-3 font-medium text-teal-400">{t.queriesToday}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {t.createdAt ? format(new Date(t.createdAt), "MMM d, yyyy") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length !== rows.length ? (
          <p className="mt-3 text-xs text-slate-500">
            Showing {filtered.length} of {rows.length} tenants.
          </p>
        ) : null}
      </div>
    </div>
  );
}