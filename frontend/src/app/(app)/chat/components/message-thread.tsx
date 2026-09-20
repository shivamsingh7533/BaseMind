import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatBubble } from "@/components/chat-bubble";
import type { RefObject } from "react";
import type { ChatMessage } from "@/lib/api";
import type { SourceRef } from "../utils";

export function MessageThread({
  messages,
  streaming,
  userLabel,
  followUps,
  scrollRef,
  onSend,
  onOpenSources,
  onScroll,
  onRate,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  userLabel: string;
  followUps: string[];
  scrollRef: RefObject<HTMLDivElement | null>;
  onSend: (text?: string) => void;
  onOpenSources: (sources: SourceRef[]) => void;
  onScroll: () => void;
  onRate?: (messageId: string, rating: 1 | -1, reason?: string) => void;
}) {
  return (
    <>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="space-y-5 p-4">
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
              onOpenSources={onOpenSources}
              onRate={onRate}
            />
          ))}
        </div>
      </ScrollArea>

      {followUps.length > 0 && !streaming && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          <span className="py-1 text-xs text-muted-foreground">Follow up:</span>
          {followUps.map((f, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="max-w-64 justify-start truncate rounded-full text-xs"
              onClick={() => onSend(f)}
            >
              {f.slice(0, 60)}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}