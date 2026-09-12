"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CircleCheckBig,
  CirclePlus,
  FileSearch,
  Loader,
  MessageSquare,
  OctagonX,
  Trash2,
  RotateCcw,
  RotateCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getDocumentDownloadUrl,
  getDocumentPreview,
  streamChat,
  updateConversationStatus,
  type ChatMessage,
  type Conversation,
  type ConversationStatus,
  type DocumentPreview,
} from "@/lib/api";
import { useAppData } from "@/lib/store";
import { ChatBubble } from "@/components/chat-bubble";
import { cn } from "@/lib/utils";

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

type SourceRef = { source: string; docId?: string };

function chipsFrom(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+\S/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const PENDING_ID = "assistant-pending";

function Chat() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversations = useAppData((s) => s.conversations);
  const fetchConversations = useAppData((s) => s.fetchConversations);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sourceDocs, setSourceDocs] = useState<SourceRef[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  const visitorLabel = (
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Studio"
  ).trim();
  const userLabel = (visitorLabel.slice(0, 2) || "S").toUpperCase();
  const selected = conversations?.find((c) => c.id === selectedId) ?? detail;
  const view = detail && detail.id === selectedId ? detail : null;
  const loadingDetail = !!selectedId && !view;

  useEffect(() => {
    getToken()
      .then(async (t) => {
        const convos = await fetchConversations(t);
        const wanted = searchParams.get("id");
        const initial =
          wanted && convos.some((c) => c.id === wanted)
            ? wanted
            : (convos[0]?.id ?? null);
        setSelectedId(initial);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getToken()
      .then((t) => getConversation(t, selectedId))
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        if (!streamingRef.current) {
          setMessages(d?.messages ?? []);
          setFollowUps([]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming, loadingDetail]);

  const selectConversation = (id: string) => {
    if (streaming) return;
    setSelectedId(id);
    router.replace(`/chat?id=${id}`, { scroll: false });
  };

  const newChat = async () => {
    if (streaming) return;
    const t = await getToken();
    const created = await createConversation(t, null, visitorLabel);
    if (!created) {
      toast.error("Could not start a new chat");
      return;
    }
    await fetchConversations(t, true);
    setSelectedId(created);
    router.replace(`/chat?id=${created}`, { scroll: false });
    setDraft("");
  };

  const removeConversation = async (id: string, name: string) => {
    if (streaming) return;
    if (!window.confirm(`Delete "${name}"? This removes the whole thread.`))
      return;
    const ok = await deleteConversation(await getToken(), id);
    if (!ok) {
      toast.error("Could not delete conversation");
      return;
    }
    if (id === selectedId) {
      setSelectedId(null);
      setDetail(null);
      setMessages([]);
      setFollowUps([]);
      router.replace("/chat", { scroll: false });
    }
    await fetchConversations(await getToken(), true);
    toast.success("Conversation deleted");
  };

  const send = useCallback(
    async (rawText?: string) => {
      if (streaming) return;
      const t = await getToken();
      const text = (rawText ?? draft).trim();
      if (!text) return;
      let cid = selectedId;
      if (!cid) {
        const created = await createConversation(t, null, visitorLabel);
        if (!created) {
          toast.error("Could not start a chat session");
          return;
        }
        cid = created;
        setSelectedId(created);
        await fetchConversations(t, true);
      }
      setDraft("");
      setFollowUps([]);
      setDetail((prev) => (prev ? { ...prev, status: "active" } : prev));
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: "user", text, time: "" },
        { id: PENDING_ID, role: "agent", text: "", time: "" },
      ]);
      setStreaming(true);
      streamingRef.current = true;
      let answer = "";
      try {
        await streamChat(t, cid, text, (e) => {
          if (e.type === "sources") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "agent" && last.id === PENDING_ID)
                copy[copy.length - 1] = { ...last, sources: e.sources };
              return copy;
            });
          } else if (e.type === "token") {
            answer += e.token;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "agent" && last.id === PENDING_ID)
                copy[copy.length - 1] = { ...last, text: last.text + e.token };
              return copy;
            });
          } else if (e.type === "error") {
            toast.error(e.error);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "agent" && last.id === PENDING_ID && !last.text)
                copy.pop();
              return copy;
            });
          } else if (e.type === "done") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "agent" && last.id === PENDING_ID)
                copy[copy.length - 1] = {
                  ...last,
                  id: e.messageId ?? last.id,
                  time: fmtTime(new Date()),
                };
              return copy;
            });
            setFollowUps(chipsFrom(answer));
          }
        });
      } catch {
        toast.error("Could not reach the agent");
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "agent" && last.id === PENDING_ID && !last.text)
            copy.pop();
          return copy;
        });
      } finally {
        setStreaming(false);
        streamingRef.current = false;
        void fetchConversations(t, true);
      }
    },
    [draft, fetchConversations, getToken, selectedId, streaming, visitorLabel]
  );

  const retry = () => {
    if (streaming || !selectedId) return;
    const copy = [...messages];
    const lastUser = [...copy].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = copy.lastIndexOf(lastUser);
    setMessages(copy.slice(0, idx));
    setFollowUps([]);
    void send(lastUser.text);
  };

  const setStatus = async (status: ConversationStatus) => {
    if (streaming || !selectedId) return;
    const t = await getToken();
    const ok = await updateConversationStatus(t, selectedId, status);
    if (ok) {
      toast.success(`Session marked ${status}`);
      setDetail((prev) => (prev ? { ...prev, status } : prev));
      void fetchConversations(t, true);
    } else {
      toast.error("Could not update session status");
    }
  };

  const openSources = (sources: SourceRef[]) => {
    setSourceDocs(sources);
    setPreview(null);
    setDialogOpen(true);
  };

  const viewSource = async (s: SourceRef) => {
    if (!s.docId) {
      toast.info("Preview is not available for this source");
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    const p = await getDocumentPreview(await getToken(), s.docId);
    setPreviewLoading(false);
    if (!p) {
      toast.error("Preview unavailable");
      return;
    }
    setPreview(p);
  };

  const downloadSource = async (s: SourceRef) => {
    if (!s.docId) {
      toast.info("Download link is not available for this source");
      return;
    }
    setDownloadBusy(s.docId);
    const url = await getDocumentDownloadUrl(await getToken(), s.docId);
    setDownloadBusy(null);
    if (!url) {
      toast.error("Could not get download link");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Chat
          </h1>
          <p className="text-sm text-muted-foreground">
            Talk to your knowledge base. History is saved, sessions are live.
          </p>
        </div>
        <Button onClick={() => void newChat()} disabled={streaming}>
          <CirclePlus className="size-4" /> New Chat
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="flex h-[55vh] min-h-72 flex-col overflow-hidden lg:h-[calc(100vh-12rem)] lg:min-h-96">
          <CardContent className="flex-1 overflow-y-auto p-2">
            {!conversations ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No chats yet — start your first one above.
              </p>
            ) : (
              conversations.map((c) => {
                const activeSel = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative rounded-lg border-b border-border/60",
                      activeSel && "bg-accent/70"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectConversation(c.id)}
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
                      <Badge
                        variant="outline"
                        className={cn("mt-1.5", STATUS[c.status].badge)}
                      >
                        <span
                          className={cn(
                            "mr-1 size-1.5 rounded-full",
                            STATUS[c.status].dot
                          )}
                        />
                        {STATUS[c.status].label}
                      </Badge>
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
                      onClick={() =>
                        void removeConversation(c.id, c.user)
                      }
                      className="absolute right-2 top-2 size-6 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="flex h-[70vh] min-h-96 flex-col overflow-hidden lg:h-[calc(100vh-12rem)]">
          {loadingDetail ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <MessageSquare className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select a chat on the left, or start a new one.
              </p>
              <Button onClick={() => void newChat()} disabled={streaming}>
                <CirclePlus className="size-4" /> New Chat
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  {view && (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{selected.user}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            STATUS[view.status ?? "active"].badge
                          )}
                        >
                          <span
                            className={cn(
                              "mr-1 size-1.5 rounded-full",
                              STATUS[view.status ?? "active"].dot
                            )}
                          />
                          {STATUS[view.status ?? "active"].label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {messages.length} messages · {view.time}
                      </p>
                    </>
                  )}
                </div>
                {view && (
                  <div className="flex items-center gap-2">
                    {view.status !== "resolved" && view.status !== "halted" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void setStatus("resolved")}
                          disabled={streaming}
                        >
                          <CircleCheckBig className="size-3.5" /> Resolve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void setStatus("halted")}
                          disabled={streaming}
                        >
                          <OctagonX className="size-3.5" /> Halt
                        </Button>
                      </>
                    )}
                    {view.status === "resolved" || view.status === "halted" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void setStatus("active")}
                        disabled={streaming}
                      >
                        <RotateCw className="size-3.5" /> Reopen
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div ref={scrollRef} className="space-y-5 p-4">
                  {messages.length === 0 && !streaming && (
                    <p className="pt-6 text-center text-sm text-muted-foreground">
                      No messages yet — ask something about your docs.
                    </p>
                  )}
                  {messages.map((m, i) => (
                    <ChatBubble
                      key={m.id || i}
                      m={m}
                      userLabel={userLabel}
                      onOpenSources={(srcs) => openSources(srcs)}
                    />
                  ))}
                </div>
              </ScrollArea>

              {followUps.length > 0 && !streaming && (
                <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                  <span className="py-1 text-xs text-muted-foreground">
                    Follow up:
                  </span>
                  {followUps.map((f, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="max-w-64 justify-start truncate rounded-full text-xs"
                      onClick={() => void send(f)}
                    >
                      {f.slice(0, 60)}
                    </Button>
                  ))}
                </div>
              )}

              <form
                className="flex items-end gap-2 border-t p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask a question about your docs…"
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none"
                  disabled={streaming}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={streaming || !draft.trim()}
                  aria-label="Send message"
                >
                  <Send className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={streaming || messages.length < 2}
                  aria-label="Retry last question"
                  title="Retry last question"
                  onClick={() => retry()}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Answer sources</DialogTitle>
            <DialogDescription>
              Documents the last answer was drawn from. View a snippet or open
              the original file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {sourceDocs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No sources were attached to this answer.
              </p>
            )}
            {sourceDocs.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <FileSearch className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.source}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!s.docId || previewLoading}
                    onClick={() => void viewSource(s)}
                  >
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!s.docId || downloadBusy === s.docId}
                    onClick={() => void downloadSource(s)}
                  >
                    {downloadBusy === s.docId ? (
                      <Loader className="size-3.5 animate-spin" />
                    ) : (
                      "Download"
                    )}
                  </Button>
                </span>
              </div>
            ))}
          </div>
          {previewLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : preview ? (
            <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-semibold">{preview.name}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {preview.preview || "No readable text in this document."}
              </p>
            </div>
          ) : null}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}