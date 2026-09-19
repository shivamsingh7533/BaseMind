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

const inFlight: Record<string, Promise<unknown> | undefined> = {};

interface AppDataState {
  dashboard: DashboardData | null;
  agents: Agent[] | null;
  documents: KnowledgeDoc[] | null;
  conversations: Conversation[] | null;
  _ts: Record<string, number>;
  fetchDashboard: (token?: string | null, force?: boolean) => Promise<DashboardData | null>;
  fetchAgents: (token?: string | null, force?: boolean) => Promise<Agent[] | null>;

  fetchDocuments: (
    token?: string | null,
    force?: boolean
  ) => Promise<KnowledgeDoc[] | null>;
  fetchConversations: (
    token?: string | null,
    force?: boolean
  ) => Promise<Conversation[] | null>;
  reset: () => void;
}

export const useAppData = create<AppDataState>((set, get) => ({
  dashboard: null,
  agents: null,
  documents: null,
  conversations: null,
  _ts: {},

  fetchDashboard: async (token: string | null | undefined, force = false) => {
    const state = get();
    const fresh =
      !force &&
      state.dashboard !== null &&
      Date.now() - (state._ts.dashboard ?? 0) < TTL_MS;
    if (fresh) return state.dashboard;
    if (inFlight.dashboard) return inFlight.dashboard as Promise<DashboardData | null>;
    const p = (async () => {
      try {
        const data = await getDashboard(token);
        set((s) => ({
          dashboard: data,
          _ts: { ...s._ts, dashboard: Date.now() },
        }));
        return data;
      } catch (err) {
        handleApiError(err, "Dashboard load failed");
        set((s) => ({ dashboard: null, _ts: { ...s._ts, dashboard: Date.now() } }));
        return null;
      } finally {
        delete inFlight.dashboard;
      }
    })();
    inFlight.dashboard = p;
    return p;
  },

  fetchAgents: async (token, force = false) => {
    const state = get();
    const fresh = !force && state.agents !== null && Date.now() - (state._ts.agents ?? 0) < TTL_MS;
    if (fresh) return state.agents;
    if (inFlight.agents) return inFlight.agents as Promise<Agent[] | null>;
    const p = (async () => {
      try {
        const data = await getAgents(token);
        set((s) => ({ agents: data, _ts: { ...s._ts, agents: Date.now() } }));
        return data;
      } catch (err) {
        handleApiError(err, "Agents load failed");
        set((s) => ({ agents: null, _ts: { ...s._ts, agents: Date.now() } }));
        return null;
      } finally {
        delete inFlight.agents;
      }
    })();
    inFlight.agents = p;
    return p;
  },

  fetchDocuments: async (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.documents !== null &&
      Date.now() - (state._ts.documents ?? 0) < TTL_MS;
    if (fresh) return state.documents;
    if (inFlight.documents)
      return inFlight.documents as Promise<KnowledgeDoc[] | null>;
    const p = (async () => {
      try {
        const data = await getDocuments(token);
        set((s) => ({
          documents: data,
          _ts: { ...s._ts, documents: Date.now() },
        }));
        return data;
      } catch (err) {
        handleApiError(err, "Documents load failed");
        set((s) => ({
          documents: null,
          _ts: { ...s._ts, documents: Date.now() },
        }));
        return null;
      } finally {
        delete inFlight.documents;
      }
    })();
    inFlight.documents = p;
    return p;
  },

  fetchConversations: async (token?: string | null, force?: boolean) => {
    const state = get();
    const fresh =
      !force &&
      state.conversations !== null &&
      Date.now() - (state._ts.conversations ?? 0) < TTL_MS;
    if (fresh) return state.conversations;
    if (inFlight.conversations)
      return inFlight.conversations as Promise<Conversation[] | null>;
    const p = (async () => {
      try {
        const data = await getConversations(token);
        set((s) => ({
          conversations: data,
          _ts: { ...s._ts, conversations: Date.now() },
        }));
        return data;
      } catch (err) {
        handleApiError(err, "Conversations load failed");
        set((s) => ({
          conversations: null,
          _ts: { ...s._ts, conversations: Date.now() },
        }));
        return null;
      } finally {
        delete inFlight.conversations;
      }
    })();
    inFlight.conversations = p;
    return p;
  },

  reset: () =>
    set({ dashboard: null, agents: null, documents: null, conversations: null, _ts: {} }),
}));