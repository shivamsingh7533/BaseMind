export interface Stat {
  id: string;
  label: string;
  value: string;
  delta?: string | null;
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
  trainProgress?: number | null;
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

export interface BillingStatus {
  plan: "free" | "pro";
  status: string;
  current_period_end: string | null;
  razorpay_configured: boolean;
}

export interface CheckoutResponse {
  url: string;
  subscription_id: string;
  key_id: string;
  interval: "monthly" | "annual";
  demo?: boolean;
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

export interface OpsTenant {
  user_id: string;
  email: string;
  name: string;
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  platform_status: string;
  agents: number;
  documents: number;
  docTypeCounts: Record<string, number>;
  pendingDocs: number;
  failedDocs: number;
  conversations: number;
  queriesToday: number;
  createdAt: string;
}

export interface OpsAgent {
  id: string;
  name: string;
  ownerEmail: string | null;
  queries24h: number;
  status: string;
  active: boolean;
  avgLatencyMs: number;
  isSlow: boolean;
}

export interface OpsDocumentsStats {
  totalDocs: number;
  readyDocs: number;
  pendingDocs: number;
  failedDocs: number;
  embeddings: number;
  typeCounts: Record<string, number>;
}

export interface OpsTrendPoint {
  date: string;
  queries: number;
  conversations: number;
  newUsers: number;
  newAgents: number;
}

export interface OpsErrorRecent {
  id: string;
  event_type: string;
  severity: string;
  detail: string;
  created_at: string;
}

export interface OpsErrorsData {
  counts24h: Record<string, number>;
  counts7d: Record<string, number>;
  recent: OpsErrorRecent[];
}