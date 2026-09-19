import { toast } from "sonner";
import { API_URL, authHeader, request } from "./client";
import { AgentSchema } from "./schemas";
import type { Agent, AgentStatus } from "./types";

export const getAgents = (token?: string | null) =>
  request<Agent[]>("/api/agents", {
    headers: authHeader(token),
    schema: AgentSchema.array(),
  });

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

export async function updateAgent(
  token: string | null | undefined,
  agentId: string,
  input: {
    name?: string;
    instructions?: string;
    color?: string;
    status?: AgentStatus;
    greeting_message?: string;
    suggested_questions?: string[];
    allowed_domains?: string;
    lead_capture_enabled?: boolean;
    lead_capture_title?: string;
  }
): Promise<Agent | null> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      toast.error("Failed to update agent");
      return null;
    }
    return (await res.json()) as Agent;
  } catch {
    toast.error("Network error updating agent");
    return null;
  }
}

export async function getPublicAgent(agentId: string) {
  try {
    const res = await fetch(`${API_URL}/api/public/agents/${agentId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      id: string;
      name: string;
      color: string;
      greetingMessage: string;
      suggestedQuestions: string[];
      leadCaptureEnabled?: boolean;
      leadCaptureTitle?: string;
      status: string;
    };
  } catch {
    return null;
  }
}

export async function createPublicConversation(
  agentId: string,
  visitor?: string
): Promise<{ id: string; visitor: string; agentId: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/agents/${agentId}/conversations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visitor: visitor || "Visitor" }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; visitor: string; agentId: string };
  } catch {
    return null;
  }
}