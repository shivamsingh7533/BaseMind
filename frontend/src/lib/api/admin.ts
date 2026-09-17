import { API_URL, authHeader, request } from "./client";
import type { OpsTenant } from "./types";

export const fetchAdminUsers = async (token?: string | null) =>
  request<OpsTenant[]>("/api/ops/tenants", {
    headers: authHeader(token),
  }).catch(() => null);

export async function updateAdminUser(
  token: string | null | undefined,
  userId: string,
  changes: { plan?: "free" | "pro"; status?: "active" | "suspended" }
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ops/users/${userId}`, {
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
    return { ok: false, detail: "Network error" };
  }
}

export async function deleteAdminUser(
  token: string | null | undefined,
  userId: string
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ops/users/${userId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, detail: "Network error" };
  }
}