import { CheckCircle2, Clock, Database, FileText, TriangleAlert } from "lucide-react";
import type { OpsDocumentsStats } from "@/lib/api";

export function DocsPanel({
  documents,
}: {
  documents: OpsDocumentsStats | null;
}) {
  const d = documents;
  const total = d?.totalDocs ?? 0;
  const readyPct = total > 0 ? Math.round(((d?.readyDocs ?? 0) / total) * 100) : 0;

  const cards = [
    {
      label: "Total documents",
      value: d?.totalDocs ?? 0,
      icon: FileText,
      accent: "from-slate-700 to-slate-800",
      sub: null as string | null,
    },
    {
      label: "Ready / indexed",
      value: d?.readyDocs ?? 0,
      icon: CheckCircle2,
      accent: "from-emerald-500 to-emerald-600",
      sub: `${readyPct}% of total`,
    },
    {
      label: "Pending (processing)",
      value: d?.pendingDocs ?? 0,
      icon: Clock,
      accent: "from-amber-500 to-orange-600",
      sub: null as string | null,
    },
    {
      label: "Failed",
      value: d?.failedDocs ?? 0,
      icon: TriangleAlert,
      accent: "from-red-500 to-rose-600",
      sub: d && d.failedDocs > 0 ? "Needs review" : null,
    },
  ];

  const typeEntries = Object.entries(d?.typeCounts ?? {});

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white">Documents</h2>
        <p className="mt-1 text-sm text-slate-400">
          Global ingestion pipeline · {d?.embeddings ?? 0} embeddings in the vector store
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <span className={`inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-white shadow`}>
                <c.icon className="size-5" />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-500">{c.label}</p>
              <p className="mt-1 font-heading text-3xl font-bold leading-none text-white">{c.value.toLocaleString()}</p>
              {c.sub ? <p className="mt-1 text-xs text-slate-500">{c.sub}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <Database className="size-3.5" /> Embeddings & type breakdown
          </p>
          <p className="mt-2 font-heading text-2xl font-bold text-teal-400">
            {(d?.embeddings ?? 0).toLocaleString()}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {typeEntries.length === 0 ? (
              <span className="text-sm text-slate-500">No documents uploaded yet.</span>
            ) : (
              typeEntries.map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 ring-1 ring-slate-700"
                >
                  <FileText className="size-3" /> {type} · {count}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}