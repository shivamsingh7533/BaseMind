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
  dashboard: { stats: [] as Stat[], activity: [] as ActivityItem[] },
  agents: [],
  documents: [],
  conversations: [],
};
