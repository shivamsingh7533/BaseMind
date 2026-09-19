import { API_URL, authHeader } from "./client";
import type { Lead, LeadsResponse } from "./types";

export async function getLeads(
  token: string | null | undefined,
  params?: { agentId?: string; status?: string; q?: string }
): Promise<LeadsResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (params?.agentId && params.agentId !== "all") qs.set("agent_id", params.agentId);
    if (params?.status && params.status !== "all") qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);

    const query = qs.toString();
    const url = `${API_URL}/api/leads${query ? `?${query}` : ""}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...authHeader(token),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as LeadsResponse;
  } catch {
    return null;
  }
}

export async function updateLead(
  token: string | null | undefined,
  leadId: string,
  data: Partial<Lead>
): Promise<Lead | null> {
  try {
    const res = await fetch(`${API_URL}/api/leads/${leadId}`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as Lead;
  } catch {
    return null;
  }
}

export async function deleteLead(
  token: string | null | undefined,
  leadId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/leads/${leadId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function exportLeadsCsv(
  token: string | null | undefined
): Promise<Blob | null> {
  try {
    const res = await fetch(`${API_URL}/api/leads/export`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function submitPublicLead(
  agentId: string,
  data: {
    name?: string;
    email: string;
    phone?: string;
    company?: string;
    message?: string;
    conversation_id?: string | null;
  }
): Promise<Lead | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/agents/${agentId}/leads`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as Lead;
  } catch {
    return null;
  }
}
