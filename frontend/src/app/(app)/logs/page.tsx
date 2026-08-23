"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleCheckBig,
  Copy,
  Filter,
  MessageSquare,
  MoreVertical,
  Search,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getConversations,
  type ChatMessage,
  type Conversation,
  type ConversationStatus,
} from "@/lib/api";

const STATUS: Record<
  ConversationStatus,
  { label: string; dot: string; badge: string }
> = {
  resolved: {
    label: "Resolved",
    dot: "bg-success",
    badge: "bg-success/10 text-success border-transparent",
  },
  active: {
    label: "Active",
    dot: "bg-primary animate-pulse",
    badge: "bg-primary/10 text-primary border-transparent",
  },
  halted: {
    label: "Halted",
    dot: "bg-destructive",
    badge: "bg-destructive/10 text-destructive border-transparent",
  },
};

function renderRich(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em]"
        >
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
        <span className="font-mono text-xs text-zinc-400">{lang}</span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
          onClick={() => {
            navigator.clipboard.writeText(content);
            toast.success("Copied to clipboard");
          }}
        >
          <Copy className="size-3" /> copy
        </button>
      </div>
      <pre className="overflow-x-auto bg-black p-3 font-mono text-xs leading-relaxed text-zinc-100">
        {content}
      </pre>
    </div>
  );
}

function Bubble({ m, userLabel }: { m: ChatMessage; userLabel: string }) {
  const isUser = m.role === "user";
  return (
    <div
      className={cn("flex items-start gap-2.5", !isUser && "flex-row-reverse")}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          isUser ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? userLabel : "AI"}
      </span>
      <div className={cn("max-w-[85%]", !isUser && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            isUser
              ? "bg-muted"
              : "bg-primary/10 text-card-foreground border border-primary/20"
          )}
        >
          {renderRich(m.text)}
          {m.code ? <CodeBlock {...m.code} /> : null}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {m.time}
          {m.latencyNote ? ` (${m.latencyNote})` : ""}
        </p>
      </div>
    </div>
  );
}

export default function LogsPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getConversations().then((c) => {
      setConversations(c);
      setSelectedId((prev) => prev ?? c[0]?.id ?? null);
    });
  }, []);

  const filtered = useMemo(
    () =>
      conversations?.filter(
        (c) =>
          c.user.toLowerCase().includes(query.toLowerCase()) ||
          c.preview.toLowerCase().includes(query.toLowerCase())
      ) ?? [],
    [conversations, query]
  );

  const selected =
    conversations?.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Logs</h1>
        <Button variant="ghost" size="icon" className="rounded-full bg-muted">
          AC
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="flex h-[55vh] min-h-72 flex-col overflow-hidden lg:h-[calc(100vh-11rem)] lg:min-h-96">
          <CardContent className="flex gap-2 border-b p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions…"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" aria-label="Filter">
              <Filter className="size-4" />
            </Button>
          </CardContent>
          <ScrollArea className="flex-1">
            {!conversations ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              filtered.map((c) => {
                const activeSel = c.id === selected?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "block w-full border-b p-3 text-left transition-colors hover:bg-muted/60",
                      activeSel && "bg-accent/70 hover:bg-accent/70"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold">
                        {c.user}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.time}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("mt-1.5", STATUS[c.status].badge)}
                    >
                      <span
                        className={cn("mr-1 size-1.5 rounded-full", STATUS[c.status].dot)}
                      />
                      {STATUS[c.status].label}
                    </Badge>
                    <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                      “{c.preview}”
                    </p>
                    <p className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" /> {c.messageCount}{" "}
                        Messages
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {c.duration}
                      </span>
                    </p>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </Card>

        <Card className="flex h-[70vh] min-h-96 flex-col overflow-hidden lg:h-[calc(100vh-11rem)]">
          {!selected ? (
            <CardContent className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Select a session to view the transcript.
            </CardContent>
          ) : (
            <>
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <p className="font-mono text-sm font-bold">{selected.user}</p>
                  <p className="text-xs text-muted-foreground">
                    Session Started at {selected.startedAt} ·{" "}
                    {selected.duration} duration
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(selected.user);
                        toast.success("Session ID copied");
                      }}
                    >
                      Copy session ID
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => toast.info("Export is mocked in this demo")}
                    >
                      Export transcript
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-5">
                  {selected.messages.map((m) => (
                    <Bubble key={m.id} m={{ ...m }} userLabel={selected.user.slice(0, 2)} />
                  ))}
                </div>
              </ScrollArea>

              {selected.status === "resolved" ? (
                <div className="flex items-center gap-2 border-t bg-success/5 px-4 py-3 text-sm font-medium text-success">
                  <CircleCheckBig className="size-4" /> Session Resolved
                </div>
              ) : selected.status === "halted" ? (
                <div className="border-t bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                  Session halted — API rate limit exceeded
                </div>
              ) : (
                <div className="border-t bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
                  Session in progress…
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
