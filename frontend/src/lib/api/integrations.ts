import { API_URL, authHeader } from "./client";
import type { AgentIntegration, IntegrationInput } from "./types";

export async function getAgentIntegrations(
  token: string | null | undefined,
  agentId: string
): Promise<AgentIntegration[]> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}/integrations`, {
      headers: {
        Accept: "application/json",
        ...authHeader(token),
      },
    });
    if (!res.ok) return [];
    return (await res.json()) as AgentIntegration[];
  } catch {
    return [];
  }
}

export async function saveAgentIntegration(
  token: string | null | undefined,
  agentId: string,
  data: IntegrationInput
): Promise<AgentIntegration | null> {
  try {
    const res = await fetch(`${API_URL}/api/agents/${agentId}/integrations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentIntegration;
  } catch {
    return null;
  }
}

export async function deleteAgentIntegration(
  token: string | null | undefined,
  agentId: string,
  integrationId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/api/agents/${agentId}/integrations/${integrationId}`,
      {
        method: "DELETE",
        headers: authHeader(token),
      }
    );
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function triggerIntegrationTest(
  token: string | null | undefined,
  agentId: string,
  integrationId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(
      `${API_URL}/api/agents/${agentId}/integrations/${integrationId}/test`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...authHeader(token),
        },
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, message: data.detail || "Integration test failed" };
    }
    return { ok: true, message: data.message || "Test message sent!" };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Network error testing integration",
    };
  }
}

export async function setTelegramWebhook(
  token: string | null | undefined,
  agentId: string,
  integrationId: string
): Promise<{ ok: boolean; message: string; telegram_response?: unknown }> {
  try {
    const res = await fetch(
      `${API_URL}/api/agents/${agentId}/integrations/${integrationId}/set-telegram-webhook`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...authHeader(token),
        },
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, message: data.detail || "Failed to set Telegram webhook" };
    }
    return {
      ok: true,
      message: data.message || "Telegram webhook configured successfully!",
      telegram_response: data.telegram_response,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Network error registering Telegram webhook",
    };
  }
}

