"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  ArrowUp,
  Bot,
  CloudSync,
  TriangleAlert,
  FileUp,
  Wallet,
  CirclePlus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAppData } from "@/lib/store";

const ICONS = {
  agent: Bot,
  sync: CloudSync,
  warning: TriangleAlert,
};

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-heading text-sm font-semibold leading-tight">
        {value}
      </p>
    </div>
  );
}

function shortDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
  });
}

export default function DashboardPage() {
  const { getToken } = useAuth();
  const data = useAppData((s) => s.dashboard);
  const agents = useAppData((s) => s.agents);
  const documents = useAppData((s) => s.documents);
  const fetchDashboard = useAppData((s) => s.fetchDashboard);
  const fetchAgents = useAppData((s) => s.fetchAgents);
  const fetchDocuments = useAppData((s) => s.fetchDocuments);

  useEffect(() => {
    getToken()
      .then((t) => {
        if (!t) return;
        void fetchDashboard(t);
        void fetchAgents(t);
        void fetchDocuments(t);
      })
      .catch(() => {});
  }, [getToken, fetchDashboard, fetchAgents, fetchDocuments]);

  const hasAgents = agents !== null && agents.length > 0;
  const hasDocs = documents !== null && documents.length > 0;
  const showOnboarding = agents !== null && !hasAgents;
  const onboardingDone = (hasAgents ? 1 : 0) + (hasDocs ? 1 : 0);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {data.stats.length === 0 ? (
              <Card className="sm:col-span-3">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  No metrics yet — connect your first agent to see stats here.
                </CardContent>
              </Card>
            ) : (
              data.stats.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-1 font-heading text-3xl font-bold tracking-tight">
                    {s.value}
                  </p>
                  {s.delta ? (
                    <Badge
                      variant="secondary"
                      className="mt-3 gap-1 text-success"
                    >
                      <ArrowUp className="size-3" /> {s.delta}
                    </Badge>
                  ) : null}
                  {typeof s.progress === "number" ? (
                    <div className="mt-3 space-y-1.5">
                      <Progress value={s.progress} />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="size-3.5" /> {s.sub}
                      </p>
                    </div>
                  ) : s.sub ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-success" />
                      </span>
                      {s.sub}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))
            )}
          </div>

          {showOnboarding ? (
            <Card className="mt-6 border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-primary">
                  <Bot className="size-5" />
                  Get started with BaseMind
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <div className="flex items-start gap-3 py-2">
                    {hasAgents ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    ) : (
                      <CirclePlus className="mt-0.5 size-5 shrink-0 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">
                        {hasAgents ? "Agent created" : "Create your first agent"}
                      </p>
                      <p className="text-muted-foreground">
                        Open{" "}
                        <Link href="/agents" className="text-primary hover:underline">
                          Agent Studio
                        </Link>{" "}
                        to give it a name, color, and instructions.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3 py-2">
                    {hasDocs ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    ) : (
                      <FileUp className="mt-0.5 size-5 shrink-0 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">
                        {hasDocs
                          ? "Knowledge added"
                          : "Add knowledge your agent can answer from"}
                      </p>
                      <p className="text-muted-foreground">
                        Upload a file or sync a URL in{" "}
                        <Link
                          href="/knowledge-base"
                          className="text-primary hover:underline"
                        >
                          Knowledge Base
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                  {hasAgents && hasDocs ? (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between gap-3 py-2">
                        <p className="font-medium">Try a conversation</p>
                        <Button asChild size="sm">
                          <Link href="/chat">Open Chat</Link>
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="mt-4 space-y-1.5">
                  <Progress value={(onboardingDone / 2) * 100} />
                  <p className="text-xs text-muted-foreground">
                    {onboardingDone} of 2 setup steps done
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3">
                  <Link href="/agents">
                    <CirclePlus className="size-5 text-primary" />
                    New Agent
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3">
                  <Link href="/knowledge-base">
                    <FileUp className="size-5 text-primary" />
                    Upload Knowledge
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
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
                {data.activity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No activity yet — actions will appear here as they happen.
                  </p>
                ) : (
                  data.activity.map((a, i) => {
                  const Icon = ICONS[a.icon];
                  return (
                    <div key={a.id}>
                      {i > 0 ? <Separator className="my-1" /> : null}
                      <div className="flex items-start gap-3 py-2">
                        <span
                          className={
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full " +
                            (a.icon === "warning"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-accent text-accent-foreground")
                          }
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">
                            <span className="font-semibold">{a.highlight}</span>{" "}
                            {a.text}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {a.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">
                  Agent Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.perAgent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No agents deployed yet — create one to see per-agent stats.
                  </p>
                ) : (
                  <div>
                    <div className="flex items-center gap-5 pb-2 text-[11px] font-medium text-muted-foreground">
                      <span className="min-w-32 flex-1">Agent</span>
                      <MiniStat label="Convs" value="—" />
                      <MiniStat label="Msgs" value="—" />
                      <MiniStat label="Resolved" value="—" />
                      <MiniStat label="Q/24h" value="—" />
                      <MiniStat label="Avg" value="—" />
                    </div>
                    {data.perAgent.map((a, i) => (
                      <div key={a.id}>
                        {i > 0 ? <Separator className="my-1" /> : null}
                        <div className="flex items-center gap-5 py-2">
                          <span className="flex min-w-32 flex-1 items-center gap-2.5">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: a.color }}
                            />
                            <span className="truncate text-sm font-semibold">
                              {a.name}
                            </span>
                          </span>
                          <MiniStat
                            label="Convs"
                            value={String(a.conversations)}
                          />
                          <MiniStat label="Msgs" value={String(a.agentMsgs)} />
                          <MiniStat label="Resolved" value={String(a.resolved)} />
                          <MiniStat
                            label="Q/24h"
                            value={a.queries24h.toLocaleString()}
                          />
                          <MiniStat
                            label="Avg"
                            value={`${a.avgLatencyMs}ms`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-heading">
                  Conversation Trend — 7 Days
                </CardTitle>
                <Link
                  href="/logs"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View All
                </Link>
              </CardHeader>
              <CardContent>
                {(() => {
                  const totals = data.trend7d.map(
                    (t) => t.conversations + t.agentMsgs
                  );
                  const peak = Math.max(1, ...totals);
                  const total = totals.reduce((s, n) => s + n, 0);
                  if (total === 0)
                    return (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No conversations in the last 7 days.
                      </p>
                    );
                  return (
                    <div>
                      <div className="flex items-end gap-2">
                        {data.trend7d.map((t, i) => {
                          const sum = t.conversations + t.agentMsgs;
                          return (
                            <div
                              key={t.date}
                              className="flex flex-1 flex-col items-center"
                            >
                              <span className="mb-1 text-[11px] font-medium text-muted-foreground">
                                {sum}
                              </span>
                              <div className="flex h-32 w-full items-end gap-0.5">
                                {sum === 0 ? (
                                  <div className="h-1 w-full rounded bg-muted" />
                                ) : (
                                  <div className="flex h-full w-full flex-col justify-end gap-0.5">
                                    <div
                                      className="w-full rounded-t bg-chart-3/70"
                                      style={{
                                        height: `${(t.agentMsgs / peak) * 100}%`,
                                      }}
                                    />
                                    <div
                                      className="w-full rounded-b bg-primary"
                                      style={{
                                        height: `${(t.conversations / peak) * 100}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                              <span
                                className={`mt-1.5 text-[11px] ${
                                  i === data.trend7d.length - 1
                                    ? "font-semibold text-foreground"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {shortDay(t.date)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2.5 rounded-sm bg-primary" />
                          Conversations
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2.5 rounded-sm bg-chart-3/70" />
                          Agent messages
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
