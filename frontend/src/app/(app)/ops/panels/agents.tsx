export function AgentsPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Agents</h2>
        <p className="text-slate-400 text-sm mb-6">
          Agent leaderboard pending — backend endpoint <code>GET /api/ops/agents</code> aayega jahan har agent k queries_24h, active/paused split, aur avg latency over 30s flag dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 1: Agent leaderboard top agents by queries_24h + active split.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Fetch trigger: same — <code>OPERATOR_EMAILS</code> set karne baad backend redeploy, phir <code>/ops?tab=agents</code> par.</p>
          </div>
        </div>
      </div>
    </div>
  );
}