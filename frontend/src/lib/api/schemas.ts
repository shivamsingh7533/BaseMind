import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  instructions: z.string(),
  color: z.string(),
  status: z.enum(["active", "training", "paused"]),
  greetingMessage: z.string().optional(),
  suggestedQuestions: z.array(z.string()).optional(),
  allowedDomains: z.string().optional(),
  leadCaptureEnabled: z.boolean().optional(),
  leadCaptureTitle: z.string().optional(),
  queries24h: z.number(),
  avgLatencyMs: z.number(),
  trainProgress: z.number().nullable().optional(),
});

export const LeadSchema = z.object({
  id: z.string(),
  userId: z.string(),
  agentId: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  company: z.string(),
  message: z.string(),
  status: z.enum(["new", "contacted", "qualified", "closed"]),
  createdAt: z.string(),
});

export const KnowledgeDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  detail: z.string(),
  status: z.enum(["ready", "processing", "failed"]),
  storageKey: z.string().optional(),
});

const CodeBlockSchema = z.object({
  lang: z.string(),
  content: z.string(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "agent", "operator"]),
  text: z.string(),
  senderName: z.string().nullable().optional(),
  code: CodeBlockSchema.optional(),
  time: z.string(),
  latencyNote: z.string().optional(),
  sources: z
    .array(z.object({ source: z.string(), docId: z.string().optional() }))
    .optional(),
  rating: z.number().nullable().optional(),
  feedbackReason: z.string().nullable().optional(),
});

const ConversationCoreSchema = z.object({
  id: z.string(),
  user: z.string(),
  status: z.enum(["resolved", "active", "halted", "needs_human", "in_takeover"]),
  time: z.string(),
  preview: z.string(),
  messageCount: z.number(),
  duration: z.string(),
  startedAt: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
  csatScore: z.number().nullable().optional(),
  handoverRequestedAt: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  messages: z.array(ChatMessageSchema).optional(),
});

export const ConversationSchema = ConversationCoreSchema.transform(
  (data) => ({ ...data, messages: data.messages ?? [] })
);

const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(["info", "attention", "error"]),
  created_at: z.string(),
});

export const DashboardDataSchema = z.object({
  stats: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      delta: z.string().nullable().optional(),
      sub: z.string().optional(),
      progress: z.number().optional(),
    })
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      icon: z.enum(["agent", "sync", "warning"]),
      text: z.string(),
      highlight: z.string(),
      time: z.string(),
    })
  ),
  perAgent: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      queries24h: z.number(),
      conversations: z.number(),
      agentMsgs: z.number(),
      resolved: z.number(),
      avgLatencyMs: z.number(),
    })
  ),
  trend7d: z.array(
    z.object({
      date: z.string(),
      conversations: z.number(),
      agentMsgs: z.number(),
    })
  ),
  vector: z.object({
    embeddings: z.number(),
    indexedDocs: z.number(),
    pendingDocs: z.number(),
    failedDocs: z.number(),
    dim: z.number(),
    status: z.enum(["empty", "syncing", "attention", "synced"]),
  }),
  announcements: z.array(AnnouncementSchema),
});