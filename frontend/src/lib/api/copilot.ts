import { API_URL, authHeader } from "./client";
import type { CoPilotSuggestions, CoPilotSummary } from "./types";

export async function getCoPilotSummary(
  token: string | null | undefined,
  conversationId: string
): Promise<CoPilotSummary | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/conversations/${conversationId}/copilot/summary`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader(token),
        },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as CoPilotSummary;
  } catch {
    return null;
  }
}

export async function getCoPilotSuggestions(
  token: string | null | undefined,
  conversationId: string,
  tone: "friendly" | "concise" | "formal" = "friendly"
): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/conversations/${conversationId}/copilot/suggest`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader(token),
        },
        body: JSON.stringify({ tone }),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as CoPilotSuggestions;
    return data.suggestions || [];
  } catch {
    return [];
  }
}
