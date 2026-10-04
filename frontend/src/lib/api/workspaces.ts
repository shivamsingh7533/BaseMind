import { toast } from "sonner";
import { API_URL, authHeader } from "./client";
import type {
  Workspace,
  WorkspaceCreatePayload,
  WorkspaceMember,
  WorkspaceMemberInvitePayload,
  WorkspaceRole,
  WorkspaceUpdatePayload,
} from "./types";

export async function getWorkspaces(
  token?: string | null
): Promise<Workspace[]> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      headers: authHeader(token),
    });
    if (!res.ok) return [];
    return (await res.json()) as Workspace[];
  } catch {
    return [];
  }
}

export async function createWorkspace(
  payload: WorkspaceCreatePayload,
  token?: string | null
): Promise<Workspace | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      method: "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return null;
    }
    return (await res.json()) as Workspace;
  } catch {
    toast.error("Failed to create workspace");
    return null;
  }
}

export async function getWorkspace(
  workspaceId: string,
  token?: string | null
): Promise<Workspace | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as Workspace;
  } catch {
    return null;
  }
}

export async function updateWorkspace(
  workspaceId: string,
  payload: WorkspaceUpdatePayload,
  token?: string | null
): Promise<Workspace | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return null;
    }
    return (await res.json()) as Workspace;
  } catch {
    toast.error("Failed to update workspace");
    return null;
  }
}

export async function deleteWorkspace(
  workspaceId: string,
  token?: string | null
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return false;
    }
    return true;
  } catch {
    toast.error("Failed to delete workspace");
    return false;
  }
}

export async function getWorkspaceMembers(
  workspaceId: string,
  token?: string | null
): Promise<WorkspaceMember[]> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/members`, {
      headers: authHeader(token),
    });
    if (!res.ok) return [];
    return (await res.json()) as WorkspaceMember[];
  } catch {
    return [];
  }
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  payload: WorkspaceMemberInvitePayload,
  token?: string | null
): Promise<WorkspaceMember | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        ...authHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return null;
    }
    return (await res.json()) as WorkspaceMember;
  } catch {
    toast.error("Failed to invite member");
    return null;
  }
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
  token?: string | null
): Promise<WorkspaceMember | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/workspaces/${workspaceId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: {
          ...authHeader(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      }
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return null;
    }
    return (await res.json()) as WorkspaceMember;
  } catch {
    toast.error("Failed to update role");
    return null;
  }
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
  token?: string | null
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/api/workspaces/${workspaceId}/members/${memberId}`,
      {
        method: "DELETE",
        headers: authHeader(token),
      }
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { detail?: string };
        if (err.detail) detail = err.detail;
      } catch {}
      toast.error(detail);
      return false;
    }
    return true;
  } catch {
    toast.error("Failed to remove member");
    return false;
  }
}
