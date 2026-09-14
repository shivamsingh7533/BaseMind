export function DocsPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Documents</h2>
        <p className="text-slate-400 text-sm mb-6">
          Document pipeline stats abhi data fetch karna baqi hai. Baad me PDF/TXT/CSV/URL mix, processing queue, failed reasons, aur ingestion today count dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 1: Documents endpoint (<code>GET /api/ops/documents</code>) total/processing/failed/ingested today.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Fetch trigger: <code>OPERATOR_EMAILS</code> set karke redeploy, phir <code>/ops?tab=docs</code> par.</p>
          </div>
        </div>
      </div>
    </div>
  );
}