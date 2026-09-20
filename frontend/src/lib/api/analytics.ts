import { API_URL, authHeader, request } from "./client";
import type {
  AnalyticsOverview,
  ChatMessage,
  KnowledgeGap,
  KnowledgeGapUpdateInput,
  MessageFeedbackInput,
} from "./types";

export async function getAnalyticsOverview(
  token?: string | null,
  days: number = 14
): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>(`/api/analytics/overview?days=${days}`, {
    headers: authHeader(token),
  });
}

export async function getKnowledgeGaps(
  token?: string | null,
  params?: {
    agent_id?: string;
    status?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ gaps: KnowledgeGap[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.agent_id) q.set("agent_id", params.agent_id);
  if (params?.status) q.set("status", params.status);
  if (params?.q) q.set("q", params.q);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));

  const qs = q.toString();
  return request<{ gaps: KnowledgeGap[]; total: number }>(
    `/api/analytics/knowledge-gaps${qs ? `?${qs}` : ""}`,
    {
      headers: authHeader(token),
    }
  );
}

export async function updateKnowledgeGap(
  token: string | null | undefined,
  gapId: string,
  payload: KnowledgeGapUpdateInput
): Promise<KnowledgeGap> {
  return request<KnowledgeGap>(`/api/analytics/knowledge-gaps/${gapId}`, {
    method: "PATCH",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
}

export async function deleteKnowledgeGap(
  token: string | null | undefined,
  gapId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/analytics/knowledge-gaps/${gapId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function submitMessageFeedback(
  token: string | null | undefined,
  conversationId: string,
  messageId: string,
  payload: MessageFeedbackInput
): Promise<ChatMessage> {
  return request<ChatMessage>(
    `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
    {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(payload),
    }
  );
}

export async function submitPublicFeedback(
  messageId: string,
  payload: MessageFeedbackInput
): Promise<ChatMessage> {
  const res = await fetch(`${API_URL}/api/public/messages/${messageId}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to submit feedback (${res.status})`);
  }
  return res.json();
}
