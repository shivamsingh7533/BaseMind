import { toast } from "sonner";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

function messageFrom(err: unknown): string {
  if (err instanceof ApiError) return `HTTP ${err.status}`;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleApiError(err: unknown, context = "Request failed"): void {
  toast.error(`${context}: ${messageFrom(err)}`, {
    action: {
      label: "Retry",
      onClick: () => window.location.reload(),
    },
  });
}

export { API_URL, authHeader, handleApiError, messageFrom, request };