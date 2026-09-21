import { API_URL, authHeader } from "./client";
import type {
  UserApiKeyCreatePayload,
  UserApiKeysResponse,
} from "./types";

export async function getUserApiKeys(
  token: string | null | undefined
): Promise<UserApiKeysResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/settings/keys`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as UserApiKeysResponse;
  } catch {
    return null;
  }
}

export async function saveUserApiKey(
  token: string | null | undefined,
  payload: UserApiKeyCreatePayload
): Promise<{ ok: boolean; message?: string; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/settings/keys`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { message?: string; detail?: string };
    if (!res.ok) {
      return { ok: false, detail: body.detail || `HTTP ${res.status}` };
    }
    return { ok: true, message: body.message };
  } catch {
    return { ok: false, detail: "Network error saving API key" };
  }
}

export async function deleteUserApiKey(
  token: string | null | undefined,
  provider: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/settings/keys/${provider}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
