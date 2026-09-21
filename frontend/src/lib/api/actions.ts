import { API_URL, authHeader } from "./client";
import type {
  AgentAction,
  AgentActionCreatePayload,
  AgentActionUpdatePayload,
} from "./types";

export async function getAgentActions(
  token: string | null | undefined,
  agentId: string
): Promise<AgentAction[]> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}/actions`, {
      headers: authHeader(token),
    });
    if (!res.ok) return [];
    return (await res.json()) as AgentAction[];
  } catch {
    return [];
  }
}

export async function createAgentAction(
  token: string | null | undefined,
  agentId: string,
  payload: AgentActionCreatePayload
): Promise<AgentAction | null> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}/actions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentAction;
  } catch {
    return null;
  }
}

export async function updateAgentAction(
  token: string | null | undefined,
  actionId: string,
  payload: AgentActionUpdatePayload
): Promise<AgentAction | null> {
  try {
    const res = await fetch(`${API_URL}/api/actions/${actionId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentAction;
  } catch {
    return null;
  }
}

export async function deleteAgentAction(
  token: string | null | undefined,
  actionId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/actions/${actionId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function testAgentAction(
  token: string | null | undefined,
  actionId: string,
  parameters: Record<string, unknown>
): Promise<{
  status: string;
  statusCode: number;
  latencyMs: number;
  response?: unknown;
  error?: string;
} | null> {
  try {
    const res = await fetch(`${API_URL}/api/actions/${actionId}/test`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ parameters }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
