"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Bot,
  CirclePlus,
  Headset,
  Rocket,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  createConversation,
  streamChat,
  type AgentStatus,
} from "@/lib/api";
import { useAppData } from "@/lib/store";

const STATUS: Record<AgentStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success border-transparent",
  },
  training: {
    label: "Training",
    className: "bg-chart-4/15 text-chart-4 border-transparent",
  },
  paused: {
    label: "Paused",
    className: "bg-muted text-muted-foreground border-transparent",
  },
};

export default function AgentsPage() {
  const { getToken } = useAuth();
  const agents = useAppData((s) => s.agents);
  const fetchAgents = useAppData((s) => s.fetchAgents);
  const [domains, setDomains] = useState<string[]>(["*.acmecorp.com"]);
  const [domainDraft, setDomainDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "agent"; text: string }[]
  >([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatting, setChatting] = useState(false);
  const [studioConvId, setStudioConvId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getToken()
      .then((t) => fetchAgents(t))
      .catch(() => {});
  }, [getToken, fetchAgents]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
    });
  }, [chatMessages, chatting]);

  const sendChat = async () => {
    const text = chatDraft.trim();
    if (!text || chatting) return;
    setChatDraft("");
    setChatMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "agent", text: "" },
    ]);
    setChatting(true);
    try {
      let convId = studioConvId;
      if (!convId) {
        convId = await createConversation(await getToken());
        if (convId) setStudioConvId(convId);
      }
      if (!convId) throw new Error("no-conversation");
      await streamChat(await getToken(), convId, text, (event) => {
        if (event.type === "token") {
          setChatMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "agent") {
              copy[copy.length - 1] = { ...last, text: last.text + event.token };
            }
            return copy;
          });
        } else if (event.type === "error") {
          toast.error(event.error);
          setChatMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "agent" && !last.text) copy.pop();
            return copy;
          });
        }
      });
    } catch {
      toast.error("Could not reach the agent");
      setChatMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "agent" && !last.text) copy.pop();
        return copy;
      });
    } finally {
      setChatting(false);
    }
  };

  const live = agents?.filter((a) => a.status === "active").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          Agents
          <Badge variant="outline" className="gap-1.5 border-success/40 text-success">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live
          </Badge>
          <span className="text-base font-medium text-muted-foreground">
            {live} Active
          </span>
        </h1>
        <Button onClick={() => toast.info("Opens Agent Studio below")}>
          <CirclePlus className="size-4" /> New Agent
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Deployed Bots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {!agents ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : agents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No agents yet — click{" "}
              <span className="font-medium text-foreground">New Agent</span> to
              deploy your first support bot.
            </p>
          ) : (
            agents.map((a, i) => (
              <div key={a.id}>
                {i > 0 ? <Separator className="my-1" /> : null}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Headset className="size-5" />
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.url}
                    </p>
                  </div>
                  <Badge variant="outline" className={STATUS[a.status].className}>
                    {STATUS[a.status].label}
                  </Badge>
                  {a.status === "training" ? (
                    <div className="min-w-44 flex-1">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Training ({a.trainProgress}%)
                      </p>
                      <Progress value={a.trainProgress ?? 0} />
                    </div>
                  ) : (
                    <div className="flex gap-8">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Queries/24h
                        </p>
                        <p className="font-heading text-lg font-semibold">
                          {a.queries24h.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Avg. Latency
                        </p>
                        <p className="font-heading text-lg font-semibold">
                          {a.avgLatencyMs}ms
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-heading">Agent Studio</CardTitle>
          <CardDescription>
            Configure and deploy a new support agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bot-name">Bot Name</Label>
            <Input id="bot-name" placeholder="Customer Success Bot" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-color">Brand Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="brand-color"
                type="color"
                defaultValue="#0d9488"
                className="h-9 w-14 cursor-pointer rounded-md border bg-card p-1"
              />
              <span className="text-sm text-muted-foreground">#0d9488</span>
            </div>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="system-prompt">
                System Prompt & Instructions
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-primary"
                onClick={() => toast.success("Template loaded")}
              >
                Use Template
              </Button>
            </div>
            <Textarea
              id="system-prompt"
              rows={6}
              placeholder={"# system_prompt.md\nYou are a helpful support agent for..."}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="cors">Allowed Domains (CORS)</Label>
            <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border bg-transparent px-2 py-1.5">
              {domains.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 py-1">
                  {d}
                  <button
                    type="button"
                    aria-label={`Remove ${d}`}
                    onClick={() =>
                      setDomains((prev) => prev.filter((x) => x !== d))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="cors"
                value={domainDraft}
                onChange={(e) => setDomainDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && domainDraft.trim()) {
                    e.preventDefault();
                    setDomains((prev) => [...prev, domainDraft.trim()]);
                    setDomainDraft("");
                  }
                }}
                placeholder={
                  domains.length === 0 ? "*.acmecorp.com" : ""
                }
                className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Press enter to add multiple domains. Leave empty to allow all.
            </p>
          </div>

          <div className="lg:col-span-2">
            <Separator className="mb-5" />
            <Button
              size="lg"
              onClick={() => toast.success("Agent deployed", {
                description: "It may take a minute to propagate to the edge.",
              })}
            >
              <Rocket className="size-4" /> Deploy Agent
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-heading">Test Your Agent</CardTitle>
          <CardDescription>
            Chat with your knowledge base before going live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            ref={chatScrollRef}
            className="flex h-72 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4"
          >
            {chatMessages.length === 0 && (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Ask a question about your uploaded documents.
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "agent" && (
                  <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </span>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm ${
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : m.text
                        ? "rounded-bl-sm border bg-card"
                        : "rounded-bl-sm border bg-card text-muted-foreground italic"
                  }`}
                >
                  {m.text || (chatting ? "Thinking…" : "")}
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <Input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Ask a question about your docs…"
              disabled={chatting}
            />
            <Button type="submit" size="icon" disabled={chatting || !chatDraft.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
