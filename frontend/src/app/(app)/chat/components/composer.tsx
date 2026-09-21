"use client";

import { useRef } from "react";
import { Headphones, ImagePlus, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export interface AttachedImageState {
  base64: string;
  mimeType: string;
  previewUrl: string;
  name: string;
}

export function Composer({
  draft,
  onDraftChange,
  attachedImage,
  onAttachedImageChange,
  onSend,
  onRetry,
  streaming,
  canRetry,
  isOperatorMode,
  operatorName,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  attachedImage?: AttachedImageState | null;
  onAttachedImageChange?: (img: AttachedImageState | null) => void;
  onSend: () => void;
  onRetry: () => void;
  streaming: boolean;
  canRetry: boolean;
  isOperatorMode?: boolean;
  operatorName?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPEG, WebP)");
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      toast.error("Image must be smaller than 3.5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.includes(",") ? result.split(",")[1] : result;
      onAttachedImageChange?.({
        base64: base64Data,
        mimeType: file.type || "image/png",
        previewUrl: result,
        name: file.name,
      });
      toast.success("Screenshot attached for vision diagnostics");
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
          break;
        }
      }
    }
  };

  const canSend = !streaming && (draft.trim().length > 0 || !!attachedImage);

  return (
    <div className="border-t">
      {isOperatorMode && (
        <div className="flex items-center gap-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border-b border-indigo-200/40 dark:border-indigo-800/40">
          <Headphones className="size-3" />
          <span>Operator Mode: your replies are delivered directly to the visitor in real-time ({operatorName || "You"}).</span>
        </div>
      )}

      {attachedImage && (
        <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs">
          <div className="flex items-center gap-2.5 truncate">
            <img
              src={attachedImage.previewUrl}
              alt="Screenshot preview"
              className="size-8 rounded-md border object-cover shadow-xs"
            />
            <span className="truncate font-medium text-foreground">{attachedImage.name}</span>
            <span className="text-[10px] text-muted-foreground">(Vision attached)</span>
          </div>
          <button
            type="button"
            onClick={() => onAttachedImageChange?.(null)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove image"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <form
        className="flex items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = "";
          }}
        />

        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={
            isOperatorMode
              ? "Type an operator reply to the visitor…"
              : attachedImage
                ? "Add question or context about this screenshot…"
                : "Ask a question about your docs or paste screenshot (Ctrl+V)…"
          }
          aria-label="Message"
          rows={1}
          className="max-h-32 min-h-10 flex-1 resize-none"
          disabled={streaming}
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={streaming}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach screenshot"
          title="Attach screenshot (or paste via Ctrl+V)"
        >
          <ImagePlus className="size-4" />
        </Button>

        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
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