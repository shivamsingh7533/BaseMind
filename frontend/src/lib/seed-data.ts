import type {
  ActivityItem,
  Agent,
  Conversation,
  DashboardData,
  KnowledgeDoc,
  Stat,
} from "@/lib/api";

export const db: {
  dashboard: DashboardData;
  agents: Agent[];
  documents: KnowledgeDoc[];
  conversations: Conversation[];
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
};
