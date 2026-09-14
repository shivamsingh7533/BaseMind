import { API_URL, authHeader, request } from "./client";
import { ConversationSchema } from "./schemas";
import type { ChatEvent, Conversation, ConversationStatus } from "./types";

export const getConversations = (token?: string | null) =>
  request<Conversation[]>("/api/conversations", {
    headers: authHeader(token),
    schema: ConversationSchema.array(),
  });

export const getConversation = (
  token?: string | null,
  conversationId?: string | null
) =>
  request<Conversation | null>(
    `/api/conversations/${conversationId}`,
    {
      headers: authHeader(token),
      schema: ConversationSchema.nullable(),
    }
  );

export async function updateConversationStatus(
  token: string | null | undefined,
  conversationId: string,
  status: ConversationStatus
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteConversation(
  token?: string | null,
  conversationId?: string | null
): Promise<boolean> {
  if (!conversationId) return false;
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function createConversation(
  token?: string | null,
  agentId?: string | null,
  visitor?: string
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/conversations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({
        visitor: visitor ?? "Studio Test",
        ...(agentId ? { agent_id: agentId } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Conversation;
    return data.id;
  } catch {
    return null;
  }
}

export async function streamChat(
  token: string | null | undefined,
  conversationId: string,
  text: string,
  onEvent: (event: ChatEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({ text, role: "user" }),
    });
  } catch {
    onEvent({ type: "error", error: "Network error" });
    return;
  }
  if (!res.ok || !res.body) {
    onEvent({
      type: "error",
      error: res.status === 503 ? "AI not configured" : `HTTP ${res.status}`,
    });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatEvent);
      } catch {
        /* skip malformed frame */
      }
    }
  }
}