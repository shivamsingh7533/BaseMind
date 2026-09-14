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

export interface PerAgent {
  id: string;
  name: string;
  color: string;
  queries24h: number;
  conversations: number;
  agentMsgs: number;
  resolved: number;
  avgLatencyMs: number;
}

export interface TrendDay {
  date: string;
  conversations: number;
  agentMsgs: number;
}

export type VectorStatus = "empty" | "syncing" | "attention" | "synced";

export interface DashboardVector {
  embeddings: number;
  indexedDocs: number;
  pendingDocs: number;
  failedDocs: number;
  dim: number;
  status: VectorStatus;
}

export interface DashboardData {
  stats: Stat[];
  activity: ActivityItem[];
  perAgent: PerAgent[];
  trend7d: TrendDay[];
  vector: DashboardVector;
  announcements: Announcement[];
}

export type AgentStatus = "active" | "training" | "paused";

export interface Agent {
  id: string;
  name: string;
  url: string;
  instructions: string;
  color: string;
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
  storageKey?: string;
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
  sources?: { source: string; docId?: string }[];
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

export interface DocumentPreview {
  id: string;
  name: string;
  type: string;
  detail: string;
  preview: string;
}

export type ChatEvent =
  | {
      type: "sources";
      sources: { source: string; docId?: string }[];
    }
  | { type: "token"; token: string }
  | { type: "error"; error: string }
  | { type: "done"; messageId: string | null };

export interface SettingsStatus {
  db_configured: boolean;
  b2_enabled: boolean;
}

export type OpsSeverity = "info" | "attention" | "error";

export interface OpsMetrics {
  users: number;
  agents: number;
  activeAgents: number;
  totalQueries: number;
  queriesToday: number;
  queriesDeltaPct: number | null;
  conversations: number;
  conversationsToday: number;
}

export interface OpsAlert {
  id: string;
  severity: "attention" | "error";
  icon: string;
  text: string;
  time: string;
}

export interface OpsActivityItem {
  id: string;
  kind: "event" | "agent" | "document" | "conversation";
  severity: OpsSeverity;
  icon: string;
  highlight: string;
  text: string;
  time: string;
  at: string;
}

export interface OpsStatus {
  engine: string;
  nominal: boolean;
  generatedAt: string;
  metrics: OpsMetrics;
  vector: DashboardVector;
  alerts: OpsAlert[];
  activity: OpsActivityItem[];
}

export interface GroundingMetric {
  totalMessages: number;
  messagesWithSources: number;
  groundingPct: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "attention" | "error";
  created_at: string;
}

export interface AnnouncementCreate {
  title: string;
  body: string;
  severity: "info" | "attention" | "error";
}