export function ErrorsPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Errors</h2>
        <p className="text-slate-400 text-sm mb-6">
          Error center ready hai kyunki <code>event_logs</code> table data use karta hai. <code>GET /api/ops/errors</code> breakdown event types count 24h+7d dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Active: event_logs se rate_limit / chat_stream_error / ingest_error / email failure counts.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Fetch: existing ops status se event_logs already populated hai; errors section (Phase 2) dedicated endpoint aayega.</p>
          </div>
        </div>
      </div>
    </div>
  );
}