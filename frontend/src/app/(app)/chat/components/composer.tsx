import { Headphones, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  draft,
  onDraftChange,
  onSend,
  onRetry,
  streaming,
  canRetry,
  isOperatorMode,
  operatorName,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onRetry: () => void;
  streaming: boolean;
  canRetry: boolean;
  isOperatorMode?: boolean;
  operatorName?: string;
}) {
  return (
    <div className="border-t">
      {isOperatorMode && (
        <div className="flex items-center gap-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border-b border-indigo-200/40 dark:border-indigo-800/40">
          <Headphones className="size-3" />
          <span>Operator Mode: your replies are delivered directly to the visitor in real-time ({operatorName || "You"}).</span>
        </div>
      )}
      <form
        className="flex items-end gap-2 p-3"
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
          placeholder={
            isOperatorMode
              ? "Type an operator reply to the visitor…"
              : "Ask a question about your docs…"
          }
          aria-label="Message"
          rows={1}
          className="max-h-32 min-h-10 flex-1 resize-none"
          disabled={streaming}
        />
        <Button
          type="submit"
          size="icon"
          disabled={streaming || !draft.trim()}
          aria-label="Send message"
          className={isOperatorMode ? "bg-indigo-600 hover:bg-indigo-700 text-white" : undefined}
        >
          <Send className="size-4" />
        </Button>
        {!isOperatorMode && (
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
        )}
      </form>
    </div>
  );
}