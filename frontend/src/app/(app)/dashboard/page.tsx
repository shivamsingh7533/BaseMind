"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Bot,
  CloudSync,
  TriangleAlert,
  FileUp,
  Wallet,
  CirclePlus,
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
import { getDashboard, type DashboardData } from "@/lib/api";

const ICONS = {
  agent: Bot,
  sync: CloudSync,
  warning: TriangleAlert,
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    getDashboard().then(setData);
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Dashboard
        </h1>
        <Button variant="ghost" size="icon" className="rounded-full bg-muted">
          <Bot className="size-5" />
        </Button>
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
            {data.stats.map((s) => (
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
            ))}
          </div>

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
                {data.activity.map((a, i) => {
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
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
