"use client";

import { useMemo, useState } from "react";
import { Headphones, MessageSquare, Sparkles, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/api";
import { STATUS } from "../utils";

type FilterTab = "all" | "needs_human" | "in_takeover" | "active" | "resolved";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
}: {
  conversations: Conversation[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const counts = useMemo(() => {
    if (!conversations) return { all: 0, needs_human: 0, in_takeover: 0, active: 0, resolved: 0 };
    return {
      all: conversations.length,
      needs_human: conversations.filter((c) => c.status === "needs_human").length,
      in_takeover: conversations.filter((c) => c.status === "in_takeover").length,
      active: conversations.filter((c) => c.status === "active").length,
      resolved: conversations.filter((c) => c.status === "resolved").length,
    };
  }, [conversations]);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    if (filter === "all") return conversations;
    return conversations.filter((c) => c.status === filter);
  }, [conversations, filter]);

  return (
    <Card className="flex h-[55dvh] min-h-72 flex-col overflow-hidden lg:h-[calc(100dvh-12rem)] lg:min-h-96">
      <CardHeader className="border-b p-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span>All</span>
            <span className="text-[10px] opacity-75">({counts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("needs_human")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "needs_human"
                ? "bg-amber-600 text-white font-semibold"
                : counts.needs_human > 0
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Headphones className="size-3" />
            <span>Escalated</span>
            {counts.needs_human > 0 && (
              <span className="rounded-full bg-amber-500 px-1 text-[10px] text-white">
                {counts.needs_human}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("in_takeover")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "in_takeover"
                ? "bg-indigo-600 text-white font-semibold"
                : counts.in_takeover > 0
                  ? "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <UserCheck className="size-3" />
            <span>Takeover</span>
            {counts.in_takeover > 0 && (
              <span className="rounded-full bg-indigo-500 px-1 text-[10px] text-white">
                {counts.in_takeover}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              filter === "active"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Sparkles className="size-3" />
            <span>AI</span>
            <span className="text-[10px] opacity-75">({counts.active})</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2">
        {!conversations ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {filter === "all"
              ? "No chats yet — start your first one above."
              : `No conversations matching "${filter.replace("_", " ")}".`}
          </p>
        ) : (
          filtered.map((c) => {
            const activeSel = c.id === selectedId;
            const statusConfig = STATUS[c.status] ?? STATUS.active;
            return (
              <div
                key={c.id}
                className={cn(
                  "group relative rounded-lg border-b border-border/60 transition-colors",
                  activeSel && "bg-accent/70",
                  c.status === "needs_human" && "border-l-4 border-l-amber-500"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="block w-full rounded-lg p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.user}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.time}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", statusConfig.badge)}
                    >
                      <span
                        className={cn(
                          "mr-1 size-1.5 rounded-full",
                          statusConfig.dot
                        )}
                      />
                      {statusConfig.label}
                    </Badge>
                    {c.assignedTo && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        👤 {c.assignedTo}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                    {c.preview || "New chat"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="size-3" /> {c.messageCount}{" "}
                    Messages
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete conversation"
                  aria-label={`Delete ${c.user}`}
                  onClick={() => onDelete(c.id, c.user)}
                  className="absolute right-2 top-2 size-6 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 md:group-hover:opacity-100 touch:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}