"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCoPilotSuggestions, getCoPilotSummary } from "@/lib/api/copilot";
import type { CoPilotSummary } from "@/lib/api/types";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface CoPilotPanelProps {
  conversationId: string;
  isOperatorMode: boolean;
  onApplyDraft: (text: string) => void;
}

export function CoPilotPanel({
  conversationId,
  isOperatorMode,
  onApplyDraft,
}: CoPilotPanelProps) {
  const { getToken } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [tone, setTone] = useState<"friendly" | "concise" | "formal">("friendly");

  const [summary, setSummary] = useState<CoPilotSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Auto-generate summary and suggestions when an escalated/takeover thread opens
  useEffect(() => {
    let active = true;
    if (!conversationId) return;

    const loadCoPilot = async () => {
      const token = await getToken().catch(() => null);
      if (!token || !active) return;

      if (isOperatorMode) {
        setLoadingSummary(true);
        try {
          const sum = await getCoPilotSummary(token, conversationId);
          if (active && sum) setSummary(sum);
        } catch {
          // ignore
        } finally {
          if (active) setLoadingSummary(false);
        }

        setLoadingSuggestions(true);
        try {
          const suggs = await getCoPilotSuggestions(token, conversationId, tone);
          if (active && suggs.length > 0) setSuggestions(suggs);
        } catch {
          // ignore
        } finally {
          if (active) setLoadingSuggestions(false);
        }
      }
    };

    void loadCoPilot();
    return () => {
      active = false;
    };
  }, [conversationId, isOperatorMode, getToken, tone]);

  const handleManualSummary = async () => {
    setLoadingSummary(true);
    try {
      const token = await getToken();
      const sum = await getCoPilotSummary(token, conversationId);
      if (sum) {
        setSummary(sum);
        toast.success("Executive summary generated");
      }
    } catch {
      toast.error("Could not generate summary");
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleManualSuggestions = async (newTone = tone) => {
    setLoadingSuggestions(true);
    try {
      const token = await getToken();
      const suggs = await getCoPilotSuggestions(token, conversationId, newTone);
      if (suggs.length > 0) {
        setSuggestions(suggs);
      }
    } catch {
      toast.error("Could not fetch suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const sentimentColor =
    summary?.sentiment === "positive"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      : summary?.sentiment === "negative"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
      : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";

  return (
    <div className="border-b bg-gradient-to-r from-primary/5 via-primary/10 to-transparent p-3 text-xs transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary shadow-xs">
            <Sparkles className="size-3.5" />
          </div>
          <span className="font-semibold text-foreground tracking-tight flex items-center gap-1.5">
            AI Co-Pilot
            {isOperatorMode && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                Operator Assist
              </Badge>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => void handleManualSummary()}
            disabled={loadingSummary}
          >
            {loadingSummary ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Re-analyze
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse Co-Pilot" : "Expand Co-Pilot"}
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2.5">
          {/* Executive Summary Card */}
          {loadingSummary ? (
            <div className="flex items-center gap-2 py-1 text-muted-foreground animate-pulse">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Analyzing conversation intent and sentiment...</span>
            </div>
          ) : summary ? (
            <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-[11px]">Conversation Summary</span>
                <Badge variant="outline" className={`text-[10px] capitalize ${sentimentColor}`}>
                  {summary.sentiment}
                </Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">{summary.summary}</p>
              {summary.key_details && summary.key_details.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {summary.key_details.map((detail, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Suggested Replies Header & Tone Filter */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
              <MessageSquarePlus className="size-3 text-primary" />
              1-Click Draft Replies:
            </span>

            <div className="flex items-center gap-1">
              {(["friendly", "concise", "formal"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTone(t);
                    void handleManualSuggestions(t);
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] capitalize transition-colors ${
                    tone === t
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Suggested Reply Cards */}
          {loadingSuggestions ? (
            <div className="flex items-center gap-2 py-2 text-muted-foreground animate-pulse">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Crafting grounded responses in {tone} tone...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="grid gap-1.5 sm:grid-cols-3">
              {suggestions.map((text, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onApplyDraft(text);
                    toast.success("Draft inserted into composer");
                  }}
                  className="group relative flex flex-col justify-between rounded-lg border border-border bg-background p-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-xs cursor-pointer"
                >
                  <p className="line-clamp-3 text-muted-foreground group-hover:text-foreground text-[11px] leading-snug">
                    {text}
                  </p>
                  <span className="mt-1.5 text-[10px] text-primary/70 group-hover:text-primary font-medium flex items-center gap-1">
                    Insert Draft &rarr;
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground py-1 text-[11px]">
              No suggestions generated yet. Click &quot;Re-analyze&quot; to generate drafts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
