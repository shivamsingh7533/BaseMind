import type {
  ActivityItem,
  Agent,
  Conversation,
  DashboardData,
  KnowledgeDoc,
  OpsStatus,
  Stat,
} from "@/lib/api";

export const db: {
  dashboard: DashboardData;
  agents: Agent[];
  documents: KnowledgeDoc[];
  conversations: Conversation[];
  ops: OpsStatus;
} = {
  dashboard: {
    stats: [] as Stat[],
    activity: [] as ActivityItem[],
    perAgent: [],
    trend7d: [],
    vector: {
      embeddings: 0,
      indexedDocs: 0,
      pendingDocs: 0,
      failedDocs: 0,
      dim: 768,
      status: "empty",
    },
  },
  agents: [],
  documents: [],
  conversations: [],
  ops: {
    engine: "3.4",
    nominal: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      users: 0,
      agents: 0,
      activeAgents: 0,
      totalQueries: 0,
      queriesToday: 0,
      queriesDeltaPct: null,
      conversations: 0,
      conversationsToday: 0,
    },
    vector: {
      embeddings: 0,
      indexedDocs: 0,
      pendingDocs: 0,
      failedDocs: 0,
      dim: 768,
      status: "empty",
    },
    alerts: [],
    activity: [],
  },
};
