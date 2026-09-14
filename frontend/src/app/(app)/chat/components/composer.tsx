import { RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  draft,
  onDraftChange,
  onSend,
  onRetry,
  streaming,
  canRetry,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onRetry: () => void;
  streaming: boolean;
  canRetry: boolean;
}) {
  return (
    <form
      className="flex items-end gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <Textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
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
        disabled={streaming || !canRetry}
        aria-label="Retry last question"
        title="Retry last question"
        onClick={onRetry}
      >
        <RotateCcw className="size-4" />
      </Button>
    </form>
  );
}