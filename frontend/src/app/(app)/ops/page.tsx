"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  CheckCircle2,
  CirclePlus,
  Database,
  FileText,
  FileUp,
  Mail,
  MessageSquare,
  TrendingUp,
  TriangleAlert,
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

const SEV_BG: Record<OpsSeverity, string> = {
  info: "bg-accent text-accent-foreground",
  attention: "bg-amber-500/10 text-amber-600",
  error: "bg-destructive/10 text-destructive",
};

function ActivityIcon({
  kind,
  severity,
}: {
  kind: OpsStatus["activity"][number]["kind"];
  severity: OpsSeverity;
}) {
  if (severity === "error" || severity === "attention")
    return <TriangleAlert className="size-4" />;
  if (kind === "agent") return <Bot className="size-4" />;
  if (kind === "document") return <FileText className="size-4" />;
  if (kind === "conversation") return <MessageSquare className="size-4" />;
  return <Mail className="size-4" />;
}

function VectorBadge({ status }: { status: OpsStatus["vector"]["status"] }) {
  const map = {
    synced: { label: "Synced", cls: "bg-success/10 text-success", dot: "bg-success" },
    syncing: { label: "Syncing", cls: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
    attention: { label: "Attention", cls: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
    empty: { label: "Empty", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  } as const;
  const meta = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${meta.cls}`}
    >
      <span className={`size-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export default function OpsPage() {
  const { getToken } = useAuth();
  const [ops, setOps] = useState<OpsStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const t = await getToken();
      if (!t || !alive) return;
      const status = await fetchOpsStatus(t);
      if (status) setOps(status);
    };
    void poll();
    const id = setInterval(() => void poll(), 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getToken]);

  if (ops === null)
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
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

  const { metrics, vector, alerts } = ops;
  const hasError = alerts.some((a) => a.severity === "error");
  const pulse = ops.nominal
    ? { cls: "bg-success", label: "All Systems Nominal" }
    : hasError
      ? { cls: "bg-destructive", label: "Issues Detected — Errors Active" }
      : { cls: "bg-amber-500", label: "Attention Required" };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulse.cls}`}
            />
            <span
              className={`relative inline-flex size-2.5 rounded-full ${pulse.cls}`}
            />
          </span>
          <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            {pulse.label}
          </span>
        </div>
        <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
          RAG Engine v{ops.engine}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-5" />
              </span>
              {metrics.queriesDeltaPct !== null &&
              metrics.queriesDeltaPct !== undefined ? (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    metrics.queriesDeltaPct >= 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <TrendingUp className="size-3.5" />
                  {metrics.queriesDeltaPct >= 0 ? "+" : ""}
                  {metrics.queriesDeltaPct}%
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">Total Queries</p>
            <p className="font-heading text-3xl font-bold tracking-tight">
              {metrics.totalQueries.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </span>
              {metrics.activeAgents > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Live
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Paused
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Active Agents</p>
            <p className="font-heading text-3xl font-bold tracking-tight">
              {metrics.activeAgents}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3">
        <CardContent className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <Database className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Pinecone Vector Sync</p>
              <p className="text-xs text-muted-foreground">
                {vector.embeddings.toLocaleString()} embeddings active
              </p>
            </div>
          </div>
          <VectorBadge status={vector.status} />
        </CardContent>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Button asChild className="h-auto justify-start gap-3 py-4">
          <Link href="/agents">
            <CirclePlus className="size-5" /> New Agent
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 py-4">
          <Link href="/knowledge-base">
            <FileUp className="size-5 text-primary" /> Upload Data
          </Link>
        </Button>
      </div>

      {alerts.length > 0 ? (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <TriangleAlert className="size-4 text-amber-600" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-lg bg-muted/40 p-3"
              >
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                    a.severity === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <TriangleAlert className="size-4" />
                </span>
                <p className="text-sm leading-snug text-foreground">{a.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-3">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-heading">Recent Activity</CardTitle>
          <Link
            href="/logs"
            className="text-sm font-medium text-primary hover:underline"
          >
            View All
          </Link>
        </CardHeader>
        <CardContent className="space-y-1">
          {ops.activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No system activity yet — events will appear here as they happen.
            </p>
          ) : (
            ops.activity.map((a, i) => (
              <div key={a.id}>
                {i > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-start gap-3 py-2">
                  <span
                    className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${SEV_BG[a.severity]}`}
                  >
                    <ActivityIcon kind={a.kind} severity={a.severity} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{a.highlight}</span>{" "}
                      {a.text}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {rel(a.at)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-success" />
        Updated {rel(ops.generatedAt)} · Operator view
      </p>
    </div>
  );
}