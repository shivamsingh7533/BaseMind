"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Bot,
  Check,
  CirclePlus,
  Code2,
  Copy,
  ExternalLink,
  Headset,
  Loader2,
  Pause,
  Play,
  Plus,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  updateAgent,
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
  const [domains, setDomains] = useState<string[]>([]);
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

  // Embed Widget Modal State
  const [embedAgent, setEmbedAgent] = useState<Agent | null>(null);
  const [embedGreeting, setEmbedGreeting] = useState("");
  const [embedQuestions, setEmbedQuestions] = useState<string[]>([]);
  const [newQuestionDraft, setNewQuestionDraft] = useState("");
  const [embedDomains, setEmbedDomains] = useState<string[]>([]);
  const [newDomainDraft, setNewDomainDraft] = useState("");
  const [embedColor, setEmbedColor] = useState("#0d9488");
  const [embedLeadCapture, setEmbedLeadCapture] = useState(false);
  const [embedLeadTitle, setEmbedLeadTitle] = useState("Get in touch");
  const [savingWidget, setSavingWidget] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const openEmbedModal = (agent: Agent) => {
    setEmbedAgent(agent);
    setEmbedGreeting(agent.greetingMessage || "Hi! How can I help you today?");
    setEmbedQuestions(
      agent.suggestedQuestions && agent.suggestedQuestions.length > 0
        ? agent.suggestedQuestions
        : ["What are your pricing plans?", "How do I get started?"]
    );
    setEmbedDomains(
      agent.allowedDomains
        ? agent.allowedDomains
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : []
    );
    setEmbedColor(agent.color || "#0d9488");
    setEmbedLeadCapture(Boolean(agent.leadCaptureEnabled));
    setEmbedLeadTitle(agent.leadCaptureTitle || "Get in touch");
  };

  const handleSaveWidget = async () => {
    if (!embedAgent) return;
    setSavingWidget(true);
    try {
      const token = await getToken();
      const updated = await updateAgent(token, embedAgent.id, {
        greeting_message: embedGreeting.trim(),
        suggested_questions: embedQuestions,
        allowed_domains: embedDomains.join(", "),
        color: embedColor,
        lead_capture_enabled: embedLeadCapture,
        lead_capture_title: embedLeadTitle.trim(),
      });
      if (updated) {
        toast.success("Widget settings saved successfully!");
        setEmbedAgent(updated);
        await fetchAgents(token);
      }
    } finally {
      setSavingWidget(false);
    }
  };

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
        <Button
          onClick={() =>
            document
              .getElementById("agent-studio")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
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
                      className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => openEmbedModal(a)}
                    >
                      <Code2 className="size-3.5" /> Embed
                    </Button>
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

      <Card id="agent-studio" className="mt-6">
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
                    const d = domainDraft.trim().toLowerCase();
                    if (domains.includes(d)) return;
                    if (!/^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
                      toast.error("Enter a valid domain like *.example.com");
                      return;
                    }
                    setDomains((prev) => [...prev, d]);
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
            className="flex h-72 max-h-[50dvh] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4"
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
              aria-label="Ask a question about your docs"
              disabled={chatting}
            />
            <Button type="submit" size="icon" aria-label="Send question" disabled={chatting || !chatDraft.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* EMBED & INTEGRATION DIALOG */}
      <Dialog
        open={embedAgent !== null}
        onOpenChange={(open) => !open && setEmbedAgent(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div
                className="flex size-7 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: embedAgent?.color || "#0d9488" }}
              >
                <Code2 className="size-4" />
              </div>
              <DialogTitle className="text-lg font-heading">
                Embed Chat Widget: {embedAgent?.name}
              </DialogTitle>
            </div>
            <DialogDescription>
              Integrate this agent into your website or web application with a
              single line of code.
            </DialogDescription>
          </DialogHeader>

          {embedAgent && (
            <Tabs defaultValue="code" className="mt-2">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="code">Embed Code</TabsTrigger>
                <TabsTrigger value="customize">Customize</TabsTrigger>
                <TabsTrigger value="preview">Live Preview</TabsTrigger>
              </TabsList>

              {/* TAB 1: EMBED CODE */}
              <TabsContent value="code" className="space-y-4 pt-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      Option A: Floating Chat Bubble (Recommended)
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        const origin =
                          typeof window !== "undefined"
                            ? window.location.origin
                            : "https://base-mind.vercel.app";
                        const snippet = `<script\n  src="${origin}/widget.js"\n  data-agent-id="${embedAgent.id}"\n  data-color="${embedColor}"\n  defer>\n</script>`;
                        navigator.clipboard.writeText(snippet);
                        setCopiedScript(true);
                        toast.success("Script tag copied to clipboard!");
                        setTimeout(() => setCopiedScript(false), 2000);
                      }}
                    >
                      {copiedScript ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedScript ? "Copied" : "Copy Code"}
                    </Button>
                  </div>
                  <pre className="rounded-lg border bg-muted/50 p-3 font-mono text-xs text-foreground overflow-x-auto select-all">
                    {`<script\n  src="${
                      typeof window !== "undefined"
                        ? window.location.origin
                        : "https://base-mind.vercel.app"
                    }/widget.js"\n  data-agent-id="${
                      embedAgent.id
                    }"\n  data-color="${embedColor}"\n  defer>\n</script>`}
                  </pre>
                  <p className="text-[11px] text-muted-foreground">
                    Paste this snippet before the closing{" "}
                    <code>&lt;/body&gt;</code> tag on any HTML page (WordPress,
                    Shopify, Webflow, React, etc.).
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      Option B: Inline Iframe
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        const origin =
                          typeof window !== "undefined"
                            ? window.location.origin
                            : "https://base-mind.vercel.app";
                        const snippet = `<iframe\n  src="${origin}/widget/${embedAgent.id}"\n  width="100%"\n  height="600"\n  style="border:none;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.1);"\n></iframe>`;
                        navigator.clipboard.writeText(snippet);
                        setCopiedIframe(true);
                        toast.success("Iframe code copied!");
                        setTimeout(() => setCopiedIframe(false), 2000);
                      }}
                    >
                      {copiedIframe ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedIframe ? "Copied" : "Copy Code"}
                    </Button>
                  </div>
                  <pre className="rounded-lg border bg-muted/50 p-3 font-mono text-xs text-foreground overflow-x-auto select-all">
                    {`<iframe\n  src="${
                      typeof window !== "undefined"
                        ? window.location.origin
                        : "https://base-mind.vercel.app"
                    }/widget/${
                      embedAgent.id
                    }"\n  width="100%"\n  height="600"\n  style="border:none;border-radius:16px;"\n></iframe>`}
                  </pre>
                </div>

                <div className="pt-2 border-t flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">Direct Standalone Link</p>
                    <p className="text-[11px] text-muted-foreground">
                      Shareable URL for full-screen widget testing
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        const origin =
                          typeof window !== "undefined"
                            ? window.location.origin
                            : "https://base-mind.vercel.app";
                        const url = `${origin}/widget/${embedAgent.id}`;
                        navigator.clipboard.writeText(url);
                        setCopiedLink(true);
                        toast.success("Link copied!");
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                    >
                      {copiedLink ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() =>
                        window.open(`/widget/${embedAgent.id}`, "_blank")
                      }
                    >
                      <ExternalLink className="size-3.5" /> Open Preview
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: CUSTOMIZE */}
              <TabsContent value="customize" className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="widget-greeting" className="text-xs font-semibold">
                    Greeting Message
                  </Label>
                  <Textarea
                    id="widget-greeting"
                    rows={2}
                    value={embedGreeting}
                    onChange={(e) => setEmbedGreeting(e.target.value)}
                    placeholder="Hi! How can I help you today?"
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Shown to visitors at the top of their chat window.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Brand Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={embedColor}
                      onChange={(e) => setEmbedColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-md border bg-card p-1"
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {embedColor}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Suggested Starter Questions
                  </Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {embedQuestions.map((q, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="gap-1.5 py-1 text-xs"
                      >
                        <span>{q}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEmbedQuestions((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newQuestionDraft}
                      onChange={(e) => setNewQuestionDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newQuestionDraft.trim()) {
                          e.preventDefault();
                          setEmbedQuestions((prev) => [
                            ...prev,
                            newQuestionDraft.trim(),
                          ]);
                          setNewQuestionDraft("");
                        }
                      }}
                      placeholder="e.g. How do I request a refund?"
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newQuestionDraft.trim()) {
                          setEmbedQuestions((prev) => [
                            ...prev,
                            newQuestionDraft.trim(),
                          ]);
                          setNewQuestionDraft("");
                        }
                      }}
                    >
                      <Plus className="size-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Clickable quick-prompt buttons displayed to new visitors.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Allowed Domains (CORS Security)
                  </Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {embedDomains.map((d, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1.5 py-1 text-xs">
                        <span>{d}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEmbedDomains((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newDomainDraft}
                      onChange={(e) => setNewDomainDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newDomainDraft.trim()) {
                          e.preventDefault();
                          const d = newDomainDraft.trim().toLowerCase();
                          if (!embedDomains.includes(d)) {
                            setEmbedDomains((prev) => [...prev, d]);
                          }
                          setNewDomainDraft("");
                        }
                      }}
                      placeholder="e.g. *.acmecorp.com or mysite.com"
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newDomainDraft.trim()) {
                          const d = newDomainDraft.trim().toLowerCase();
                          if (!embedDomains.includes(d)) {
                            setEmbedDomains((prev) => [...prev, d]);
                          }
                          setNewDomainDraft("");
                        }
                      }}
                    >
                      <Plus className="size-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to allow embedding on any website.
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold cursor-pointer" htmlFor="lead-toggle">
                        Visitor Lead Capture Form
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Prompt website visitors to leave their name, email, and phone.
                      </p>
                    </div>
                    <input
                      id="lead-toggle"
                      type="checkbox"
                      checked={embedLeadCapture}
                      onChange={(e) => setEmbedLeadCapture(e.target.checked)}
                      className="size-4 rounded accent-primary cursor-pointer"
                    />
                  </div>

                  {embedLeadCapture && (
                    <div className="pt-2">
                      <Label className="text-[11px] text-muted-foreground">Form Heading / Prompt</Label>
                      <Input
                        value={embedLeadTitle}
                        onChange={(e) => setEmbedLeadTitle(e.target.value)}
                        placeholder="e.g. Get in touch with our team"
                        className="text-xs mt-1"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-3 border-t">
                  <Button
                    onClick={handleSaveWidget}
                    disabled={savingWidget}
                    className="gap-2"
                  >
                    {savingWidget ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Save Widget Settings
                  </Button>
                </div>
              </TabsContent>

              {/* TAB 3: LIVE PREVIEW */}
              <TabsContent value="preview" className="pt-3">
                <div className="flex flex-col items-center">
                  <div className="w-full max-w-sm rounded-2xl border bg-card shadow-lg overflow-hidden h-[480px]">
                    <iframe
                      src={`/widget/${embedAgent.id}`}
                      className="w-full h-full border-none"
                      title="Widget Live Preview"
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground text-center">
                    This is a live preview of the visitor experience.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
