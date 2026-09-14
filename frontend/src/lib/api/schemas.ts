import { z } from "zod";

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  instructions: z.string(),
  color: z.string(),
  status: z.enum(["active", "training", "paused"]),
  queries24h: z.number(),
  avgLatencyMs: z.number(),
  trainProgress: z.number().optional(),
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
  role: z.enum(["user", "agent"]),
  text: z.string(),
  code: CodeBlockSchema.optional(),
  time: z.string(),
  latencyNote: z.string().optional(),
  sources: z
    .array(z.object({ source: z.string(), docId: z.string().optional() }))
    .optional(),
});

const ConversationCoreSchema = z.object({
  id: z.string(),
  user: z.string(),
  status: z.enum(["resolved", "active", "halted"]),
  time: z.string(),
  preview: z.string(),
  messageCount: z.number(),
  duration: z.string(),
  startedAt: z.string(),
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