"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
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
  ShieldAlert,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { fetchOpsStatus, type OpsSeverity, type OpsStatus } from "@/lib/api";

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

// ============================================================
// Module-level panel components — defined once, outside OpsPage
// so React never creates them during render.
// ============================================================

const TAB_OVERVIEW = "overview";
const TAB_TENANTS = "tenants";
const TAB_AGENTS = "agents";
const TAB_DOCS = "docs";
const TAB_TRENDS = "trends";
const TAB_ERRORS = "errors";
const TAB_PLANS = "plans";
const TAB_ANNOUNCE = "announce";

function TabsNavigation({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const tabs = [
    { key: TAB_OVERVIEW, label: "Overview" },
    { key: TAB_TENANTS, label: "Tenants" },
    { key: TAB_AGENTS, label: "Agents" },
    { key: TAB_DOCS, label: "Documents" },
    { key: TAB_TRENDS, label: "Trends" },
    { key: TAB_ERRORS, label: "Errors" },
    { key: TAB_PLANS, label: "Plans" },
    { key: TAB_ANNOUNCE, label: "Announce" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-3 sm:p-4 border border-slate-200/50">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant="outline"
              size="icon"
              className={
                `rounded-full px-4 py-2 text-sm font-medium ${
                  activeTab === tab.key
                    ? "bg-slate-900 text-white shadow-lg"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
          <Separator className="my-1" />
        </div>
      </div>
    </div>
  );
}

// ----- Overview Panel (needs ops prop) -----
function OverviewPanel({ ops }: { ops: OpsStatus | null }) {
  if (!ops) return null;
  const { metrics, vector, alerts } = ops;
  const hasError = alerts.some((a) => a.severity === "error");
  const isNominal = ops.nominal;
  const totalDocs = vector.indexedDocs + vector.pendingDocs + vector.failedDocs;
  const vecPct = totalDocs > 0 ? Math.round((vector.indexedDocs / totalDocs) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f8f9fb]">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Header — dark command bar */}
        <div className="relative overflow-hidden rounded-[20px] bg-slate-950 p-6 sm:p-7">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.08] via-transparent to-indigo-500/[0.12]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg">
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
              <Badge className="rounded-full bg-white px-3 py-1 text-slate-900 hover:bg-white">v{ops.engine}</Badge>
            </div>
          </div>
          <div className="relative mt-5 flex items-center gap-3 text-xs text-white/40">
            <span className="inline-flex items-center gap-1.5"><Activity className="size-3" /> Updated {rel(ops.generatedAt)}</span>
            <span className="size-1 rounded-full bg-white/20" />
            <span className="inline-flex items-center gap-1"><Zap className="size-3" /> Auto-refresh 60s</span>
          </div>
        </div>

        {/* Metrics — 4 bento cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border-slate-200/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow">
                  <MessageSquare className="size-5" />
                </span>
                {metrics.queriesDeltaPct !== null ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${metrics.queriesDeltaPct >= 0 ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
                    <TrendingUp className="size-3" />
                    {metrics.queriesDeltaPct >= 0 ? "+" : ""}{metrics.queriesDeltaPct}%
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">—</span>
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${metrics.activeAgents > 0 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${vector.status === "synced" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : vector.status === "empty" ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                  <span className={`size-1.5 rounded-full ${vector.status === "synced" ? "bg-emerald-500" : vector.status === "empty" ? "bg-slate-400" : "bg-amber-500"}`} />
                  {vector.status}
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Vector Store</p>
              <p className="mt-1 font-heading text-[30px] font-bold leading-none tracking-tight">{vector.embeddings.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{vector.dim}d · {vecPct}% indexed</p>
            </CardContent>
          </Card>
        </div>

        {/* Vector detail + Alerts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border-slate-200/70 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Database className="size-4" /> Pinecone Vector Sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Embeddings</p>
                  <p className="mt-1 font-heading text-xl font-bold">{vector.embeddings.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Indexed</p>
                  <p className="mt-1 font-heading text-xl font-bold text-emerald-600">{vector.indexedDocs}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Failed</p>
                  <p className={`mt-1 font-heading text-xl font-bold ${vector.failedDocs > 0 ? "text-red-600" : "text-slate-900"}`}>{vector.failedDocs}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Index health</span>
                  <span className="font-medium">{vecPct}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
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
                <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                    <CheckCircle2 className="size-4" /> All clear
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-700/80">No active alerts. System is operating within normal thresholds.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className={`rounded-xl p-3 ring-1 ${a.severity === "error" ? "bg-red-50 ring-red-200" : "bg-amber-50 ring-amber-200"}`}>
                      <div className="flex gap-2.5">
                        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${a.severity === "error" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                          <TriangleAlert className="size-3.5" />
                        </span>
                        <p className={`text-sm leading-snug ${a.severity === "error" ? "text-red-900" : "text-amber-900"}`}>{a.text}</p>
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
          <Button asChild variant="outline" className="rounded-full bg-white">
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
                      <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/60">
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
          <CheckCircle2 className="size-3.5 text-emerald-600" /> Updated {rel(ops.generatedAt)} · Operator view · Auto-refresh 60s
        </p>
      </div>
    </div>
  );
}

// ----- Tenants Panel (placeholder, no ops dependency) -----
function TenantsPanel() {
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

// ----- Agents Panel (placeholder) -----
function AgentsPanel() {
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

// ----- Docs Panel (placeholder) -----
function DocsPanel() {
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

// ----- Trends Panel (placeholder) -----
function TrendsPanel() {
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

// ----- Errors Panel (placeholder, uses event_logs data already) -----
function ErrorsPanel() {
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

// ----- Plans Panel (placeholder) -----
function PlansPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Plans</h2>
        <p className="text-slate-400 text-sm mb-6">
          Plan mix chart abhi live hai kyunki <code>subscriptions</code> table data use karta hai. MRR real values <em>blocked</em> hain jab tak Razorpay keys (Gap 1) nahi aate. Yahan free vs paid users ka count dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 0 (existing): subscriptions counts (plan, status) har user pe already available — dashboard panel me count dikh jayega.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">MRR placeholder: jab tak <code>Razorpay keys</code> set nahi honge, is section me Awaiting payment setup dikhega.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Announce Panel (placeholder) -----
function AnnouncePanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Announce</h2>
        <p className="text-slate-400 text-sm mb-6">
          System announcements abhi operators ko email karne ka infrastructure hai lekin dashboard par broadcast feature Phase 5 me add kiye jaenge. Ab currently sirf email trigger setup dikhaya jayega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 5: Admin se dashboard par system message broadcast karna (<code>POST /api/ops/announcements</code> + <code>GET /api/dashboard</code>).</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Fetch: operator_emails wale ko <code>dispatch_operator</code> se email jayega jab backend ready hoga.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main OpsPage component
// ============================================================

export default function OpsPage() {
  const { getToken, isSignedIn } = useAuth();
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [denied, setDenied] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_OVERVIEW);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const t = await getToken();
      if (!t || !alive) return;
      const status = await fetchOpsStatus(t);
      if (!alive) return;
      if (status) {
        setOps(status);
        setDenied(false);
      } else {
        setDenied(true);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getToken]);

  if (denied)
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Card className="rounded-2xl border-red-200 bg-red-50/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-red-500 text-white shadow">
                <ShieldAlert className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-lg font-semibold">Operator access only</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Tera account is ops list me nahi hai. Render dashboard me{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-black/5">OPERATOR_EMAILS</code>{" "}
                  me woh exact email daal jo tu is app me login karta hai (comma-separated),
                  phir backend redeploy hone ka wait kar aur dobara{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-black/5">/ops</code> khol.
                </p>
                {!isSignedIn ? (
                  <Button asChild size="sm" className="mt-3">
                    <Link href="/login">Login karo</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  if (ops === null)
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );

  // Render the active tab panel — simple if/else avoids "created during render"
  if (activeTab === TAB_OVERVIEW) {
    return <OverviewPanel ops={ops} />;
  }
  if (activeTab === TAB_TENANTS) {
    return <TenantsPanel />;
  }
  if (activeTab === TAB_AGENTS) {
    return <AgentsPanel />;
  }
  if (activeTab === TAB_DOCS) {
    return <DocsPanel />;
  }
  if (activeTab === TAB_TRENDS) {
    return <TrendsPanel />;
  }
  if (activeTab === TAB_ERRORS) {
    return <ErrorsPanel />;
  }
  if (activeTab === TAB_PLANS) {
    return <PlansPanel />;
  }
  if (activeTab === TAB_ANNOUNCE) {
    return <AnnouncePanel />;
  }

  // Fallback to overview
  return <OverviewPanel ops={ops} />;
}