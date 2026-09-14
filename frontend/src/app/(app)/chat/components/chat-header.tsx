import { CircleCheckBig, OctagonX, RotateCw } from "lucide-react";
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
}: {
  view: Conversation | null;
  messageCount: number;
  streaming: boolean;
  onSetStatus: (status: ConversationStatus) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div>
        {view && (
          <>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{view.user}</p>
              <Badge
                variant="outline"
                className={cn("shrink-0", STATUS[view.status ?? "active"].badge)}
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
              {messageCount} messages · {view.time}
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
  );
}