"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { CirclePlus, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getDocumentDownloadUrl,
  getDocumentPreview,
  returnConversationToAI,
  sendOperatorMessage,
  streamChat,
  submitMessageFeedback,
  takeoverConversation,
  updateConversationStatus,
  type ChatMessage,
  type Conversation,
  type ConversationStatus,
  type DocumentPreview,
} from "@/lib/api";
import { useAppData } from "@/lib/store";
import { ConversationList } from "./components/conversation-list";
import { ChatHeader } from "./components/chat-header";
import { CoPilotPanel } from "./components/copilot-panel";
import { MessageThread } from "./components/message-thread";
import { Composer, type AttachedImageState } from "./components/composer";
import { SourcesDialog } from "./components/sources-dialog";
import { chipsFrom, fmtTime, PENDING_ID, type SourceRef } from "./utils";

export function Chat() {
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
  const [attachedImage, setAttachedImage] = useState<AttachedImageState | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sourceDocs, setSourceDocs] = useState<SourceRef[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const stickToBottomRef = useRef(true);

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const visitorLabel = (
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Studio"
  ).trim();
  const userLabel = (visitorLabel.slice(0, 2) || "S").toUpperCase();
  const operatorName = (
    user?.fullName ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Support Operator"
  ).trim();

  const selected = conversations?.find((c) => c.id === selectedId) ?? detail;
  const view = detail && detail.id === selectedId ? detail : null;
  const loadingDetail = !!selectedId && !view;
  const isOperatorMode = view?.status === "in_takeover" || view?.status === "needs_human";

  useEffect(() => {
    getToken()
      .then(async (t) => {
        const convos = (await fetchConversations(t)) ?? [];
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

  // Poll conversation list every 8s so operator catches new escalations
  useEffect(() => {
    const listTimer = setInterval(async () => {
      if (streamingRef.current) return;
      try {
        const t = await getToken();
        await fetchConversations(t, true);
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(listTimer);
  }, [fetchConversations, getToken]);

  // Poll active thread messages every 4s when in needs_human or in_takeover
  useEffect(() => {
    if (!selectedId) return;
    const threadTimer = setInterval(async () => {
      if (streamingRef.current) return;
      try {
        const t = await getToken();
        const d = await getConversation(t, selectedId);
        if (d && d.id === selectedId) {
          setDetail((prev) => {
            if (
              prev?.status !== d.status ||
              prev?.messages.length !== d.messages.length ||
              prev?.assignedTo !== d.assignedTo
            ) {
              setMessages(d.messages);
            }
            return d;
          });
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(threadTimer);
  }, [getToken, selectedId]);

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
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages, streaming, loadingDetail]);

  const handleTakeover = async () => {
    if (!selectedId) return;
    const t = await getToken();
    const updated = await takeoverConversation(t, selectedId);
    if (updated) {
      setDetail(updated);
      setMessages(updated.messages);
      toast.success("You have taken over this thread as human operator");
      void fetchConversations(t, true);
    } else {
      toast.error("Could not take over conversation");
    }
  };

  const handleReturnToAI = async () => {
    if (!selectedId) return;
    const t = await getToken();
    const updated = await returnConversationToAI(t, selectedId);
    if (updated) {
      setDetail(updated);
      setMessages(updated.messages);
      toast.success("Returned conversation to AI Assistant");
      void fetchConversations(t, true);
    } else {
      toast.error("Could not return conversation to AI");
    }
  };

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
      const currentImage = attachedImage;
      const text = (rawText ?? draft).trim();
      if (!text && !currentImage) return;
      const effectiveText = text || "Please analyze this image and help diagnose the issue.";
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
      setAttachedImage(null);
      setFollowUps([]);

      if (isOperatorMode) {
        const opMsg: ChatMessage = {
          id: `op-${Date.now()}`,
          role: "operator",
          text: effectiveText,
          senderName: operatorName,
          time: fmtTime(new Date()),
        };
        setMessages((prev) => [...prev, opMsg]);
        setDetail((prev) =>
          prev ? { ...prev, status: "in_takeover", assignedTo: operatorName } : prev
        );
        const ok = await sendOperatorMessage(t, cid, effectiveText, operatorName);
        if (!ok) {
          toast.error("Could not send operator message");
        } else {
          void fetchConversations(t, true);
        }
        return;
      }

      setDetail((prev) => (prev ? { ...prev, status: "active" } : prev));
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          text: effectiveText,
          imageUrl: currentImage?.previewUrl,
          time: "",
        },
        { id: PENDING_ID, role: "agent", text: "", time: "" },
      ]);
      setStreaming(true);
      streamingRef.current = true;
      let answer = "";
      try {
        await streamChat(
          t,
          cid,
          effectiveText,
          (e) => {
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
          },
          currentImage
            ? {
                image_base64: currentImage.base64,
                image_mime_type: currentImage.mimeType,
              }
            : undefined
        );
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
    [attachedImage, draft, fetchConversations, getToken, isOperatorMode, operatorName, selectedId, streaming, visitorLabel]
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

  const openSources = useCallback((sources: SourceRef[]) => {
    setSourceDocs(sources);
    setPreview(null);
    setDialogOpen(true);
  }, []);

  const viewSource = async (s: SourceRef) => {
    if (!s.docId) {
      toast.info("Preview is not available for this source");
      return;
    }
    setPreviewLoading(true);
    try {
      const p = await getDocumentPreview(await getToken(), s.docId);
      if (!p) {
        toast.error("Preview unavailable");
        return;
      }
      setPreview(p);
    } catch {
      toast.error("Preview unavailable");
    }
    finally {
      setPreviewLoading(false);
    }
  };

  const downloadSource = async (s: SourceRef) => {
    if (!s.docId) {
      toast.info("Download link is not available for this source");
      return;
    }
    setDownloadBusy(s.docId);
    try {
      const url = await getDocumentDownloadUrl(await getToken(), s.docId);
      if (!url) {
        toast.error("Could not get download link");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not get download link");
    } finally {
      setDownloadBusy(null);
    }
  };

  const handleRateMessage = useCallback(
    async (messageId: string, rating: 1 | -1, reason?: string) => {
      if (!selectedId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, rating, feedbackReason: reason ?? m.feedbackReason }
            : m
        )
      );
      try {
        const token = await getToken();
        await submitMessageFeedback(token, selectedId, messageId, {
          rating,
          reason,
        });
        toast.success(
          rating === 1
            ? "Thank you for the positive feedback!"
            : "Feedback recorded — we'll improve our answers."
        );
      } catch {
        toast.error("Failed to save feedback");
      }
    },
    [getToken, selectedId]
  );

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
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={selectConversation}
          onDelete={(id, name) => void removeConversation(id, name)}
        />

        <Card className="flex h-[70dvh] min-h-96 flex-col overflow-hidden lg:h-[calc(100dvh-12rem)]">
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
              <ChatHeader
                view={view}
                messageCount={messages.length}
                streaming={streaming}
                onSetStatus={(s) => void setStatus(s)}
                onTakeover={handleTakeover}
                onReturnToAI={handleReturnToAI}
              />
              {selectedId && (
                <CoPilotPanel
                  conversationId={selectedId}
                  isOperatorMode={isOperatorMode}
                  onApplyDraft={(text) => setDraft(text)}
                />
              )}
              <MessageThread
                messages={messages}
                streaming={streaming}
                userLabel={userLabel}
                followUps={followUps}
                scrollRef={scrollRef}
                onSend={(t) => void send(t)}
                onOpenSources={openSources}
                onScroll={handleThreadScroll}
                onRate={handleRateMessage}
              />
              <Composer
                draft={draft}
                onDraftChange={setDraft}
                attachedImage={attachedImage}
                onAttachedImageChange={setAttachedImage}
                onSend={() => void send()}
                onRetry={retry}
                streaming={streaming}
                canRetry={messages.length >= 2}
                isOperatorMode={isOperatorMode}
                operatorName={operatorName}
              />
            </>
          )}
        </Card>
      </div>

      <SourcesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sources={sourceDocs}
        preview={preview}
        previewLoading={previewLoading}
        downloadBusy={downloadBusy}
        onView={(s) => void viewSource(s)}
        onDownload={(s) => void downloadSource(s)}
      />
    </div>
  );
}