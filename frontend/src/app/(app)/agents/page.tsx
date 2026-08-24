"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Bot,
  CirclePlus,
  Headset,
  Pause,
  Play,
  Rocket,
  Send,
  Trash2,
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
  createAgent,
  createConversation,
  deleteAgent,
  setAgentStatus,
  streamChat,
  type Agent,
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
  const [botName, setBotName] = useState("Customer Success Bot");
  const [brandColor, setBrandColor] = useState("#0d9488");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [testAgentId, setTestAgentId] = useState<string>("");
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
        convId = await createConversation(await getToken(), testAgentId || null);
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

  const toggleAgent = async (agent: Agent) => {
    const next: AgentStatus = agent.status === "active" ? "paused" : "active";
    const ok = await setAgentStatus(await getToken(), agent.id, next);
    if (ok) {
      toast.success(
        `${agent.name} ${next === "active" ? "activated" : "paused"}`
      );
      await fetchAgents(await getToken());
    } else {
      toast.error("Could not update agent");
    }
  };

  const removeAgent = async (agent: Agent) => {
    if (
      !window.confirm(
        `Delete "${agent.name}"? Its conversations will also be removed.`
      )
    )
      return;
    const ok = await deleteAgent(await getToken(), agent.id);
    if (ok) {
      toast.success(`${agent.name} deleted`);
      if (testAgentId === agent.id) {
        setTestAgentId("");
        setStudioConvId(null);
        setChatMessages([]);
      }
      await fetchAgents(await getToken());
    } else {
      toast.error("Could not delete agent");
    }
  };

  const deployAgent = async () => {
    if (deploying) return;
    if (!botName.trim()) {
      toast.error("Give your bot a name first");
      return;
    }
    setDeploying(true);
    try {
      const created = await createAgent(await getToken(), {
        name: botName.trim(),
        instructions: systemPrompt.trim(),
        color: brandColor,
      });
      if (created) {
        toast.success(`${created.name} is live`, {
          description: "Test it in the Test Your Agent panel below.",
        });
        await fetchAgents(await getToken());
        setTestAgentId(created.id);
      }
    } finally {
      setDeploying(false);
    }
  };

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
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={a.status === "training"}
                      onClick={() => void toggleAgent(a)}
                    >
                      {a.status === "active" ? (
                        <>
                          <Pause className="size-3.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" /> Activate
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${a.name}`}
                      onClick={() => void removeAgent(a)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
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
            Name your agent, tell it how to behave, then deploy. It answers
            using the documents in your Knowledge Base.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bot-name">Bot Name</Label>
            <Input
              id="bot-name"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              placeholder="Customer Success Bot"
            />
            <p className="text-xs text-muted-foreground">
              Shown to customers in the chat widget header.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-color">Brand Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="brand-color"
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border bg-card p-1"
              />
              <span className="text-sm text-muted-foreground">
                {brandColor}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Accent color for buttons and bubbles.
            </p>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="system-prompt">
                System Prompt &amp; Instructions
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-primary"
                onClick={() =>
                  setSystemPrompt(
                    [
                      "## Identity",
                      "You are the support assistant for Acme Corp.",
                      "",
                      "## Tone",
                      "- Friendly and professional. Keep replies under 100 words.",
                      "- Address the customer by name if they shared it.",
                      "",
                      "## Rules",
                      "- Answer ONLY from the knowledge base documents.",
                      "- If something is not in the documents, say so honestly and suggest contacting a human.",
                      "- Never invent prices, dates, or policies.",
                    ].join("\n")
                  )
                }
              >
                Use Template
              </Button>
            </div>
            <Textarea
              id="system-prompt"
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={
                "Optional — tell your bot how to talk.\nExample:\nYou are the support assistant for Acme Corp.\nBe friendly, keep replies short.\nOnly answer from my documents; if you don't know, say so."
              }
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Not sure what to write? Click <span className="font-medium text-primary">Use Template</span> and edit the
              parts between ## headings. Leave empty for sensible defaults.
            </p>
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
            <Button size="lg" disabled={deploying} onClick={() => void deployAgent()}>
              {deploying ? (
                <>Deploying…</>
              ) : (
                <>
                  <Rocket className="size-4" /> Deploy Agent
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-heading">Test Your Agent</CardTitle>
              <CardDescription>
                Chat with your knowledge base before going live.
              </CardDescription>
            </div>
            {(agents?.length ?? 0) > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Test with:
                <select
                  value={testAgentId}
                  onChange={(e) => {
                    setTestAgentId(e.target.value);
                    setStudioConvId(null);
                    setChatMessages([]);
                  }}
                  className="h-8 rounded-md border bg-card px-2 text-xs outline-none"
                >
                  <option value="">All documents (no specific agent)</option>
                  {agents!.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
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
