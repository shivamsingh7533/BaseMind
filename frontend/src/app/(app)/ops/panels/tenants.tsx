export function TenantsPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Tenants</h2>
        <p className="text-slate-400 text-sm mb-6">
          Tenant list abhi data fetch karna baqi hai. Baad me har workspace k agents, docs, convs count dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 1: Tenants table endpoint (<code>GET /api/ops/tenants</code>) aayega jahan har user ka aggregate stats dikhega — owners, agents count, docs count, queries, plan mix, created date. Ek table ya search bar aayegi.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Fetch trigger: operator me <code>OPERATOR_EMAILS</code> set karke backend redeploy karein, phir <code>/ops?tab=tenants</code> ya tabs se switch karein.</p>
          </div>
        </div>
      </div>
    </div>
  );
}