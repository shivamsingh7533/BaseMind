import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/api";
import { STATUS } from "../utils";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
}: {
  conversations: Conversation[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <Card className="flex h-[55dvh] min-h-72 flex-col overflow-hidden lg:h-[calc(100dvh-12rem)] lg:min-h-96">
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
                  onClick={() => onSelect(c.id)}
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
                  onClick={() => onDelete(c.id, c.user)}
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
  );
}