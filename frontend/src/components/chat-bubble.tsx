"use client";

import { memo, useState } from "react";
import { Check, FileSearch, Headphones, MessageSquareWarning, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { ChatMessage } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const FEEDBACK_REASONS = [
  "Incorrect information",
  "Outdated knowledge",
  "Not helpful",
  "Incomplete response",
  "Other",
];

export function renderRich(text: string) {
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

export const ChatBubble = memo(function ChatBubble({
  m,
  userLabel,
  onOpenSources,
  onRate,
}: {
  m: ChatMessage;
  userLabel: string;
  onOpenSources?: (sources: NonNullable<ChatMessage["sources"]>) => void;
  onRate?: (messageId: string, rating: 1 | -1, reason?: string) => void;
}) {
  const isUser = m.role === "user";
  const isOperator = m.role === "operator";
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [submittingRate, setSubmittingRate] = useState(false);
  const [previewModal, setPreviewModal] = useState<string | null>(null);

  const handleRate = async (rating: 1 | -1, reason?: string) => {
    if (!m.id || !onRate || submittingRate) return;
    setSubmittingRate(true);
    try {
      await onRate(m.id, rating, reason);
      setShowReasonPicker(false);
    } finally {
      setSubmittingRate(false);
    }
  };

  return (
    <div className={cn("group flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <span
        className={cn(
          "mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          isUser
            ? "bg-muted text-muted-foreground"
            : isOperator
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? (
          userLabel
        ) : isOperator ? (
          <Headphones className="size-3.5" />
        ) : (
          <LogoMark className="size-4" />
        )}
      </span>
      <div className={cn("max-w-[85%] space-y-1.5", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            isUser
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : isOperator
                ? "rounded-bl-sm border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-950/30 text-foreground"
                : m.text
                  ? "rounded-bl-sm border bg-card"
                  : "rounded-bl-sm border bg-card italic text-muted-foreground"
          )}
        >
          {isOperator && (
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              <Headphones className="size-3" />
              <span>{m.senderName ? `${m.senderName} (Human Agent)` : "Human Agent"}</span>
            </div>
          )}
          {m.imageUrl && (
            <div className="mb-2 overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
              <img
                src={m.imageUrl}
                alt="Attached screenshot"
                className="max-h-56 w-auto max-w-full cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                onClick={() => setPreviewModal(m.imageUrl || null)}
              />
            </div>
          )}
          {renderRich(m.text)}
          {!m.text && !isUser && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-1 animate-pulse rounded-full bg-current" />
              <span className="inline-block size-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="inline-block size-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          )}
        </div>
        {m.sources && m.sources.length > 0 && !isUser && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {m.sources.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenSources?.(m.sources ?? [])}
                className="inline-flex max-w-64 items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={s.source}
              >
                <FileSearch className="size-3 shrink-0" />
                <span className="truncate">{s.source}</span>
              </button>
            ))}
          </div>
        )}

        {!isUser && m.text && m.id && (
          <div className="flex items-center gap-2 pt-0.5">
            {m.time && (
              <p className="text-[11px] text-muted-foreground">
                {m.time}
                {m.latencyNote ? ` (${m.latencyNote})` : ""}
              </p>
            )}

            {onRate && (
              <div className="flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100">
                <button
                  type="button"
                  aria-label="Good response"
                  onClick={() => handleRate(1)}
                  disabled={submittingRate}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    m.rating === 1 && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-medium"
                  )}
                  title="Thumbs up"
                >
                  <ThumbsUp className="size-3" />
                </button>
                <button
                  type="button"
                  aria-label="Poor response"
                  onClick={() => {
                    if (m.rating === -1) {
                      setShowReasonPicker((p) => !p);
                    } else {
                      setShowReasonPicker(true);
                      void handleRate(-1);
                    }
                  }}
                  disabled={submittingRate}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    m.rating === -1 && "border-rose-500/40 bg-rose-500/10 text-rose-600 font-medium"
                  )}
                  title="Thumbs down"
                >
                  <ThumbsDown className="size-3" />
                </button>

                {m.feedbackReason && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Check className="size-2.5 text-emerald-500" />
                    {m.feedbackReason}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {showReasonPicker && !isUser && (
          <div className="rounded-lg border bg-popover/90 p-2 text-left shadow-sm backdrop-blur-sm">
            <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <MessageSquareWarning className="size-3" />
              <span>What went wrong with this answer?</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {FEEDBACK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRate(-1, r)}
                  className="rounded-md border bg-background/80 px-2 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary hover:bg-primary/10"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in-50 duration-200"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-white/20 bg-background/90 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewModal(null)}
              className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </button>
            <img
              src={previewModal}
              alt="Expanded view"
              className="max-h-[85vh] w-auto max-w-[85vw] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
});