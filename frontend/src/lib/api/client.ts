import { z } from "zod";
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
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

async function request<T>(
  path: string,
  options: RequestInit & { schema?: z.ZodType<T> } = {}
): Promise<T> {
  const { schema, ...fetchOpts } = options;
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...fetchOpts,
    headers: {
      Accept: "application/json",
      ...(fetchOpts.body ? { "Content-Type": "application/json" } : {}),
      ...(fetchOpts.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep status text */
    }
    throw new ApiError(res.status, detail ?? res.statusText);
  }
  const json = await res.json();
  if (!schema) return json as T;
  try {
    return schema.parse(json);
  } catch (err) {
    if (err instanceof z.ZodError)
      throw new ApiError(
        502,
        err.issues[0]?.message ?? "Invalid server response"
      );
    throw err;
  }
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleApiError(err: unknown, context = "Request failed"): void {
  let msg = messageFrom(err);
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      msg = "Permission denied — please sign in again";
    } else if (err.status >= 500) {
      msg = "Server error — please try again later";
    }
  } else if (err instanceof TypeError && err.message.includes("fetch")) {
    msg = "Network error — check your connection";
  }
  toast.error(`${context}: ${msg}`, {
    action: {
      label: "Retry",
      onClick: () => window.location.reload(),
    },
  });
}

export { API_URL, authHeader, handleApiError, messageFrom, request };