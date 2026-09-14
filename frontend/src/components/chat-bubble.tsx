"use client";

import { memo } from "react";
import { FileSearch } from "lucide-react";
import type { ChatMessage } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

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
}: {
  m: ChatMessage;
  userLabel: string;
  onOpenSources?: (sources: NonNullable<ChatMessage["sources"]>) => void;
}) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
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
        {m.time && !isUser && (
          <p className="text-[11px] text-muted-foreground">
            {m.time}
            {m.latencyNote ? ` (${m.latencyNote})` : ""}
          </p>
        )}
      </div>
    </div>
  );
});