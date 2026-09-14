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
    toast.error("Login session nahi mili — page refresh karke dobara login karo");
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
        ? "Upload timed out — backend slow tha, dobara try karo"
        : `Network error (${err instanceof Error ? err.message : "unknown"}) — Render jaag raha hoga, 30 sec baad dobara try karo.`
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncUrl(
  token: string | null | undefined,
  url: string
): Promise<KnowledgeDoc | null> {
  if (!token) {
    toast.error("Login session nahi mili — page refresh karke dobara login karo");
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
      body: JSON.stringify({ url }),
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
    return (await res.json()) as KnowledgeDoc;
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    toast.error(
      aborted
        ? "Sync timed out — backend slow tha, dobara try karo"
        : `Network error (${err instanceof Error ? err.message : "unknown"}) — Render jaag raha hoga, 30 sec baad dobara try karo.`
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}