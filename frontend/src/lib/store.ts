import { create } from "zustand";
import {
  getAgents,
  getConversations,
  getDashboard,
  getDocuments,
  type Agent,
  type Conversation,
  type DashboardData,
  type KnowledgeDoc,
} from "./api";

const TTL_MS = 30_000;

interface AppDataState {
  dashboard: DashboardData | null;
  agents: Agent[] | null;
  documents: KnowledgeDoc[] | null;
  conversations: Conversation[] | null;
  _ts: Record<string, number>;
  fetchDashboard: (token?: string | null) => Promise<DashboardData>;
  fetchAgents: (token?: string | null) => Promise<Agent[]>;
  fetchDocuments: (
    token?: string | null,
    force?: boolean
  ) => Promise<KnowledgeDoc[]>;
  fetchConversations: (
    token?: string | null,
    force?: boolean
  ) => Promise<Conversation[]>;
  reset: () => void;
}

export const useAppData = create<AppDataState>((set, get) => ({
  dashboard: null,
  agents: null,
  documents: null,
  conversations: null,
  _ts: {},

  fetchDashboard: async (token) => {
    const state = get();
    const fresh =
      state.dashboard !== null &&
      Date.now() - (state._ts.dashboard ?? 0) < TTL_MS;
    if (!fresh) {
      const data = await getDashboard(token);
      set((s) => ({
        dashboard: data,
        _ts: { ...s._ts, dashboard: Date.now() },
      }));
    }
    return get().dashboard as DashboardData;
  },

  fetchAgents: async (token) => {
    const state = get();
    const fresh =
      state.agents !== null && Date.now() - (state._ts.agents ?? 0) < TTL_MS;
    if (!fresh) {
      const data = await getAgents(token);
      set((s) => ({ agents: data, _ts: { ...s._ts, agents: Date.now() } }));
    }
    return get().agents as Agent[];
  },

  fetchDocuments: (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.documents !== null &&
      Date.now() - (state._ts.documents ?? 0) < TTL_MS;
    if (!fresh) {
      return getDocuments(token).then((data) => {
        set((s) => ({
          documents: data,
          _ts: { ...s._ts, documents: Date.now() },
        }));
        return data;
      });
    }
    return Promise.resolve(get().documents as KnowledgeDoc[]);
  },

  fetchConversations: (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.conversations !== null &&
      Date.now() - (state._ts.conversations ?? 0) < TTL_MS;
    if (!fresh) {
      return getConversations(token).then((data) => {
        set((s) => ({
          conversations: data,
          _ts: { ...s._ts, conversations: Date.now() },
        }));
        return data;
      });
    }
    return Promise.resolve(get().conversations as Conversation[]);
  },

  reset: () =>
    set({ dashboard: null, agents: null, documents: null, conversations: null, _ts: {} }),
}));
