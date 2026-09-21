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
  Hash,
  Headset,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Rocket,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlink,
  X,
  Zap,
  Cpu,
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
  deleteAgentIntegration,
  getAgentIntegrations,
  saveAgentIntegration,
  setAgentStatus,
  setTelegramWebhook,
  streamChat,
  triggerIntegrationTest,
  updateAgent,
  type Agent,
  type AgentIntegration,
  type AgentStatus,
} from "@/lib/api";
import { useAppData } from "@/lib/store";
import { AgentActionsDialog } from "./components/agent-actions-dialog";

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

const PROVIDER_OPTIONS = [
  { value: "gemini", label: "Google Gemini", defaultModel: "gemini-3.6-flash" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic Claude", defaultModel: "claude-3-5-sonnet" },
  { value: "custom", label: "Custom (Groq / Together / DeepSeek)", defaultModel: "custom" },
];

const MODEL_PRESETS: Record<string, { id: string; label: string; desc: string }[]> = {
  gemini: [
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", desc: "Default ultra-fast low latency" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Deep reasoning & extended context" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Fast, intelligent, lightweight" },
    { id: "gpt-4o", label: "GPT-4o", desc: "Omni flagship intelligence" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", desc: "Nuanced writing & reasoning" },
  ],
  custom: [
    { id: "custom", label: "Custom BYOK Endpoint", desc: "Configured via Settings BYOK" },
  ],
};

const FALLBACK_OPTIONS = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (Failover default)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
];

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

  // Agent Studio Multi-Model State
  const [botProvider, setBotProvider] = useState<string>("gemini");
  const [botModel, setBotModel] = useState<string>("gemini-3.6-flash");
  const [botFallback, setBotFallback] = useState<string>("gemini-3.6-flash");
  const [botTemperature, setBotTemperature] = useState<number>(0.2);

  // Embed Widget Modal State
  const [embedAgent, setEmbedAgent] = useState<Agent | null>(null);
  const [embedProvider, setEmbedProvider] = useState<string>("gemini");
  const [embedModel, setEmbedModel] = useState<string>("gemini-3.6-flash");
  const [embedFallback, setEmbedFallback] = useState<string>("gemini-3.6-flash");
  const [embedTemperature, setEmbedTemperature] = useState<number>(0.2);
  const [embedGreeting, setEmbedGreeting] = useState("");
  const [embedQuestions, setEmbedQuestions] = useState<string[]>([]);
  const [newQuestionDraft, setNewQuestionDraft] = useState("");
  const [embedDomains, setEmbedDomains] = useState<string[]>([]);
  const [newDomainDraft, setNewDomainDraft] = useState("");
  const [embedColor, setEmbedColor] = useState("#0d9488");
  const [embedLeadCapture, setEmbedLeadCapture] = useState(false);
  const [embedLeadTitle, setEmbedLeadTitle] = useState("Get in touch");
  const [embedHideBranding, setEmbedHideBranding] = useState(false);
  const [embedCustomBrand, setEmbedCustomBrand] = useState("");
  const [savingWidget, setSavingWidget] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Integrations Modal State
  const [integrationsAgent, setIntegrationsAgent] = useState<Agent | null>(null);
  const [integrationsList, setIntegrationsList] = useState<AgentIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  const [discordPublicKey, setDiscordPublicKey] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);

  const [copiedSlackWebhook, setCopiedSlackWebhook] = useState(false);
  const [copiedDiscordWebhook, setCopiedDiscordWebhook] = useState(false);

  // WhatsApp & Telegram Integration States
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [copiedWhatsappWebhook, setCopiedWhatsappWebhook] = useState(false);
  const [copiedWhatsappVerifyToken, setCopiedWhatsappVerifyToken] = useState(false);

  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [registeringTelegramWebhook, setRegisteringTelegramWebhook] = useState(false);
  const [copiedTelegramWebhook, setCopiedTelegramWebhook] = useState(false);

  // Actions & Tools Modal State
  const [actionsAgent, setActionsAgent] = useState<Agent | null>(null);

  const openIntegrationsModal = async (agent: Agent) => {
    setIntegrationsAgent(agent);
    setLoadingIntegrations(true);
    try {
      const token = await getToken();
      const list = await getAgentIntegrations(token, agent.id);
      setIntegrationsList(list);

      const slack = list.find((i) => i.platform === "slack");
      setSlackBotToken("");
      setSlackSigningSecret("");
      setSlackChannelId(slack?.channelId || "");

      const discord = list.find((i) => i.platform === "discord");
      setDiscordPublicKey("");
      setDiscordBotToken("");
      setDiscordWebhookUrl(discord?.webhookUrl || "");
      setDiscordChannelId(discord?.channelId || "");

      const wa = list.find((i) => i.platform === "whatsapp");
      setWhatsappPhoneNumberId(wa?.channelId || "");
      setWhatsappAccessToken("");
      setWhatsappVerifyToken(wa?.signingSecretMasked ? "" : "basemind_wa_verify");

      setTelegramBotToken("");
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const handleSaveSlack = async () => {
    if (!integrationsAgent) return;
    setSavingSlack(true);
    try {
      const token = await getToken();
      const res = await saveAgentIntegration(token, integrationsAgent.id, {
        platform: "slack",
        bot_token: slackBotToken.trim() || undefined,
        signing_secret: slackSigningSecret.trim() || undefined,
        channel_id: slackChannelId.trim() || undefined,
      });
      if (res) {
        toast.success("Slack integration saved!");
        const list = await getAgentIntegrations(token, integrationsAgent.id);
        setIntegrationsList(list);
        setSlackBotToken("");
        setSlackSigningSecret("");
      } else {
        toast.error("Failed to save Slack settings");
      }
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlack = async (integId: string) => {
    if (!integrationsAgent) return;
    setTestingSlack(true);
    try {
      const token = await getToken();
      const res = await triggerIntegrationTest(token, integrationsAgent.id, integId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setTestingSlack(false);
    }
  };

  const handleSaveDiscord = async () => {
    if (!integrationsAgent) return;
    setSavingDiscord(true);
    try {
      const token = await getToken();
      const res = await saveAgentIntegration(token, integrationsAgent.id, {
        platform: "discord",
        signing_secret: discordPublicKey.trim() || undefined,
        bot_token: discordBotToken.trim() || undefined,
        webhook_url: discordWebhookUrl.trim() || undefined,
        channel_id: discordChannelId.trim() || undefined,
      });
      if (res) {
        toast.success("Discord integration saved!");
        const list = await getAgentIntegrations(token, integrationsAgent.id);
        setIntegrationsList(list);
        setDiscordPublicKey("");
        setDiscordBotToken("");
      } else {
        toast.error("Failed to save Discord settings");
      }
    } finally {
      setSavingDiscord(false);
    }
  };

  const handleTestDiscord = async (integId: string) => {
    if (!integrationsAgent) return;
    setTestingDiscord(true);
    try {
      const token = await getToken();
      const res = await triggerIntegrationTest(token, integrationsAgent.id, integId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setTestingDiscord(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    if (!integrationsAgent) return;
    setSavingWhatsapp(true);
    try {
      const token = await getToken();
      const res = await saveAgentIntegration(token, integrationsAgent.id, {
        platform: "whatsapp",
        channel_id: whatsappPhoneNumberId.trim() || undefined,
        bot_token: whatsappAccessToken.trim() || undefined,
        signing_secret: whatsappVerifyToken.trim() || undefined,
      });
      if (res) {
        toast.success("WhatsApp settings saved!");
        const list = await getAgentIntegrations(token, integrationsAgent.id);
        setIntegrationsList(list);
        setWhatsappAccessToken("");
      } else {
        toast.error("Failed to save WhatsApp settings");
      }
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const handleTestWhatsapp = async (integId: string) => {
    if (!integrationsAgent) return;
    setTestingWhatsapp(true);
    try {
      const token = await getToken();
      const res = await triggerIntegrationTest(token, integrationsAgent.id, integId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const handleSaveTelegram = async () => {
    if (!integrationsAgent) return;
    setSavingTelegram(true);
    try {
      const token = await getToken();
      const res = await saveAgentIntegration(token, integrationsAgent.id, {
        platform: "telegram",
        bot_token: telegramBotToken.trim() || undefined,
      });
      if (res) {
        toast.success("Telegram settings saved!");
        const list = await getAgentIntegrations(token, integrationsAgent.id);
        setIntegrationsList(list);
        setTelegramBotToken("");
      } else {
        toast.error("Failed to save Telegram settings");
      }
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleRegisterTelegramWebhook = async (integId: string) => {
    if (!integrationsAgent) return;
    setRegisteringTelegramWebhook(true);
    try {
      const token = await getToken();
      const res = await setTelegramWebhook(token, integrationsAgent.id, integId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setRegisteringTelegramWebhook(false);
    }
  };

  const handleTestTelegram = async (integId: string) => {
    if (!integrationsAgent) return;
    setTestingTelegram(true);
    try {
      const token = await getToken();
      const res = await triggerIntegrationTest(token, integrationsAgent.id, integId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleDeleteIntegration = async (integId: string) => {
    if (!integrationsAgent) return;
    const ok = await deleteAgentIntegration(await getToken(), integrationsAgent.id, integId);
    if (ok) {
      toast.success("Integration disconnected");
      setIntegrationsList((prev) => prev.filter((i) => i.id !== integId));
    } else {
      toast.error("Failed to disconnect integration");
    }
  };

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
    setEmbedHideBranding(Boolean(agent.hideBranding));
    setEmbedCustomBrand(agent.customBrandName || "");
    setEmbedProvider(agent.modelProvider || "gemini");
    setEmbedModel(agent.modelName || "gemini-3.6-flash");
    setEmbedFallback(agent.fallbackModel || "gemini-3.6-flash");
    setEmbedTemperature(
      typeof agent.temperature === "number" ? agent.temperature : 0.2
    );
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
        hide_branding: embedHideBranding,
        custom_brand_name: embedCustomBrand.trim(),
        model_provider: embedProvider,
        model_name: embedModel,
        fallback_model: embedFallback,
        temperature: embedTemperature,
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
        model_provider: botProvider,
        model_name: botModel,
        fallback_model: botFallback,
        temperature: botTemperature,
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
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="outline"
                        className="h-5 gap-1 font-mono text-[10px] border-primary/25 bg-primary/5 text-primary"
                      >
                        <Cpu className="size-2.5" />
                        {a.modelName || "gemini-3.6-flash"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        • {a.modelProvider || "gemini"} (temp {a.temperature ?? 0.2})
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
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
                      className="gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => setActionsAgent(a)}
                    >
                      <Zap className="size-3.5 text-emerald-500" /> Tools &amp; Actions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-border hover:bg-muted"
                      onClick={() => void openIntegrationsModal(a)}
                    >
                      <Share2 className="size-3.5 text-muted-foreground" /> Integrations
                    </Button>
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

          <div className="rounded-xl border bg-muted/20 p-4 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-primary" />
                  <Label className="text-sm font-semibold">
                    Foundation LLM &amp; Gateway Settings
                  </Label>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider font-semibold border-primary/30 text-primary"
                  >
                    BYOK Supported
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the primary intelligence engine and failover circuit breaker for this agent.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Model Provider</Label>
                <select
                  value={botProvider}
                  onChange={(e) => {
                    const prov = e.target.value;
                    setBotProvider(prov);
                    const defaultMod =
                      PROVIDER_OPTIONS.find((p) => p.value === prov)?.defaultModel ||
                      "gemini-3.6-flash";
                    setBotModel(defaultMod);
                  }}
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Primary Model</Label>
                <select
                  value={botModel}
                  onChange={(e) => setBotModel(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                >
                  {(MODEL_PRESETS[botProvider] || MODEL_PRESETS.gemini).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.desc})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Fallback Model (Failover)</Label>
                <select
                  value={botFallback}
                  onChange={(e) => setBotFallback(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                >
                  {FALLBACK_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Temperature</Label>
                  <span className="font-mono text-xs font-semibold text-primary">
                    {botTemperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={botTemperature}
                  onChange={(e) => setBotTemperature(parseFloat(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-primary mt-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Deterministic (0.0)</span>
                  <span>Creative (1.0)</span>
                </div>
              </div>
            </div>
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
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="code">Embed Code</TabsTrigger>
                <TabsTrigger value="model">AI Model</TabsTrigger>
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

              {/* TAB: AI MODEL & GATEWAY */}
              <TabsContent value="model" className="space-y-4 pt-3">
                <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Cpu className="size-4 text-primary" />
                      Foundation Model &amp; Gateway
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure the model engine, generation temperature, and automatic fallback failover for {embedAgent.name}.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Model Provider</Label>
                      <select
                        value={embedProvider}
                        onChange={(e) => {
                          const prov = e.target.value;
                          setEmbedProvider(prov);
                          const defaultMod =
                            PROVIDER_OPTIONS.find((p) => p.value === prov)?.defaultModel ||
                            "gemini-3.6-flash";
                          setEmbedModel(defaultMod);
                        }}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                      >
                        {PROVIDER_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Primary Model</Label>
                      <select
                        value={embedModel}
                        onChange={(e) => setEmbedModel(e.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                      >
                        {(MODEL_PRESETS[embedProvider] || MODEL_PRESETS.gemini).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} ({m.desc})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Fallback Model (Failover)</Label>
                      <select
                        value={embedFallback}
                        onChange={(e) => setEmbedFallback(e.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                      >
                        {FALLBACK_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Temperature</Label>
                        <span className="font-mono text-xs font-semibold text-primary">
                          {embedTemperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={embedTemperature}
                        onChange={(e) => setEmbedTemperature(parseFloat(e.target.value))}
                        className="h-2 w-full cursor-pointer accent-primary mt-2"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Precise (0.0)</span>
                        <span>Creative (1.0)</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground border-t pt-2">
                    💡 If using OpenAI, Claude, or a Custom endpoint, ensure your API key is added in{" "}
                    <a href="/settings" className="text-primary underline" target="_blank" rel="noreferrer">
                      Settings &rarr; LLM Keys
                    </a>. Otherwise, BaseMind will seamlessly route to the fallback model.
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t">
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
                    Save Model Settings
                  </Button>
                </div>
              </TabsContent>

              {/* TAB 3: CUSTOMIZE */}
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

                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-semibold cursor-pointer" htmlFor="branding-toggle">
                          White-Label &amp; Custom Branding
                        </Label>
                        <span className="text-[10px] font-semibold text-primary border border-primary/30 bg-primary/10 rounded px-1.5 py-0.5">
                          Pro
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Remove &ldquo;Powered by BaseMind&rdquo; or replace it with your company brand name.
                      </p>
                    </div>
                    <input
                      id="branding-toggle"
                      type="checkbox"
                      checked={embedHideBranding}
                      onChange={(e) => setEmbedHideBranding(e.target.checked)}
                      className="size-4 rounded accent-primary cursor-pointer"
                    />
                  </div>

                  {embedHideBranding && (
                    <div className="pt-2">
                      <Label className="text-[11px] text-muted-foreground">Custom Brand Name (Optional)</Label>
                      <Input
                        value={embedCustomBrand}
                        onChange={(e) => setEmbedCustomBrand(e.target.value)}
                        placeholder="e.g. Acme Support (leave blank to hide badge completely)"
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

      {/* SLACK & DISCORD INTEGRATIONS DIALOG */}
      <Dialog
        open={integrationsAgent !== null}
        onOpenChange={(open) => !open && setIntegrationsAgent(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div
                className="flex size-7 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: integrationsAgent?.color || "#0d9488" }}
              >
                <Share2 className="size-4" />
              </div>
              <DialogTitle className="text-lg font-heading">
                Bot Integrations: {integrationsAgent?.name}
              </DialogTitle>
            </div>
            <DialogDescription>
              Connect this agent to WhatsApp, Telegram, Slack, and Discord to deliver automated customer service across all mobile and workspace channels.
            </DialogDescription>
          </DialogHeader>

          {integrationsAgent && (
            loadingIntegrations ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-xs font-medium">Loading bot integrations...</p>
              </div>
            ) : (
            <Tabs defaultValue="slack" className="mt-2">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="slack" className="gap-1.5 text-xs">
                  <MessageSquareText className="size-3.5" /> Slack
                  {integrationsList.some((i) => i.platform === "slack") && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="discord" className="gap-1.5 text-xs">
                  <Hash className="size-3.5" /> Discord
                  {integrationsList.some((i) => i.platform === "discord") && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="gap-1.5 text-xs">
                  <MessageCircle className="size-3.5 text-emerald-500" /> WhatsApp
                  {integrationsList.some((i) => i.platform === "whatsapp") && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="telegram" className="gap-1.5 text-xs">
                  <Send className="size-3.5 text-sky-500" /> Telegram
                  {integrationsList.some((i) => i.platform === "telegram") && (
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
              </TabsList>

              {/* SLACK INTEGRATION TAB */}
              <TabsContent value="slack" className="space-y-4 pt-3">
                {(() => {
                  const slackInteg = integrationsList.find((i) => i.platform === "slack");
                  const origin =
                    typeof window !== "undefined"
                      ? window.location.origin
                      : "https://base-mind.vercel.app";
                  const slackWebhookUrl = `${origin}/api/integrations/slack/${integrationsAgent.id}`;

                  return (
                    <>
                      {/* Status Banner */}
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`size-2.5 rounded-full ${slackInteg ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                          <div>
                            <p className="text-xs font-semibold">
                              {slackInteg ? "Slack Bot Active & Listening" : "Slack Bot Not Connected"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {slackInteg
                                ? `Masked Token: ${slackInteg.botTokenMasked || "Configured"}`
                                : "Add your bot token and signing secret below to activate."}
                            </p>
                          </div>
                        </div>
                        {slackInteg && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testingSlack}
                              onClick={() => void handleTestSlack(slackInteg.id)}
                              className="h-7 text-xs"
                            >
                              {testingSlack ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                              Test Ping
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDeleteIntegration(slackInteg.id)}
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Disconnect"
                            >
                              <Unlink className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Webhook URL to paste in Slack */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Request URL (Slack Events API)</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={slackWebhookUrl}
                            className="text-xs font-mono bg-muted/50 select-all"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(slackWebhookUrl);
                              setCopiedSlackWebhook(true);
                              toast.success("Slack Webhook URL copied!");
                              setTimeout(() => setCopiedSlackWebhook(false), 2000);
                            }}
                            className="shrink-0 text-xs"
                          >
                            {copiedSlackWebhook ? <Check className="size-3.5 text-emerald-500 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                            {copiedSlackWebhook ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Paste into Slack App &gt; <strong>Event Subscriptions</strong> &gt; Request URL.
                        </p>
                      </div>

                      {/* Credentials Form */}
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Bot User OAuth Token</Label>
                          <Input
                            type="password"
                            value={slackBotToken}
                            onChange={(e) => setSlackBotToken(e.target.value)}
                            placeholder={slackInteg?.hasBotToken ? "•••••••••••• (Leave blank to keep existing)" : "xoxb-your-slack-bot-token"}
                            className="text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Found in Slack App &gt; <strong>OAuth &amp; Permissions</strong> &gt; Bot User OAuth Token.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Signing Secret</Label>
                          <Input
                            type="password"
                            value={slackSigningSecret}
                            onChange={(e) => setSlackSigningSecret(e.target.value)}
                            placeholder={slackInteg?.hasSigningSecret ? "•••••••••••• (Leave blank to keep existing)" : "Your Slack app signing secret"}
                            className="text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Found in Slack App &gt; <strong>Basic Information</strong> &gt; App Credentials &gt; Signing Secret.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Default Channel ID (Optional)</Label>
                          <Input
                            type="text"
                            value={slackChannelId}
                            onChange={(e) => setSlackChannelId(e.target.value)}
                            placeholder="C0123456789"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Setup Guide */}
                      <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">Quick Slack Setup:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>Create an app at <code className="text-foreground">api.slack.com/apps</code></li>
                          <li>Add Bot Token Scopes: <code className="text-foreground">chat:write</code>, <code className="text-foreground">app_mentions:read</code></li>
                          <li>Enable Event Subscriptions, paste Request URL above, and subscribe to <code className="text-foreground">app_mention</code></li>
                          <li>Install App to your Workspace and paste credentials here.</li>
                        </ol>
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          onClick={() => void handleSaveSlack()}
                          disabled={savingSlack}
                          className="gap-2 text-xs"
                        >
                          {savingSlack ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                          Save Slack Settings
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </TabsContent>

              {/* DISCORD INTEGRATION TAB */}
              <TabsContent value="discord" className="space-y-4 pt-3">
                {(() => {
                  const discordInteg = integrationsList.find((i) => i.platform === "discord");
                  const origin =
                    typeof window !== "undefined"
                      ? window.location.origin
                      : "https://base-mind.vercel.app";
                  const discordWebhookUrlStr = `${origin}/api/integrations/discord/${integrationsAgent.id}`;

                  return (
                    <>
                      {/* Status Banner */}
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`size-2.5 rounded-full ${discordInteg ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                          <div>
                            <p className="text-xs font-semibold">
                              {discordInteg ? "Discord Bot Active & Listening" : "Discord Bot Not Connected"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {discordInteg
                                ? "Interactions endpoint configured and verified."
                                : "Configure your Discord Public Key or Webhook below."}
                            </p>
                          </div>
                        </div>
                        {discordInteg && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testingDiscord}
                              onClick={() => void handleTestDiscord(discordInteg.id)}
                              className="h-7 text-xs"
                            >
                              {testingDiscord ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                              Test Ping
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDeleteIntegration(discordInteg.id)}
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Disconnect"
                            >
                              <Unlink className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Interactions Endpoint URL to paste in Discord */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Interactions Endpoint URL (Discord Developer Portal)</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={discordWebhookUrlStr}
                            className="text-xs font-mono bg-muted/50 select-all"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(discordWebhookUrlStr);
                              setCopiedDiscordWebhook(true);
                              toast.success("Discord Endpoint URL copied!");
                              setTimeout(() => setCopiedDiscordWebhook(false), 2000);
                            }}
                            className="shrink-0 text-xs"
                          >
                            {copiedDiscordWebhook ? <Check className="size-3.5 text-emerald-500 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                            {copiedDiscordWebhook ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Paste into Discord Developer Portal &gt; General Information &gt; <strong>Interactions Endpoint URL</strong>.
                        </p>
                      </div>

                      {/* Credentials Form */}
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Public Key (Required for Slash Commands &amp; Validation)</Label>
                          <Input
                            type="password"
                            value={discordPublicKey}
                            onChange={(e) => setDiscordPublicKey(e.target.value)}
                            placeholder={discordInteg?.hasSigningSecret ? "•••••••••••• (Leave blank to keep existing)" : "Hex-encoded public key"}
                            className="text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Found in Discord Developer Portal &gt; General Information &gt; Public Key.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Bot Token (Optional - for direct channel messaging)</Label>
                          <Input
                            type="password"
                            value={discordBotToken}
                            onChange={(e) => setDiscordBotToken(e.target.value)}
                            placeholder={discordInteg?.hasBotToken ? "•••••••••••• (Leave blank to keep existing)" : "Bot token from Bot tab"}
                            className="text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Channel Webhook URL (Alternative simple integration)</Label>
                          <Input
                            type="url"
                            value={discordWebhookUrl}
                            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Discord Server Channel Settings &gt; Integrations &gt; Webhooks &gt; Copy Webhook URL.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Default Channel ID (Optional)</Label>
                          <Input
                            type="text"
                            value={discordChannelId}
                            onChange={(e) => setDiscordChannelId(e.target.value)}
                            placeholder="123456789012345678"
                            className="text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Setup Guide */}
                      <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">Quick Discord Setup:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>Create Application at <code className="text-foreground">discord.com/developers/applications</code></li>
                          <li>Copy the <strong>Public Key</strong> and paste it here first</li>
                          <li>Click Save Discord Settings</li>
                          <li>Paste the Interactions Endpoint URL in Discord and click Save in Discord</li>
                          <li>Discord will ping this URL to verify Ed25519 signature!</li>
                        </ol>
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          onClick={() => void handleSaveDiscord()}
                          disabled={savingDiscord}
                          className="gap-2 text-xs"
                        >
                          {savingDiscord ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                          Save Discord Settings
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </TabsContent>

              {/* WHATSAPP INTEGRATION TAB */}
              <TabsContent value="whatsapp" className="space-y-4 pt-3">
                {(() => {
                  const waInteg = integrationsList.find((i) => i.platform === "whatsapp");
                  const origin =
                    typeof window !== "undefined"
                      ? window.location.origin
                      : "https://base-mind.vercel.app";
                  const waWebhookUrl = `${origin}/api/integrations/whatsapp/${integrationsAgent.id}`;

                  return (
                    <>
                      {/* Status Banner */}
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`size-2.5 rounded-full ${waInteg ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                          <div>
                            <p className="text-xs font-semibold">
                              {waInteg ? "WhatsApp Cloud API Active & Listening" : "WhatsApp Cloud API Not Connected"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {waInteg
                                ? `Phone Number ID: ${waInteg.channelId || "Configured"}`
                                : "Configure your Meta Cloud API Phone Number ID and System Token below."}
                            </p>
                          </div>
                        </div>
                        {waInteg && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testingWhatsapp}
                              onClick={() => void handleTestWhatsapp(waInteg.id)}
                              className="h-7 text-xs"
                            >
                              {testingWhatsapp ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                              Test Ping
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDeleteIntegration(waInteg.id)}
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Disconnect"
                            >
                              <Unlink className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Meta Webhook Endpoint & Verify Token */}
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Callback URL (Meta WhatsApp Webhook)</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={waWebhookUrl}
                              className="text-xs font-mono bg-muted/50 select-all"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(waWebhookUrl);
                                setCopiedWhatsappWebhook(true);
                                toast.success("WhatsApp Webhook URL copied!");
                                setTimeout(() => setCopiedWhatsappWebhook(false), 2000);
                              }}
                              className="shrink-0 text-xs"
                            >
                              {copiedWhatsappWebhook ? <Check className="size-3.5 text-emerald-500 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                              {copiedWhatsappWebhook ? "Copied" : "Copy"}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Paste into Meta App &gt; WhatsApp &gt; <strong>Configuration &gt; Callback URL</strong>.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Verify Token</Label>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={whatsappVerifyToken || "basemind_wa_verify"}
                              onChange={(e) => setWhatsappVerifyToken(e.target.value)}
                              className="text-xs font-mono select-all"
                              placeholder="basemind_wa_verify"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(whatsappVerifyToken || "basemind_wa_verify");
                                setCopiedWhatsappVerifyToken(true);
                                toast.success("Verify Token copied!");
                                setTimeout(() => setCopiedWhatsappVerifyToken(false), 2000);
                              }}
                              className="shrink-0 text-xs"
                            >
                              {copiedWhatsappVerifyToken ? <Check className="size-3.5 text-emerald-500 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                              {copiedWhatsappVerifyToken ? "Copied" : "Copy"}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Enter this same token in Meta App &gt; WhatsApp &gt; <strong>Verify Token</strong>.
                          </p>
                        </div>
                      </div>

                      {/* Credentials Form */}
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">WhatsApp Phone Number ID</Label>
                          <Input
                            type="text"
                            value={whatsappPhoneNumberId}
                            onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                            placeholder={waInteg?.channelId ? waInteg.channelId : "e.g. 109876543210987"}
                            className="text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Found in Meta App &gt; WhatsApp &gt; <strong>API Setup &gt; Phone number ID</strong>.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Meta System User / Permanent Access Token</Label>
                          <Input
                            type="password"
                            value={whatsappAccessToken}
                            onChange={(e) => setWhatsappAccessToken(e.target.value)}
                            placeholder={waInteg?.hasBotToken ? "•••••••••••• (Leave blank to keep existing)" : "EAAB... Permanent Access Token"}
                            className="text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Generate from Meta Business Manager &gt; System Users with <code className="text-foreground">whatsapp_business_messaging</code> permission.
                          </p>
                        </div>
                      </div>

                      {/* Setup Guide */}
                      <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">Zero-Cost Meta Cloud Setup Guide:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>Create a Meta Business app at <code className="text-foreground">developers.facebook.com</code> and add <strong>WhatsApp</strong></li>
                          <li>Go to <strong>Configuration</strong>, paste Callback URL &amp; Verify Token, click <strong>Verify and Save</strong></li>
                          <li>Under <strong>Webhook fields</strong>, subscribe to <code className="text-foreground">messages</code></li>
                          <li>Copy your Phone Number ID and Access Token from <strong>API Setup</strong> and paste above</li>
                          <li>Includes 1,000 free customer-initiated service conversations each month at $0!</li>
                        </ol>
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          onClick={() => void handleSaveWhatsapp()}
                          disabled={savingWhatsapp}
                          className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {savingWhatsapp ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                          Save WhatsApp Settings
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </TabsContent>

              {/* TELEGRAM INTEGRATION TAB */}
              <TabsContent value="telegram" className="space-y-4 pt-3">
                {(() => {
                  const tgInteg = integrationsList.find((i) => i.platform === "telegram");
                  const origin =
                    typeof window !== "undefined"
                      ? window.location.origin
                      : "https://base-mind.vercel.app";
                  const tgWebhookUrl = `${origin}/api/integrations/telegram/${integrationsAgent.id}`;

                  return (
                    <>
                      {/* Status Banner */}
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`size-2.5 rounded-full ${tgInteg ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                          <div>
                            <p className="text-xs font-semibold">
                              {tgInteg ? "Telegram Bot Active & Listening" : "Telegram Bot Not Connected"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {tgInteg
                                ? `Masked Token: ${tgInteg.botTokenMasked || "Configured"}`
                                : "Create a bot with @BotFather and paste your token below."}
                            </p>
                          </div>
                        </div>
                        {tgInteg && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testingTelegram}
                              onClick={() => void handleTestTelegram(tgInteg.id)}
                              className="h-7 text-xs"
                            >
                              {testingTelegram ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                              Test Ping
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleDeleteIntegration(tgInteg.id)}
                              className="size-7 text-muted-foreground hover:text-destructive"
                              title="Disconnect"
                            >
                              <Unlink className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Telegram Webhook Endpoint */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">BaseMind Telegram Webhook URL</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={tgWebhookUrl}
                            className="text-xs font-mono bg-muted/50 select-all"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(tgWebhookUrl);
                              setCopiedTelegramWebhook(true);
                              toast.success("Telegram Webhook URL copied!");
                              setTimeout(() => setCopiedTelegramWebhook(false), 2000);
                            }}
                            className="shrink-0 text-xs"
                          >
                            {copiedTelegramWebhook ? <Check className="size-3.5 text-emerald-500 mr-1" /> : <Copy className="size-3.5 mr-1" />}
                            {copiedTelegramWebhook ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>

                      {/* Credentials Form */}
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Telegram Bot Token</Label>
                          <Input
                            type="password"
                            value={telegramBotToken}
                            onChange={(e) => setTelegramBotToken(e.target.value)}
                            placeholder={tgInteg?.hasBotToken ? "•••••••••••• (Leave blank to keep existing)" : "123456789:ABCdefGhIJKlmNoPQRstuVWxYZ"}
                            className="text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Generated by <code className="text-foreground">@BotFather</code> on Telegram.
                          </p>
                        </div>
                      </div>

                      {/* Quick Auto-Register Button */}
                      {tgInteg && (
                        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                                1-Click Telegram Webhook Registration
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Register this agent&apos;s webhook directly with the official Telegram Bot API in one click.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={registeringTelegramWebhook}
                              onClick={() => void handleRegisterTelegramWebhook(tgInteg.id)}
                              className="text-xs border-sky-500/30 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0"
                            >
                              {registeringTelegramWebhook ? <Loader2 className="size-3 animate-spin mr-1" /> : <Send className="size-3 mr-1" />}
                              Register Webhook
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Setup Guide */}
                      <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">Zero-Cost Telegram Setup Guide:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>Open Telegram, search for <code className="text-foreground">@BotFather</code>, and send <code className="text-foreground">/newbot</code></li>
                          <li>Follow prompts to choose a Name and Username (e.g. <code className="text-foreground">MyStoreSupportBot</code>)</li>
                          <li>Copy the <strong>HTTP API Token</strong> provided and paste it above</li>
                          <li>Click <strong>Save Telegram Settings</strong></li>
                          <li>Click <strong>Register Webhook</strong> for automatic 0-config synchronization!</li>
                          <li>100% Free forever with unlimited messages and instant bot responses!</li>
                        </ol>
                      </div>

                      <div className="flex justify-end pt-2 border-t">
                        <Button
                          onClick={() => void handleSaveTelegram()}
                          disabled={savingTelegram}
                          className="gap-2 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                        >
                          {savingTelegram ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                          Save Telegram Settings
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
            )
          )}
        </DialogContent>
      </Dialog>

      <AgentActionsDialog
        agent={actionsAgent}
        open={Boolean(actionsAgent)}
        onOpenChange={(open) => !open && setActionsAgent(null)}
      />
    </div>
  );
}
