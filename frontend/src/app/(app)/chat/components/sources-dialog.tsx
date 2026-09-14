import { FileSearch, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { DocumentPreview } from "@/lib/api";
import type { SourceRef } from "../utils";

export function SourcesDialog({
  open,
  onOpenChange,
  sources,
  preview,
  previewLoading,
  downloadBusy,
  onView,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceRef[];
  preview: DocumentPreview | null;
  previewLoading: boolean;
  downloadBusy: string | null;
  onView: (s: SourceRef) => void;
  onDownload: (s: SourceRef) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Answer sources</DialogTitle>
          <DialogDescription>
            Documents the last answer was drawn from. View a snippet or open
            the original file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sources were attached to this answer.
            </p>
          )}
          {sources.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <FileSearch className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.source}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!s.docId || previewLoading}
                  onClick={() => onView(s)}
                >
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!s.docId || downloadBusy === s.docId}
                  onClick={() => onDownload(s)}
                >
                  {downloadBusy === s.docId ? (
                    <Loader className="size-3.5 animate-spin" />
                  ) : (
                    "Download"
                  )}
                </Button>
              </span>
            </div>
          ))}
        </div>
        {previewLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : preview ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-3">
            <p className="mb-1 text-xs font-semibold">{preview.name}</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {preview.preview || "No readable text in this document."}
            </p>
          </div>
        ) : null}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}