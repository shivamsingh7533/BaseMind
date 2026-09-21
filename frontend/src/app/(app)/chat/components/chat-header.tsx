import { Bot, CircleCheckBig, Globe, Hash, Headphones, MessageCircle, OctagonX, RotateCw, Send, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/lib/api";
import { STATUS } from "../utils";

export function ChatHeader({
  view,
  messageCount,
  streaming,
  onSetStatus,
  onTakeover,
  onReturnToAI,
}: {
  view: Conversation | null;
  messageCount: number;
  streaming: boolean;
  onSetStatus: (status: ConversationStatus) => void;
  onTakeover?: () => void;
  onReturnToAI?: () => void;
}) {
  const statusConfig = view ? (STATUS[view.status] ?? STATUS.active) : STATUS.active;

  return (
    <div className="flex flex-col border-b">
      {view?.status === "needs_human" && (
        <div className="flex items-center justify-between gap-2 bg-amber-500/15 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 border-b border-amber-500/20">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
            <span>Visitor requested human assistance — automated AI is paused.</span>
          </div>
          {onTakeover && (
            <Button
              size="sm"
              className="h-7 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700 shadow-sm"
              onClick={onTakeover}
              disabled={streaming}
            >
              <Headphones className="mr-1 size-3.5" /> Take Over Now
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          {view && (
            <>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{view.user}</p>
                <Badge
                  variant="outline"
                  className={cn("shrink-0", statusConfig.badge)}
                >
                  <span
                    className={cn(
                      "mr-1 size-1.5 rounded-full",
                      statusConfig.dot
                    )}
                  />
                  {statusConfig.label}
                </Badge>
                {view.channel === "whatsapp" && (
                  <Badge variant="outline" className="text-[11px] font-normal border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1">
                    <MessageCircle className="size-3" /> WhatsApp
                    {view.externalChatId && <span className="opacity-75 font-mono text-[10px]">({view.externalChatId})</span>}
                  </Badge>
                )}
                {view.channel === "telegram" && (
                  <Badge variant="outline" className="text-[11px] font-normal border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 gap-1">
                    <Send className="size-3" /> Telegram
                    {view.externalChatId && <span className="opacity-75 font-mono text-[10px]">({view.externalChatId})</span>}
                  </Badge>
                )}
                {view.channel === "slack" && (
                  <Badge variant="outline" className="text-[11px] font-normal border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 gap-1">
                    <Hash className="size-3" /> Slack
                  </Badge>
                )}
                {view.channel === "discord" && (
                  <Badge variant="outline" className="text-[11px] font-normal border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 gap-1">
                    <Hash className="size-3" /> Discord
                  </Badge>
                )}
                {(!view.channel || view.channel === "web") && (
                  <Badge variant="outline" className="text-[11px] font-normal border-muted-foreground/30 bg-muted/40 text-muted-foreground gap-1">
                    <Globe className="size-3" /> Web
                  </Badge>
                )}
                {view.assignedTo && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    <UserCheck className="mr-1 size-3 text-indigo-500" />
                    {view.assignedTo}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {messageCount} messages · {view.time}
              </p>
            </>
          )}
        </div>

        {view && (
          <div className="flex flex-wrap items-center gap-2">
            {view.status === "in_takeover" && onReturnToAI && (
              <Button
                variant="outline"
                size="sm"
                className="border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                onClick={onReturnToAI}
                disabled={streaming}
              >
                <Bot className="mr-1 size-3.5" /> Return to AI
              </Button>
            )}

            {view.status === "active" && onTakeover && (
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                onClick={onTakeover}
                disabled={streaming}
                title="Take over thread as human operator"
              >
                <Headphones className="mr-1 size-3.5" /> Take Over
              </Button>
            )}

            {view.status !== "resolved" && view.status !== "halted" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetStatus("resolved")}
                  disabled={streaming}
                >
                  <CircleCheckBig className="size-3.5" /> Resolve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onSetStatus("halted")}
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
                onClick={() => onSetStatus("active")}
                disabled={streaming}
              >
                <RotateCw className="size-3.5" /> Reopen
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}