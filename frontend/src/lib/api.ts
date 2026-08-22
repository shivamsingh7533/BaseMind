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

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const getDashboard = () =>
  getJson<DashboardData>("/api/dashboard", db.dashboard);

export const getAgents = () => getJson<Agent[]>("/api/agents", db.agents);

export const getDocuments = () =>
  getJson<KnowledgeDoc[]>("/api/documents", db.documents);

export const getConversations = () =>
  getJson<Conversation[]>("/api/conversations", db.conversations);
