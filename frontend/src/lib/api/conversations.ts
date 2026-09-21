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
  onEvent: (event: ChatEvent) => void,
  options?: { image_base64?: string; image_mime_type?: string }
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
      body: JSON.stringify({
        text,
        role: "user",
        image_base64: options?.image_base64,
        image_mime_type: options?.image_mime_type,
      }),
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

export async function getPublicConversation(
  conversationId: string
): Promise<Conversation | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/conversations/${conversationId}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Conversation;
  } catch {
    return null;
  }
}

export async function streamPublicChat(
  conversationId: string,
  text: string,
  onEvent: (event: ChatEvent) => void,
  options?: { image_base64?: string; image_mime_type?: string }
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/public/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        role: "user",
        image_base64: options?.image_base64,
        image_mime_type: options?.image_mime_type,
      }),
    });
  } catch {
    onEvent({ type: "error", error: "Network error" });
    return;
  }
  if (!res.ok || !res.body) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { detail?: string };
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {
      /* ignore */
    }
    onEvent({
      type: "error",
      error: errorDetail,
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

export async function takeoverConversation(
  token: string | null | undefined,
  conversationId: string
): Promise<Conversation | null> {
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}/takeover`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader(token),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as Conversation;
  } catch {
    return null;
  }
}

export async function returnConversationToAI(
  token: string | null | undefined,
  conversationId: string
): Promise<Conversation | null> {
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}/return-to-ai`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader(token),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as Conversation;
  } catch {
    return null;
  }
}

export async function sendOperatorMessage(
  token: string | null | undefined,
  conversationId: string,
  text: string,
  senderName?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({
        role: "operator",
        text,
        sender_name: senderName,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestPublicHandover(
  conversationId: string
): Promise<{ status: string; handoverRequestedAt: string | null; message: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/conversations/${conversationId}/handover`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}