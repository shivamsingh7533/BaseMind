export function TrendsPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Trends (14 days)</h2>
        <p className="text-slate-400 text-sm mb-6">
          Usage trend charts abhi render honge kyunki <code>recharts</code> installed hai lekin endpoint (<code>GET /api/ops/trends?days=14</code>) ab banana baqi hai. Charts: daily queries, conversations, new users, new agents.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 1: <code>/api/ops/trends</code> daily query/conversation counts grouped by date.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Charts: <code>recharts</code> area/line charts under the hood. Dono chart components alag banenge jab endpoint ready.</p>
          </div>
        </div>
      </div>
    </div>
  );
}