import { API_URL, authHeader } from "./client";
import type {
  Announcement,
  AnnouncementCreate,
  GroundingMetric,
  OpsStatus,
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