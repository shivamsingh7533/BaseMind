"use client";

import { memo, useState } from "react";
import { Check, FileSearch, MessageSquareWarning, ThumbsDown, ThumbsUp } from "lucide-react";
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
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [submittingRate, setSubmittingRate] = useState(false);

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
            : "bg-primary text-primary-foreground"
        )}
      >
        {isUser ? userLabel : <LogoMark className="size-4" />}
      </span>
      <div className={cn("max-w-[85%] space-y-1.5", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            isUser
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : m.text
                ? "rounded-bl-sm border bg-card"
                : "rounded-bl-sm border bg-card italic text-muted-foreground"
          )}
        >
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
    </div>
  );
});