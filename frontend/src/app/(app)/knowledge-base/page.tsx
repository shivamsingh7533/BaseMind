"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  CloudUpload,
  FileSpreadsheet,
  FileText,
  Globe,
  Link2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type DocStatus, uploadDocument } from "@/lib/api";
import { useAppData } from "@/lib/store";

const STATUS: Record<
  DocStatus,
  { label: string; className: string }
> = {
  ready: {
    label: "Ready",
    className: "bg-success/10 text-success border-transparent",
  },
  processing: {
    label: "Processing",
    className: "bg-chart-3/10 text-chart-3 border-transparent",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-transparent",
  },
};

function TypeIcon({ type }: { type: string }) {
  if (type.startsWith("Web"))
    return <Globe className="size-4 text-muted-foreground" />;
  if (type.startsWith("CSV"))
    return <FileSpreadsheet className="size-4 text-muted-foreground" />;
  return <FileText className="size-4 text-muted-foreground" />;
}

export default function KnowledgeBasePage() {
  const { getToken } = useAuth();
  const docs = useAppData((s) => s.documents);
  const fetchDocuments = useAppData((s) => s.fetchDocuments);
  const [syncUrl, setSyncUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getToken()
      .then((t) => fetchDocuments(t))
      .catch(() => {});
  }, [getToken, fetchDocuments]);

  const handleFile = async (file: File | undefined | null) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(await getToken().catch(() => null), file);
      if (doc) {
        toast.success(`${file.name} indexed`, {
          description: doc.detail,
        });
        await fetchDocuments(await getToken());
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Knowledge Base
        </h1>
      </div>
      <p className="-mt-3 mb-6 text-sm text-muted-foreground">
        Train your agents by connecting data sources. Supported formats: PDF,
        TXT, CSV.
      </p>

      <Card>
        <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv,.md"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/50 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="size-8 animate-spin text-primary" />
            ) : (
              <CloudUpload className="size-8 text-primary" />
            )}
            <p className="text-sm font-medium">
              {uploading
                ? "Indexing your document…"
                : "Drag & Drop files here"}
            </p>
            <p className="text-xs text-muted-foreground">
              {uploading ? "This may take a few seconds" : "or click to browse (PDF, TXT, CSV · max 10MB)"}
            </p>
          </button>

          <div className="flex flex-col justify-center gap-2">
            <label className="text-sm font-medium">Sync URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                  placeholder="https://docs.example.com"
                  className="pl-9"
                />
              </div>
              <Button
                onClick={() => {
                  if (!syncUrl.trim()) {
                    toast.error("Enter a URL first");
                    return;
                  }
                  toast.info("URL crawling Phase 3 me aa raha hai — abhi files upload karo, wo fully kaam karta hai");
                }}
              >
                Sync
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coming in Phase 3 — file upload works fully today.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-heading">Connected Sources</CardTitle>
          <Badge variant="secondary">
            {docs ? `${docs.length} Files` : "…"}
          </Badge>
        </CardHeader>
        <CardContent>
          {!docs ? (
            <Skeleton className="h-36 w-full" />
          ) : (
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {docs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No knowledge sources yet — upload your first document to
                      get started.
                    </TableCell>
                  </TableRow>
                ) : (
                docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <TypeIcon type={d.type} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {d.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.status === "failed" ? (
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <TriangleAlert className="size-3" /> {d.detail}
                              </span>
                            ) : (
                              d.detail
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.type}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={STATUS[d.status].className}>
                        {STATUS[d.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
