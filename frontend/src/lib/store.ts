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
import { handleApiError } from "./api/client";

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
      try {
        const data = await getDashboard(token);
        set((s) => ({
          dashboard: data,
          _ts: { ...s._ts, dashboard: Date.now() },
        }));
      } catch (err) {
        handleApiError(err, "Kya baat hai — dashboard load nahi hua");
        set((s) => ({ dashboard: null, _ts: { ...s._ts, dashboard: Date.now() } }));
      }
    }
    return get().dashboard as DashboardData;
  },

  fetchAgents: async (token) => {
    const state = get();
    const fresh =
      state.agents !== null && Date.now() - (state._ts.agents ?? 0) < TTL_MS;
    if (!fresh) {
      try {
        const data = await getAgents(token);
        set((s) => ({ agents: data, _ts: { ...s._ts, agents: Date.now() } }));
      } catch (err) {
        handleApiError(err, "Agents load nahi hue");
        set((s) => ({ agents: null, _ts: { ...s._ts, agents: Date.now() } }));
      }
    }
    return get().agents as Agent[];
  },

  fetchDocuments: async (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.documents !== null &&
      Date.now() - (state._ts.documents ?? 0) < TTL_MS;
    if (!fresh) {
      try {
        const data = await getDocuments(token);
        set((s) => ({
          documents: data,
          _ts: { ...s._ts, documents: Date.now() },
        }));
      } catch (err) {
        handleApiError(err, "Documents load nahi hue");
        set((s) => ({
          documents: null,
          _ts: { ...s._ts, documents: Date.now() },
        }));
      }
    }
    return get().documents as KnowledgeDoc[];
  },

  fetchConversations: async (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.conversations !== null &&
      Date.now() - (state._ts.conversations ?? 0) < TTL_MS;
    if (!fresh) {
      try {
        const data = await getConversations(token);
        set((s) => ({
          conversations: data,
          _ts: { ...s._ts, conversations: Date.now() },
        }));
      } catch (err) {
        handleApiError(err, "Conversations load nahi hue");
        set((s) => ({
          conversations: null,
          _ts: { ...s._ts, conversations: Date.now() },
        }));
      }
    }
    return get().conversations as Conversation[];
  },

  reset: () =>
    set({ dashboard: null, agents: null, documents: null, conversations: null, _ts: {} }),
}));
