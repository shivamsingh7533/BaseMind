import { API_URL, authHeader } from "./client";
import type { SettingsStatus } from "./types";

export async function getSettingsStatus(
  token?: string | null
): Promise<SettingsStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/settings/status`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as SettingsStatus;
  } catch {
    return null;
  }
}

export async function deleteWorkspace(
  token?: string | null
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/me`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    if (res.ok || res.status === 204) return { ok: true };
    try {
      const body = (await res.json()) as { detail?: string };
      return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    } catch {
      return { ok: false, detail: `HTTP ${res.status}` };
    }
  } catch {
    return { ok: false, detail: "Network error" };
  }
}