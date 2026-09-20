import type { ConversationStatus } from "@/lib/api";

export const STATUS: Record<
  ConversationStatus,
  { label: string; dot: string; badge: string }
> = {
  resolved: {
    label: "Resolved",
    dot: "bg-success",
    badge: "bg-success/10 text-success border-transparent",
  },
  active: {
    label: "Active AI",
    dot: "bg-primary animate-pulse",
    badge: "bg-primary/10 text-primary border-transparent",
  },
  halted: {
    label: "Halted",
    dot: "bg-destructive",
    badge: "bg-destructive/10 text-destructive border-transparent",
  },
  needs_human: {
    label: "Needs Human",
    dot: "bg-amber-500 animate-ping",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  in_takeover: {
    label: "In Takeover",
    dot: "bg-indigo-500 animate-pulse",
    badge: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  },
};

export type SourceRef = { source: string; docId?: string };

export function chipsFrom(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+\S/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const PENDING_ID = "assistant-pending";