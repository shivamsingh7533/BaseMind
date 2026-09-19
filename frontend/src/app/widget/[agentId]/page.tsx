"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bot,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createPublicConversation,
  getPublicAgent,
  getPublicConversation,
  streamPublicChat,
  type PublicAgentConfig,
} from "@/lib/api";

interface MessageItem {
  id: string;
  role: "user" | "agent";
  text: string;
  sources?: { source: string; docId?: string }[];
}

export default function PublicWidgetPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [agent, setAgent] = useState<PublicAgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  // Load public agent details
  useEffect(() => {
    if (!agentId) return;
    let isMounted = true;

    async function loadAgent() {
      setLoading(true);
      setError(null);
      const data = await getPublicAgent(agentId);
      if (!isMounted) return;
      if (!data) {
        setError("This agent is currently offline or does not exist.");
        setLoading(false);
        return;
      }
      setAgent(data);
      setLoading(false);

      // Check for existing conversation in storage
      const savedConvId = typeof window !== "undefined"
        ? localStorage.getItem(`basemind_conv_${agentId}`)
        : null;

      if (savedConvId) {
        const history = await getPublicConversation(savedConvId);
        if (isMounted && history && history.messages) {
          setConversationId(savedConvId);
          setMessages(
            history.messages.map((m: { id: string; role: "user" | "agent"; text: string }) => ({
              id: m.id,
              role: m.role,
              text: m.text,
            }))
          );
        } else if (isMounted) {
          localStorage.removeItem(`basemind_conv_${agentId}`);
        }
      }
    }

    void loadAgent();
    return () => {
      isMounted = false;
    };
  }, [agentId]);

  const handleResetChat = () => {
    if (streaming) return;
    if (agentId && typeof window !== "undefined") {
      localStorage.removeItem(`basemind_conv_${agentId}`);
    }
    setConversationId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage({ type: "basemind:close" }, "*");
    }
  };

  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? input).trim();
      if (!query || streaming || !agent) return;

      setInput("");
      const userMsgId = "user-" + Date.now();
      const agentMsgId = "agent-" + Date.now();

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", text: query },
        { id: agentMsgId, role: "agent", text: "" },
      ]);
      setStreaming(true);

      try {
        let activeConvId = conversationId;
        if (!activeConvId) {
          const newConv = await createPublicConversation(agent.id, "Website Visitor");
          if (!newConv) {
            throw new Error("Failed to initialize conversation");
          }
          activeConvId = newConv.id;
          setConversationId(activeConvId);
          if (typeof window !== "undefined") {
            localStorage.setItem(`basemind_conv_${agent.id}`, activeConvId);
          }
        }

        await streamPublicChat(activeConvId, query, (event) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "agent") {
                copy[copy.length - 1] = {
                  ...last,
                  text: last.text + event.token,
                };
              }
              return copy;
            });
          } else if (event.type === "sources") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "agent") {
                copy[copy.length - 1] = {
                  ...last,
                  sources: event.sources,
                };
              }
              return copy;
            });
          } else if (event.type === "error") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "agent") {
                copy[copy.length - 1] = {
                  ...last,
                  text: last.text || "Sorry, I encountered an issue. Please try again.",
                };
              }
              return copy;
            });
          }
        });
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "agent" && !last.text) {
            copy[copy.length - 1] = {
              ...last,
              text: "Could not reach the assistant. Please try again later.",
            };
          }
          return copy;
        });
      } finally {
        setStreaming(false);
        inputRef.current?.focus();
      }
    },
    [input, streaming, agent, conversationId]
  );

  const brandColor = agent?.color || "#0d9488";

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background/80 p-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-xs text-muted-foreground animate-pulse">
          Connecting to assistant…
        </p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3">
          <Bot className="size-6" />
        </div>
        <h2 className="text-base font-semibold">Assistant Offline</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 text-xs"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background antialiased select-text overflow-hidden font-sans border border-border/40 sm:rounded-2xl shadow-2xl">
      {/* HEADER */}
      <header
        className="flex items-center justify-between px-4 py-3.5 border-b border-border/60 backdrop-blur-md shrink-0"
        style={{
          background: `linear-gradient(135deg, ${brandColor}18, transparent)`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm font-semibold text-sm"
            style={{ backgroundColor: brandColor }}
          >
            <Bot className="size-5" />
            <span className="absolute bottom-0 right-0 flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full border-2 border-background bg-emerald-500" />
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
              {agent.name}
            </h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
              <span>Replies instantly</span>
              <span>·</span>
              <span className="text-emerald-500 font-medium">Online</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={handleResetChat}
            title="Start new chat"
            disabled={streaming || messages.length === 0}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={handleClose}
            title="Close chat"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      {/* CHAT MESSAGES THREAD */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-smooth">
        {/* GREETING CARD */}
        {messages.length === 0 && (
          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 text-primary font-medium text-xs mb-1.5">
                <Sparkles className="size-3.5" style={{ color: brandColor }} />
                <span style={{ color: brandColor }}>Welcome!</span>
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {agent.greetingMessage}
              </p>
            </div>

            {/* SUGGESTED QUESTIONS CHIPS */}
            {agent.suggestedQuestions && agent.suggestedQuestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground px-1">
                  Suggested Questions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleSendMessage(q)}
                      disabled={streaming}
                      className="text-left rounded-xl border border-border/80 bg-card/60 px-3 py-1.5 text-xs text-foreground/90 transition-all hover:border-primary/50 hover:bg-accent/40 active:scale-[0.98] shadow-2xs"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MESSAGE LIST */}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed break-words whitespace-pre-wrap ${
                m.role === "user"
                  ? "rounded-br-xs text-white shadow-sm font-normal"
                  : "rounded-bl-xs border border-border/70 bg-card text-foreground shadow-2xs"
              }`}
              style={
                m.role === "user"
                  ? { backgroundColor: brandColor }
                  : undefined
              }
            >
              {m.text ? (
                m.text
              ) : streaming ? (
                <span className="inline-flex items-center gap-1 py-0.5 text-muted-foreground italic">
                  <Loader2 className="size-3 animate-spin" /> Thinking…
                </span>
              ) : (
                ""
              )}
            </div>

            {/* SOURCE CITATIONS */}
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 max-w-[85%]">
                {m.sources.map((s, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-[10px] py-0 px-2 font-normal text-muted-foreground border-border/60 bg-muted/20"
                  >
                    Source: {s.source}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT FORM */}
      <div className="p-3 border-t border-border/60 bg-background/95 backdrop-blur-md shrink-0">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            disabled={streaming}
            className="flex-1 rounded-xl border border-input bg-muted/30 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary/50 focus:bg-background"
          />
          <Button
            type="submit"
            size="icon"
            disabled={streaming || !input.trim()}
            className="size-8 rounded-xl text-white shadow-sm transition-transform active:scale-95 shrink-0"
            style={{ backgroundColor: brandColor }}
            title="Send"
          >
            {streaming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </form>

        {/* FOOTER BRANDING */}
        <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <span>Powered by</span>
          <a
            href="https://base-mind.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground/80 hover:text-primary inline-flex items-center gap-0.5"
          >
            BaseMind <ExternalLink className="size-2.5 opacity-60" />
          </a>
        </div>
      </div>
    </div>
  );
}
