import { toast } from "sonner";
import { API_URL, authHeader, request } from "./client";
import { KnowledgeDocSchema } from "./schemas";
import type { DocumentPreview, KnowledgeDoc } from "./types";

export const getDocuments = (token?: string | null) =>
  request<KnowledgeDoc[]>("/api/documents", {
    headers: authHeader(token),
    schema: KnowledgeDocSchema.array(),
  });

export const getDocumentPreview = (
  token?: string | null,
  documentId?: string | null
) =>
  request<DocumentPreview | null>(
    `/api/documents/${documentId}/preview`,
    { headers: authHeader(token) }
  );

export const getDocumentDownloadUrl = (
  token?: string | null,
  documentId?: string | null
) =>
  request<{ url: string } | null>(
    `/api/documents/${documentId}/download-url`,
    { headers: authHeader(token) }
  ).then((r) => r?.url ?? null);

export async function deleteDocument(
  token: string | null | undefined,
  documentId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/documents/${documentId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export async function uploadDocument(
  token: string | null | undefined,
  file: File
): Promise<KnowledgeDoc | null> {
  if (!token) {
    toast.error("Session expired — please refresh and sign in again");
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/documents/upload`, {
      method: "POST",
      headers: authHeader(token),
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* keep status text */
      }
      toast.error(`Upload failed: ${detail}`);
      return null;
    }
    return (await res.json()) as KnowledgeDoc;
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    toast.error(
      aborted
        ? "Upload timed out — please try again"
        : `Network error (${err instanceof Error ? err.message : "unknown"}) — backend server may be waking up, please retry in 30 seconds.`
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncUrl(
  token: string | null | undefined,
  url: string,
  options?: {
    crawl_depth?: number;
    crawlDepth?: number;
    sync_schedule?: "manual" | "daily" | "weekly";
    syncSchedule?: "manual" | "daily" | "weekly";
    agent_id?: string;
    agentId?: string;
  }
): Promise<KnowledgeDoc | null> {
  if (!token) {
    toast.error("Session expired — please refresh and sign in again");
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${API_URL}/api/documents/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify({
        url,
        crawl_depth: options?.crawl_depth ?? options?.crawlDepth ?? 1,
        sync_schedule: options?.sync_schedule ?? options?.syncSchedule ?? "manual",
        agent_id: options?.agent_id ?? options?.agentId,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* keep status text */
      }
      toast.error(`Sync failed: ${detail}`);
      return null;
    }
    const json: unknown = await res.json();
    return KnowledgeDocSchema.parse(json);
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === "AbortError";
    toast.error(
      aborted
        ? "Sync timed out — please try again"
        : `Network error (${err instanceof Error ? err.message : "unknown"}) — backend server may be waking up, please retry in 30 seconds.`
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resyncDocument(
  token: string | null | undefined,
  documentId: string
): Promise<KnowledgeDoc | null> {
  if (!token) return null;
  return request<KnowledgeDoc>(`/api/documents/${documentId}/resync`, {
    method: "POST",
    headers: authHeader(token),
    schema: KnowledgeDocSchema,
  });
}

export async function updateDocumentSchedule(
  token: string | null | undefined,
  documentId: string,
  syncSchedule: "manual" | "daily" | "weekly"
): Promise<KnowledgeDoc | null> {
  if (!token) return null;
  return request<KnowledgeDoc>(`/api/documents/${documentId}/schedule`, {
    method: "PATCH",
    headers: authHeader(token),
    body: JSON.stringify({ sync_schedule: syncSchedule }),
    schema: KnowledgeDocSchema,
  });
}