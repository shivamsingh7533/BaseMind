"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Flame,
  Lightbulb,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteKnowledgeGap,
  getAgents,
  getAnalyticsOverview,
  getKnowledgeGaps,
  updateKnowledgeGap,
  type Agent,
  type AnalyticsOverview,
  type KnowledgeGap,
} from "@/lib/api";

const STATUS_TABS = [
  { id: "all", label: "All Gaps" },
  { id: "unresolved", label: "Unresolved" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
] as const;

export default function AnalyticsPage() {
  const { getToken } = useAuth();

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [timeRangeDays, setTimeRangeDays] = useState<number>(14);
  const [statusFilter, setStatusFilter] = useState<string>("unresolved");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingGapId, setUpdatingGapId] = useState<string | null>(null);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const token = await getToken();
        const [ovData, gapsData, agentsData] = await Promise.all([
          getAnalyticsOverview(token, timeRangeDays),
          getKnowledgeGaps(token, {
            status: statusFilter === "all" ? undefined : statusFilter,
            agent_id: agentFilter === "all" ? undefined : agentFilter,
            q: searchQuery.trim() || undefined,
            limit: 50,
          }),
          getAgents(token),
        ]);

        setOverview(ovData);
        setGaps(gapsData?.gaps ?? []);
        setAgents(agentsData ?? []);
      } catch {
        toast.error("Failed to load analytics data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getToken, timeRangeDays, statusFilter, agentFilter, searchQuery]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleUpdateStatus = async (
    gapId: string,
    newStatus: "unresolved" | "resolved" | "dismissed",
    note?: string
  ) => {
    setUpdatingGapId(gapId);
    try {
      const token = await getToken();
      await updateKnowledgeGap(token, gapId, {
        status: newStatus,
        resolution_note: note,
      });
      toast.success(
        newStatus === "resolved"
          ? "Gap marked as resolved!"
          : newStatus === "dismissed"
          ? "Gap dismissed"
          : "Gap reopened"
      );
      void loadData(true);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingGapId(null);
    }
  };

  const handleDeleteGap = async (gapId: string) => {
    try {
      const token = await getToken();
      const ok = await deleteKnowledgeGap(token, gapId);
      if (ok) {
        toast.success("Knowledge gap deleted");
        setGaps((prev) => prev.filter((g) => g.id !== gapId));
      } else {
        toast.error("Failed to delete knowledge gap");
      }
    } catch {
      toast.error("Failed to delete knowledge gap");
    }
  };

  const csatPercentage = overview ? overview.csatScore : 0;
  const csatBadgeColor =
    csatPercentage >= 80
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : csatPercentage >= 60
      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
      : "bg-rose-500/15 text-rose-500 border-rose-500/30";

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Conversation Analytics
            </h1>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-1 size-3" /> 2.0
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track user CSAT satisfaction, evaluate agent performance, and detect knowledge gaps automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTimeRangeDays(days)}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  timeRangeDays === days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CSAT SCORE */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card to-card/60 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              CSAT Score
            </CardTitle>
            <ThumbsUp className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{csatPercentage}%</span>
                  <Badge variant="outline" className={`text-[10px] ${csatBadgeColor}`}>
                    {csatPercentage >= 80 ? "Excellent" : csatPercentage >= 60 ? "Good" : "Needs Work"}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Based on {overview?.totalRatings ?? 0} rated responses ({overview?.positiveRatings ?? 0} thumbs up)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* RESOLUTION RATE */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card to-card/60 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Resolution Rate
            </CardTitle>
            <CheckCircle2 className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">
                    {overview?.resolutionRate ?? 0}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {overview?.resolvedConversations ?? 0} of {overview?.totalConversations ?? 0}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Conversations marked resolved or with positive feedback
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* UNRESOLVED GAPS */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card to-card/60 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Knowledge Blindspots
            </CardTitle>
            <AlertTriangle className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">
                    {overview?.unresolvedGapsCount ?? 0}
                  </span>
                  {(overview?.unresolvedGapsCount ?? 0) > 0 && (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px]">
                      Action Required
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Queries missing documentation or rated negatively
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* TOTAL RATINGS BREAKDOWN */}
        <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-card to-card/60 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Feedback Volume
            </CardTitle>
            <MessageSquare className="size-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <Skeleton className="h-9 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">
                    {overview?.totalRatings ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground">messages rated</span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                    <ThumbsUp className="size-3" /> {overview?.positiveRatings ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-500 font-medium">
                    <ThumbsDown className="size-3" /> {overview?.negativeRatings ?? 0}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CHARTS & LEADERBOARD SECTION */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 14-DAY CSAT TREND */}
        <Card className="lg:col-span-2 border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base font-semibold">Satisfaction & Feedback Trends</CardTitle>
              <CardDescription className="text-xs">
                Daily message ratings and satisfaction percentages over the last {timeRangeDays} days
              </CardDescription>
            </div>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <div className="h-44 w-full flex items-center justify-center">
                <Skeleton className="h-36 w-full" />
              </div>
            ) : !overview?.trend14d || overview.trend14d.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <MessageSquare className="mb-2 size-6 opacity-40" />
                <span>No feedback data recorded yet for this timeframe.</span>
                <span className="mt-1 text-[11px] opacity-75">
                  Try asking questions in Chat or using the public widget to generate ratings!
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex h-40 items-end gap-2 pt-4">
                  {overview.trend14d.map((day) => {
                    const total = day.ratingCount;
                    const posPct = total > 0 ? Math.round((day.positiveCount / total) * 100) : 0;
                    const barHeight = Math.max(12, Math.min(100, (total / 10) * 100));

                    return (
                      <div
                        key={day.date}
                        className="group relative flex flex-1 flex-col items-center gap-1.5 h-full justify-end"
                      >
                        {/* TOOLTIP */}
                        <div className="pointer-events-none absolute -top-12 z-20 hidden rounded-md border bg-popover px-2 py-1 text-[11px] shadow-md group-hover:block whitespace-nowrap">
                          <p className="font-semibold">{day.date}</p>
                          <p className="text-muted-foreground">
                            {day.positiveCount} 👍 · {day.negativeCount} 👎 ({day.csatScore}% CSAT)
                          </p>
                        </div>

                        <div className="w-full max-w-7 rounded-t-md bg-muted/60 overflow-hidden flex flex-col justify-end" style={{ height: `${barHeight}%` }}>
                          <div
                            className="bg-emerald-500 transition-all duration-300"
                            style={{ height: `${posPct}%` }}
                            title={`${posPct}% positive`}
                          />
                          <div
                            className="bg-rose-500 transition-all duration-300"
                            style={{ height: `${100 - posPct}%` }}
                            title={`${100 - posPct}% negative`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono truncate w-full text-center">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center gap-6 border-t pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded bg-emerald-500" />
                    <span>Positive feedback</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded bg-rose-500" />
                    <span>Negative feedback</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AGENT LEADERBOARD */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Agent Leaderboard</CardTitle>
            <CardDescription className="text-xs">
              CSAT performance and open gaps by agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !overview?.perAgent || overview.perAgent.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <Bot className="mb-2 size-6 opacity-40" />
                <span>No agents deployed yet.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.perAgent.map((agent) => (
                  <div
                    key={agent.agentId}
                    className="flex items-center justify-between rounded-lg border bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: agent.agentColor || "#6366f1" }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{agent.agentName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {agent.totalRatings} ratings · {agent.gapsCount} gaps
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono">
                        {agent.csatScore > 0 ? `${agent.csatScore}%` : "—"}
                      </span>
                      <p className="text-[10px] text-muted-foreground">CSAT</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KNOWLEDGE GAP EXPLORER */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Knowledge Gap Explorer</CardTitle>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
                  {gaps.length} detected
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Unanswered user queries and negative feedback. Add answers to your knowledge base to resolve them.
              </CardDescription>
            </div>

            <Link href="/knowledge-base">
              <Button size="sm" className="gap-1.5 text-xs">
                <PlusCircle className="size-3.5" />
                <span>Add Knowledge</span>
              </Button>
            </Link>
          </div>

          {/* FILTER CONTROLS */}
          <div className="mt-4 flex flex-col gap-2.5 pt-2 sm:flex-row sm:items-center">
            {/* SEARCH */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search gap queries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* STATUS TABS */}
            <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                    statusFilter === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* AGENT SELECTOR */}
            {agents.length > 0 && (
              <select
                aria-label="Filter by agent"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : gaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Lightbulb className="mb-2 size-8 text-amber-500/60" />
              <p className="text-sm font-medium">No knowledge gaps found</p>
              <p className="mt-1 text-xs">
                {statusFilter === "unresolved"
                  ? "All captured queries are resolved! Your agents are well-grounded."
                  : "No queries match your current filter criteria."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {gaps.map((gap) => {
                const isBusy = updatingGapId === gap.id;

                return (
                  <div
                    key={gap.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground break-words">
                          &quot;{gap.query}&quot;
                        </span>

                        <Badge
                          variant="secondary"
                          className="text-[10px] font-mono font-medium gap-1 py-0"
                        >
                          <Flame className="size-2.5 text-orange-500" />
                          Asked {gap.frequency}x
                        </Badge>

                        {gap.agentName && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{ borderColor: `${gap.agentColor || "#6366f1"}40` }}
                          >
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: gap.agentColor || "#6366f1" }}
                            />
                            {gap.agentName}
                          </span>
                        )}

                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            gap.status === "resolved"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                              : gap.status === "dismissed"
                              ? "border-muted bg-muted text-muted-foreground"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                          }`}
                        >
                          {gap.status}
                        </Badge>
                      </div>

                      {gap.aiResponseSnippet && (
                        <p className="text-xs text-muted-foreground line-clamp-2 italic">
                          Model said: &quot;{gap.aiResponseSnippet}&quot;
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          Last asked {new Date(gap.lastAskedAt).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span className="capitalize">Reason: {gap.reason.replace(/_/g, " ")}</span>
                        {gap.resolutionNote && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-500">Note: {gap.resolutionNote}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {gap.status === "unresolved" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleUpdateStatus(gap.id, "resolved", "Resolved via documentation")}
                            className="h-7 gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 text-xs px-2"
                            title="Mark resolved"
                          >
                            <CheckCircle2 className="size-3" />
                            <span>Resolve</span>
                          </Button>

                          <Link href={`/knowledge-base?query=${encodeURIComponent(gap.query)}`}>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 gap-1 text-xs px-2"
                              title="Add to knowledge base"
                            >
                              <PlusCircle className="size-3" />
                              <span>Add Doc</span>
                            </Button>
                          </Link>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleUpdateStatus(gap.id, "dismissed")}
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                            title="Dismiss"
                          >
                            Dismiss
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void handleUpdateStatus(gap.id, "unresolved")}
                          className="h-7 text-xs px-2 text-muted-foreground"
                        >
                          Reopen
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDeleteGap(gap.id)}
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title="Delete gap entry"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
