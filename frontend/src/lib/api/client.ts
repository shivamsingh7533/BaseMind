const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  fallback: T,
  options: RequestInit = {}
): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { API_URL, authHeader, request };