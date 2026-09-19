import { API_URL, authHeader, request } from "./client";
import type {
  Announcement,
  AnnouncementCreate,
  GroundingMetric,
  OpsAgent,
  OpsDocumentsStats,
  OpsErrorsData,
  OpsStatus,
  OpsTenant,
  OpsTrendPoint,
} from "./types";

export async function fetchOpsStatus(
  token?: string | null
): Promise<OpsStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/ops/status`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as OpsStatus;
  } catch {
    return null;
  }
}

export async function checkIsOperator(
  token?: string | null,
  userEmail?: string | null,
  userName?: string | null,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      ...authHeader(token),
    };
    if (userEmail) headers["X-User-Email"] = userEmail;
    if (userName) headers["X-User-Name"] = userName;
    const res = await fetch(`${API_URL}/api/ops/check`, {
      headers,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { is_operator?: boolean };
    return Boolean(data.is_operator);
  } catch {
    return false;
  }
}

export async function fetchGroundingMetric(
  token?: string | null
): Promise<GroundingMetric | null> {
  try {
    const res = await fetch(`${API_URL}/api/ops/grounding`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as GroundingMetric;
  } catch {
    return null;
  }
}

export async function fetchAnnouncements(
  token?: string | null
): Promise<Announcement[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/ops/announcements`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as Announcement[];
  } catch {
    return null;
  }
}

export async function createAnnouncement(
  data: AnnouncementCreate,
  token?: string | null
): Promise<{ status: string; id: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/ops/announcements`, {
      method: "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status: string; id: string };
  } catch {
    return null;
  }
}

export async function markAnnouncementRead(
  token: string | null | undefined,
  announcementId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/api/announcements/${announcementId}/read`,
      {
        method: "PATCH",
        headers: authHeader(token),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export const fetchOpsTenants = async (token?: string | null) =>
  request<OpsTenant[]>("/api/ops/tenants", {
    headers: authHeader(token),
  }).catch(() => null);

export const fetchOpsAgents = async (token?: string | null) =>
  request<OpsAgent[]>("/api/ops/agents", {
    headers: authHeader(token),
  }).catch(() => null);

export const fetchOpsDocuments = async (token?: string | null) =>
  request<OpsDocumentsStats>("/api/ops/documents", {
    headers: authHeader(token),
  }).catch(() => null);

export const fetchOpsTrends = async (token?: string | null) =>
  request<OpsTrendPoint[]>("/api/ops/trends", {
    headers: authHeader(token),
  }).catch(() => null);

export const fetchOpsErrors = async (token?: string | null) =>
  request<OpsErrorsData>("/api/ops/errors", {
    headers: authHeader(token),
  }).catch(() => null);

export async function updateOpsAgent(
  token: string | null | undefined,
  agentId: string,
  changes: { status?: string; name?: string; instructions?: string; color?: string }
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ops/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, detail: "Network error updating agent" };
  }
}

export async function sendOperatorAlert(
  token: string | null | undefined,
  subject: string,
  html?: string
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ops/alert`, {
      method: "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, html }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, detail: "Network error sending alert" };
  }
}