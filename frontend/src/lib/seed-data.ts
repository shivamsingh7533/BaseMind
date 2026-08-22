import type {
  Agent,
  Conversation,
  DashboardData,
  KnowledgeDoc,
} from "@/lib/api";
export const db: {
  dashboard: DashboardData;
  agents: Agent[];
  documents: KnowledgeDoc[];
  conversations: Conversation[];
} = {
  dashboard: {
    stats: [
      {
        id: "conversations",
        label: "Total Conversations",
        value: "1,248",
        delta: "+12%",
        sub: "vs last week",
      },
      {
        id: "agents",
        label: "Active Agents",
        value: "3",
        delta: "+1",
        sub: "1 training",
      },
      {
        id: "credits",
        label: "Credits Used",
        value: "45,000",
        sub: "Approaching limit (50k)",
        progress: 90,
      },
    ],
    activity: [
      {
        id: "a1",
        icon: "agent",
        text: "processed 142 queries.",
        highlight: "SupportBot",
        time: "2 mins ago",
      },
      {
        id: "a2",
        icon: "sync",
        text: "Knowledge base updated.",
        highlight: "Q3_Docs",
        time: "1 hour ago",
      },
      {
        id: "a3",
        icon: "warning",
        text: "triggered.",
        highlight: "API Rate limit warning",
        time: "3 hours ago",
      },
    ],
  },
  agents: [
    {
      id: "ag-1",
      name: "Customer Success Bot",
      url: "support.acmecorp.com",
      status: "active",
      queries24h: 1204,
      avgLatencyMs: 420,
    },
    {
      id: "ag-2",
      name: "Internal Dev Docs",
      url: "docs.internal.net",
      status: "active",
      queries24h: 342,
      avgLatencyMs: 210,
    },
    {
      id: "ag-3",
      name: "Sales Assistant V2",
      url: "crm.acmecorp.com",
      status: "training",
      queries24h: 0,
      avgLatencyMs: 0,
      trainProgress: 84,
    },
  ],
  documents: [
    {
      id: "doc-1",
      name: "API_Documentation_v2.pdf",
      type: "PDF Document",
      detail: "Uploaded just now",
      status: "ready",
    },
    {
      id: "doc-2",
      name: "https://docs.basemind.ai/guides",
      type: "Web Scrape",
      detail: "Crawling 42 pages",
      status: "processing",
    },
    {
      id: "doc-3",
      name: "legacy_customer_data.csv",
      type: "CSV File",
      detail: "Format unsupported",
      status: "failed",
    },
  ],
  conversations: [
    {
      id: "cnv-1",
      user: "USR-7A9B",
      status: "resolved",
      time: "10:42 AM",
      preview:
        "I need help configuring the embedding model for my custom dataset.",
      messageCount: 8,
      duration: "4m 12s",
      startedAt: "10:42 AM",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "I need help configuring the embedding model for my custom dataset. I'm currently using OpenAI but want to switch to local embeddings.",
          time: "10:42:15 AM",
        },
        {
          id: "m2",
          role: "agent",
          text: "Switching to local embeddings can improve privacy and reduce costs. To configure this in BaseMind, you'll need to update your agent's configuration YAML.\n\nHere is the required configuration block:",
          code: {
            lang: "yaml",
            content:
              "embeddings:\n  provider: local\n  model: all-MiniLM-L6-v2\n  chunk_size: 512\n  overlap: 50",
          },
          time: "10:42:18 AM",
          latencyNote: "3s latency",
        },
        {
          id: "m3",
          role: "user",
          text: "Yes please, and how long does re-indexing usually take for ~10k documents?",
          time: "10:43:02 AM",
        },
        {
          id: "m4",
          role: "agent",
          text: 'Go to **Knowledge > Settings > Advanced** and paste it in the "Vector DB Config" editor.\n\nFor 10,000 documents with `all-MiniLM-L6-v2` running locally, re-indexing typically takes between **5 to 15 minutes** depending on your host machine\'s CPU.',
          time: "10:43:05 AM",
          latencyNote: "3s latency",
        },
      ],
    },
    {
      id: "cnv-2",
      user: "USR-2K1M",
      status: "active",
      time: "09:15 AM",
      preview: "Why is the agent returning empty responses?",
      messageCount: 12,
      duration: "1m 30s",
      startedAt: "09:15 AM",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "Why is the agent returning empty responses?",
          time: "09:15:10 AM",
        },
        {
          id: "m2",
          role: "agent",
          text: "Empty responses usually mean the retrieval step found no relevant chunks. Could you share which document collection your agent is pointed at?",
          time: "09:15:14 AM",
          latencyNote: "4s latency",
        },
      ],
    },
    {
      id: "cnv-3",
      user: "USR-9P4R",
      status: "halted",
      time: "Yesterday",
      preview: "API_RATE_LIMIT_EXCEEDED",
      messageCount: 4,
      duration: "0m 48s",
      startedAt: "Yesterday",
      messages: [
        {
          id: "m1",
          role: "user",
          text: "Can you summarize my last invoice?",
          time: "16:20:01 PM",
        },
        {
          id: "m2",
          role: "agent",
          text: "API_RATE_LIMIT_EXCEEDED — monthly message quota reached. Please upgrade your plan or wait for the next billing cycle.",
          time: "16:20:02 PM",
          latencyNote: "1s latency",
        },
      ],
    },
  ],
};
