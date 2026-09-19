import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Bot,
  CheckCircle2,
  CirclePlus,
  Database,
  FileText,
  FileUp,
  Mail,
  MessageSquare,
  Shield,
  TrendingUp,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  OpsSeverity,
  OpsStatus,
  GroundingMetric,
} from "@/lib/api";

function rel(iso: string) {
  if (!iso) return "";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

const SEV_DOT: Record<OpsSeverity, string> = {
  info: "bg-slate-400",
  attention: "bg-amber-500",
  error: "bg-red-500",
};

function ActivityIcon({
  kind,
  severity,
}: {
  kind: OpsStatus["activity"][number]["kind"];
  severity: OpsSeverity;
}) {
  if (severity === "error" || severity === "attention")
    return <TriangleAlert className="size-3.5" />;
  if (kind === "agent") return <Bot className="size-3.5" />;
  if (kind === "document") return <FileText className="size-3.5" />;
  if (kind === "conversation") return <MessageSquare className="size-3.5" />;
  return <Mail className="size-3.5" />;
}

export function OverviewPanel({
  ops,
  grounding,
}: {
  ops: OpsStatus | null;
  grounding: GroundingMetric | null;
}) {
  if (!ops) return null;
  const { metrics, vector, alerts } = ops;
  const hasError = alerts.some((a) => a.severity === "error");
  const isNominal = ops.nominal;
  const totalDocs = vector.indexedDocs + vector.pendingDocs + vector.failedDocs;
  const vecPct = totalDocs > 0 ? Math.round((vector.indexedDocs / totalDocs) * 100) : 0;
  const groundingPct = grounding?.groundingPct ?? 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Header — dark command bar */}
        <div className="relative overflow-hidden rounded-[20px] bg-slate-950 p-6 sm:p-7">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.08] via-transparent to-indigo-500/[0.12]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
                <Shield className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading text-xl font-semibold tracking-tight text-white">Command Center</h1>
                  <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-white/70 ring-1 ring-white/10 sm:inline-flex">OPS</span>
                </div>
                <p className="mt-0.5 text-xs text-white/55">Operations · Live telemetry · RAG Engine v{ops.engine}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
                  isNominal
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20"
                    : hasError
                      ? "bg-red-500/15 text-red-300 ring-red-500/20"
                      : "bg-amber-500/15 text-amber-300 ring-amber-500/20"
                }`}
              >
                <span className="relative flex size-2">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${isNominal ? "bg-emerald-400" : hasError ? "bg-red-400" : "bg-amber-400"}`} />
                  <span className={`relative inline-flex size-2 rounded-full ${isNominal ? "bg-emerald-400" : hasError ? "bg-red-400" : "bg-amber-400"}`} />
                </span>
                {isNominal ? "All systems nominal" : hasError ? "Errors active" : "Attention required"}
              </span>
              <Badge className="rounded-full bg-slate-800 px-3 py-1 text-white hover:bg-slate-700">v{ops.engine}</Badge>
            </div>
          </div>
          <div className="relative mt-5 flex items-center gap-3 text-xs text-white/40">
            <span className="inline-flex items-center gap-1.5"><Activity className="size-3" /> Updated {rel(ops.generatedAt)}</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span className="inline-flex items-center gap-1"><Zap className="size-3" /> Auto-refresh 60s</span>
          </div>
        </div>

        {/* Metrics — 5 bento cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow">
                  <MessageSquare className="size-5" />
                </span>
                {metrics.queriesDeltaPct !== null ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${metrics.queriesDeltaPct >= 0 ? "bg-emerald-950/30 text-emerald-300 ring-1 ring-emerald-900/30" : "bg-red-950/30 text-red-300 ring-1 ring-red-900/30"}`}>
                    <TrendingUp className="size-3" />
                    {metrics.queriesDeltaPct >= 0 ? "+" : ""}{metrics.queriesDeltaPct}%
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-400">—</span>
                )}
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total Queries</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{metrics.totalQueries.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.queriesToday} today · {metrics.conversations} conversations</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow">
                  <Bot className="size-5" />
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${metrics.activeAgents > 0 ? "bg-emerald-950/30 text-emerald-300 ring-emerald-900/30" : "bg-slate-800 text-slate-300 ring-slate-700"}`}>
                  <span className={`size-1.5 rounded-full ${metrics.activeAgents > 0 ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {metrics.activeAgents > 0 ? "Live" : "Idle"}
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Active Agents</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{metrics.activeAgents}<span className="text-lg font-medium text-muted-foreground"> / {metrics.agents}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.agents} total deployed</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow">
                  <Users className="size-5" />
                </span>
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">{metrics.users} users</span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Platform Users</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{metrics.users.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.conversationsToday} conversations today</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow">
                  <Database className="size-5" />
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${vector.status === "synced" ? "bg-emerald-950/30 text-emerald-300 ring-emerald-900/30" : vector.status === "empty" ? "bg-slate-800 text-slate-300 ring-slate-700" : "bg-amber-950/30 text-amber-300 ring-amber-900/30"}`}>
                  <span className={`size-1.5 rounded-full ${vector.status === "synced" ? "bg-emerald-500" : vector.status === "empty" ? "bg-slate-400" : "bg-amber-500"}`} />
                  {vector.status}
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Vector Store</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{vector.embeddings.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{vector.dim}d · {vecPct}% indexed</p>
            </CardContent>
          </Card>

          {/* Grounding % card */}
          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow">
                  <Shield className="size-5" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold bg-emerald-950/30 text-emerald-300 ring-1 ring-emerald-900/30">
                  {groundingPct}%
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Grounding %</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{groundingPct}%</p>
              <p className="mt-1 text-xs text-muted-foreground">{grounding?.messagesWithSources ?? 0} of {grounding?.totalMessages ?? 0} responses grounded</p>
            </CardContent>
          </Card>
        </div>

        {/* Vector detail + Alerts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border-slate-200/70 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Database className="size-4" /> pgvector
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-900/50 p-3 ring-1 ring-slate-800/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Embeddings</p>
                  <p className="mt-1 font-heading text-xl font-bold">{vector.embeddings.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-slate-900/50 p-3 ring-1 ring-slate-800/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Indexed</p>
                  <p className="mt-1 font-heading text-xl font-bold text-emerald-400">{vector.indexedDocs}</p>
                </div>
                <div className="rounded-xl bg-slate-900/50 p-3 ring-1 ring-slate-800/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Failed</p>
                  <p className={`mt-1 font-heading text-xl font-bold ${vector.failedDocs > 0 ? "text-red-400" : "text-white"}`}>{vector.failedDocs}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Index health</span>
                  <span className="font-medium">{vecPct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-800/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 transition-all" style={{ width: `${vecPct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{vector.pendingDocs} pending · {vector.dim} dimensions</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                <TriangleAlert className="size-4" /> Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="rounded-xl bg-emerald-950/20 p-4 ring-1 ring-emerald-900/30">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                    <CheckCircle2 className="size-4" /> All clear
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-300/80">No active alerts. System is operating within normal thresholds.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className={`rounded-xl p-3 ring-1 ${a.severity === "error" ? "bg-red-950/30 ring-red-900/30" : "bg-amber-950/30 ring-amber-900/30"}`}>
                      <div className="flex gap-2.5">
                        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${a.severity === "error" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                          <TriangleAlert className="size-3.5" />
                        </span>
                        <p className={`text-sm leading-snug ${a.severity === "error" ? "text-red-300" : "text-amber-300"}`}>{a.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions — distinct pill bar */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800">
            <Link href="/agents"><CirclePlus className="size-4" /> New Agent</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full bg-slate-900">
            <Link href="/knowledge-base"><FileUp className="size-4" /> Upload Data</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/logs">View Logs →</Link>
          </Button>
        </div>

        {/* Activity — timeline */}
        <Card className="mt-6 rounded-2xl border-slate-200/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-heading text-sm"><Activity className="size-4" /> Recent Activity</CardTitle>
            <Link href="/logs" className="text-xs font-medium text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {ops.activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No system activity yet — events will appear here as they happen.</p>
            ) : (
              <div className="relative pl-6">
                <div className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200" />
                <div className="space-y-4">
                  {ops.activity.map((a) => (
                    <div key={a.id} className="relative flex gap-3">
                      <span className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${a.severity === "error" ? "bg-red-500 text-white" : a.severity === "attention" ? "bg-amber-500 text-white" : "bg-slate-900 text-white"}`}>
                        <ActivityIcon kind={a.kind} severity={a.severity} />
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-slate-900/50 px-3 py-2.5 ring-1 ring-slate-800/60">
                        <p className="text-sm leading-snug">
                          <span className="font-semibold">{a.highlight}</span>{" "}
                          <span className="text-muted-foreground">{a.text}</span>
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={`size-1.5 rounded-full ${SEV_DOT[a.severity]}`} />
                          {rel(a.at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-emerald-400" /> Updated {rel(ops.generatedAt)} · Operator view · Auto-refresh 60s
        </p>
      </div>
    </div>
  );
}