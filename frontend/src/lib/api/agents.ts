import { toast } from "sonner";
import { API_URL, authHeader, request } from "./client";
import type { Agent, AgentStatus } from "./types";

export const getAgents = (token?: string | null) =>
  request<Agent[]>("/api/agents", { headers: authHeader(token) });

export async function setAgentStatus(
  token: string | null | undefined,
  agentId: string,
  status: AgentStatus
): Promise<Agent | null> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Agent;
  } catch {
    return null;
  }
}

export async function deleteAgent(
  token: string | null | undefined,
  agentId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function createAgent(
  token: string | null | undefined,
  input: { name: string; instructions: string; color: string }
): Promise<Agent | null> {
  try {
    const res = await fetch(`${API_URL}/api/agents`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* keep status text */
      }
      toast.error(`Could not deploy agent: ${detail}`);
      return null;
    }
    return (await res.json()) as Agent;
  } catch {
    toast.error("Network error while deploying agent");
    return null;
  }
}