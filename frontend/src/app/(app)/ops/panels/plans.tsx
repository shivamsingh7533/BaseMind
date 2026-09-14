import { Badge } from "@/components/ui/badge";
import type { OpsTenant } from "@/lib/api";

const PLAN_STYLES: Record<string, string> = {
  free: "bg-slate-500/20 text-slate-400",
  starter: "bg-teal-500/20 text-teal-400",
  pro: "bg-indigo-500/20 text-indigo-400",
};

export function PlansPanel({ tenants }: { tenants: OpsTenant[] | null }) {
  const rows = tenants ?? [];
  const planCounts: Record<string, number> = {};
  for (const t of rows) {
    const plan = t.plan || "free";
    planCounts[plan] = (planCounts[plan] ?? 0) + 1;
  }
  const plans = Object.entries(planCounts).sort((a, b) => b[1] - a[1]);
  const totalWithPlan = rows.length;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h1 className="font-heading text-xl font-semibold text-white">Plans</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live plan distribution across {totalWithPlan} workspace{totalWithPlan === 1 ? "" : "s"}.
        </p>

        <div className="mt-6 flex items-center gap-2 rounded-xl bg-teal-500/10 p-4 ring-1 ring-teal-500/20">
          <Badge className="rounded-full bg-teal-500/20 text-teal-400">Beta</Badge>
          <p className="text-sm text-teal-200">
            All plans are free during beta. Billing is added post-launch.
          </p>
        </div>

        {plans.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-800/50 p-10 text-center">
            <p className="text-sm text-slate-500">
              No tenants yet — every new signup gets a free plan by default.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map(([plan, count]) => (
              <div key={plan} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <Badge className={`rounded-full font-medium capitalize ${PLAN_STYLES[plan] ?? PLAN_STYLES.free}`}>
                    {plan}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {totalWithPlan > 0 ? Math.round((count / totalWithPlan) * 100) : 0}%
                  </span>
                </div>
                <p className="mt-4 font-heading text-3xl font-bold leading-none text-white">{count}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {count === 1 ? "workspace" : "workspaces"}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500">
          MRR is not reported yet — payment gateway is configured post-launch.
        </p>
      </div>
    </div>
  );
}