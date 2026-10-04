"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  AlertTriangle,
  Bot,
  FileText,
  Gauge,
  HardDrive,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getUsageMetrics } from "@/lib/api/billing";
import type { UsageMetrics } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface UsageMeteringCardProps {
  onUpgradeClick?: () => void;
}

export function UsageMeteringCard({ onUpgradeClick }: UsageMeteringCardProps) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    getToken().then((token) => {
      void getUsageMetrics(token).then((data) => {
        if (!cancelled) {
          setMetrics(data);
          setLoading(false);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  const items = [
    {
      label: "AI Agents",
      icon: Bot,
      current: metrics.current.agents,
      limit: metrics.limits.agents,
      pct: metrics.percentages.agents,
      unit: "agents",
    },
    {
      label: "Knowledge Documents",
      icon: FileText,
      current: metrics.current.documents,
      limit: metrics.limits.documents,
      pct: metrics.percentages.documents,
      unit: "docs",
    },
    {
      label: "Monthly Messages",
      icon: MessageSquare,
      current: metrics.current.messagesMonthly,
      limit: metrics.limits.messagesMonthly,
      pct: metrics.percentages.messagesMonthly,
      unit: "msgs",
    },
    {
      label: "Team Workspaces Seats",
      icon: Users,
      current: metrics.current.teamSeats,
      limit: metrics.limits.teamSeats,
      pct: metrics.percentages.teamSeats,
      unit: "seats",
    },
    {
      label: "Vector & File Storage",
      icon: HardDrive,
      current: metrics.current.storageMb,
      limit: metrics.limits.storageMb,
      pct: metrics.percentages.storageMb,
      unit: "MB",
    },
  ];

  const planBadgeClass =
    metrics.plan === "enterprise"
      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
      : metrics.plan === "pro"
      ? "bg-primary/10 text-primary border-primary/20"
      : "bg-muted text-muted-foreground";

  return (
    <Card className="border border-border/60 bg-gradient-to-br from-card via-card to-muted/20">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="font-heading flex items-center gap-2">
              <Gauge className="size-5 text-primary" />
              Live Resource Usage & Quotas
            </CardTitle>
            <CardDescription>
              Track your real-time consumption across AI agents, knowledge base docs, and team collaboration.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="outline" className={cn("capitalize px-3 py-1 font-semibold", planBadgeClass)}>
              <Sparkles className="size-3 mr-1 inline" />
              {metrics.plan} Tier
            </Badge>
            {metrics.plan === "free" && onUpgradeClick && (
              <Button size="sm" onClick={onUpgradeClick} className="gap-1.5 shadow-sm">
                Upgrade Plan
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {metrics.isNearQuota && (
          <div className="flex items-start gap-3 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400 text-sm">
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Approaching plan limits</p>
              <p className="text-xs text-amber-500/90 dark:text-amber-400/90 mt-0.5">
                You have used 80% or more of your allocated quotas. Consider upgrading your tier to prevent service interruptions.
              </p>
            </div>
            {onUpgradeClick && (
              <Button size="sm" variant="outline" onClick={onUpgradeClick} className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/20">
                Upgrade
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isHigh = item.pct >= 85;
            const isFull = item.pct >= 100;

            const progressColor = isFull
              ? "bg-rose-500"
              : isHigh
              ? "bg-amber-500"
              : "bg-primary";

            return (
              <div
                key={item.label}
                className="p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background/80 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                    <Icon className="size-4 text-muted-foreground" />
                    {item.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {item.pct}%
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Progress value={item.pct} className={cn("h-2", progressColor)} />
                  <div className="flex justify-between items-center text-xs text-muted-foreground tabular-nums">
                    <span>
                      {item.current.toLocaleString()} {item.unit}
                    </span>
                    <span>
                      {item.limit.toLocaleString()} {item.unit} max
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
