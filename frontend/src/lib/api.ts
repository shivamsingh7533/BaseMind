import { db } from "@/lib/seed-data";

export interface Stat {
  id: string;
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  progress?: number;
}

export interface ActivityItem {
  id: string;
  icon: "agent" | "sync" | "warning";
  text: string;
  highlight: string;
  time: string;
}

export interface DashboardData {
  stats: Stat[];
  activity: ActivityItem[];
}

export type AgentStatus = "active" | "training" | "paused";

export interface Agent {
  id: string;
  name: string;
  url: string;
  status: AgentStatus;
  queries24h: number;
  avgLatencyMs: number;
  trainProgress?: number;
}

export type DocStatus = "ready" | "processing" | "failed";

export interface KnowledgeDoc {
  id: string;
  name: string;
  type: string;
  detail: string;
  status: DocStatus;
}

export interface CodeBlock {
  lang: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  code?: CodeBlock;
  time: string;
  latencyNote?: string;
}

export type ConversationStatus = "resolved" | "active" | "halted";

export interface Conversation {
  id: string;
  user: string;
  status: ConversationStatus;
  time: string;
  preview: string;
  messageCount: number;
  duration: string;
  startedAt: string;
  messages: ChatMessage[];
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  fallback: T,
  options: RequestInit = {}
): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getDashboard = (token?: string | null) =>
  request<DashboardData>("/api/dashboard", db.dashboard, {
    headers: authHeader(token),
  });

export const getAgents = (token?: string | null) =>
  request<Agent[]>("/api/agents", db.agents, { headers: authHeader(token) });

export const getDocuments = (token?: string | null) =>
  request<KnowledgeDoc[]>("/api/documents", db.documents, {
    headers: authHeader(token),
  });

export const getConversations = (token?: string | null) =>
  request<Conversation[]>("/api/conversations", db.conversations, {
    headers: authHeader(token),
  });

export type ChatEvent =
  | { type: "sources"; sources: { source: string }[] }
  | { type: "token"; token: string }
  | { type: "error"; error: string }
  | { type: "done"; messageId: string | null };

export async function createConversation(
  token?: string | null
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/conversations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ visitor: "Studio Test" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Conversation;
    return data.id;
  } catch {
    return null;
  }
}

export async function streamChat(
  token: string | null | undefined,
  conversationId: string,
  text: string,
  onEvent: (event: ChatEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ text, role: "user" }),
    });
  } catch {
    onEvent({ type: "error", error: "Network error" });
    return;
  }
  if (!res.ok || !res.body) {
    onEvent({
      type: "error",
      error: res.status === 503 ? "AI not configured" : `HTTP ${res.status}`,
    });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatEvent);
      } catch {
        /* skip malformed frame */
      }
    }
  }
}
