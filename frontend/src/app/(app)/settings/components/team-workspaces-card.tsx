"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  Check,
  Crown,
  Eye,
  Headphones,
  Loader2,
  Mail,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  createWorkspace,
  getWorkspaceMembers,
  getWorkspaces,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/api/workspaces";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<
  WorkspaceRole,
  { label: string; icon: typeof Crown; color: string; desc: string }
> = {
  owner: {
    label: "Owner",
    icon: Crown,
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    desc: "Full administrative and billing control",
  },
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    desc: "Can invite team and configure AI agents & docs",
  },
  operator: {
    label: "Operator",
    icon: Headphones,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    desc: "Live chat takeover and conversation monitoring",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    desc: "Read-only access to chats, gap analysis, and metrics",
  },
};

export function TeamWorkspacesCard() {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("operator");
  const [inviting, setInviting] = useState(false);

  // New workspace modal state
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  // Initial load of workspaces
  useEffect(() => {
    let cancelled = false;
    getToken().then((token) => {
      void getWorkspaces(token).then((data) => {
        if (!cancelled) {
          setWorkspaces(data);
          if (data.length > 0) {
            setActiveWorkspace(data[0]);
          }
          setLoading(false);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Load members whenever active workspace changes
  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    setMembersLoading(true);
    getToken().then((token) => {
      void getWorkspaceMembers(activeWorkspace.id, token).then((mList) => {
        if (!cancelled) {
          setMembers(mList);
          setMembersLoading(false);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, getToken]);

  const refreshMembers = async () => {
    if (!activeWorkspace) return;
    const token = await getToken();
    const data = await getWorkspaceMembers(activeWorkspace.id, token);
    setMembers(data);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !inviteEmail.trim()) return;

    setInviting(true);
    const token = await getToken();
    const member = await inviteWorkspaceMember(
      activeWorkspace.id,
      { email: inviteEmail.trim(), role: inviteRole },
      token
    );

    setInviting(false);
    if (member) {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("operator");
      setInviteOpen(false);
      await refreshMembers();
    }
  };

  const handleRoleChange = async (memberId: string, newRole: WorkspaceRole) => {
    if (!activeWorkspace) return;
    const token = await getToken();
    const updated = await updateWorkspaceMemberRole(
      activeWorkspace.id,
      memberId,
      newRole,
      token
    );
    if (updated) {
      toast.success(`Role updated to ${newRole}`);
      await refreshMembers();
    }
  };

  const handleRemoveMember = async (memberId: string, email: string) => {
    if (!activeWorkspace) return;
    const token = await getToken();
    const ok = await removeWorkspaceMember(activeWorkspace.id, memberId, token);
    if (ok) {
      toast.success(`Removed ${email} from workspace`);
      await refreshMembers();
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName.trim()) return;

    setCreatingWs(true);
    const token = await getToken();
    const newWs = await createWorkspace(
      {
        name: wsName.trim(),
        slug: wsSlug.trim() || undefined,
      },
      token
    );
    setCreatingWs(false);

    if (newWs) {
      toast.success(`Workspace "${newWs.name}" created`);
      setWsName("");
      setWsSlug("");
      setCreateWsOpen(false);
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspace(newWs);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const canManageMembers =
    activeWorkspace?.currentUserRole === "owner" ||
    activeWorkspace?.currentUserRole === "admin";

  return (
    <>
      <Card className="border border-border/60">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <CardTitle className="font-heading">Team & Workspaces</CardTitle>
              </div>
              <CardDescription>
                Collaborate with operators, admins, and teammates using role-based access control.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {workspaces.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Shield className="size-3.5 text-muted-foreground" />
                      <span className="max-w-[140px] truncate">
                        {activeWorkspace?.name || "Select Workspace"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {workspaces.map((ws) => (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => setActiveWorkspace(ws)}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate">{ws.name}</span>
                        {ws.id === activeWorkspace?.id && (
                          <Check className="size-4 text-primary shrink-0 ml-2" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateWsOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                New Workspace
              </Button>

              {canManageMembers && (
                <Button
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  className="gap-1.5 shadow-sm"
                >
                  <UserPlus className="size-3.5" />
                  Invite Member
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {activeWorkspace && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border/50 bg-muted/20 gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm text-foreground">
                    {activeWorkspace.name}
                  </h4>
                  <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                    /{activeWorkspace.slug}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {members.length} {members.length === 1 ? "seat" : "seats"} occupied
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Your Role:</span>
                {activeWorkspace.currentUserRole && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-xs font-medium px-2 py-0.5",
                      ROLE_CONFIG[activeWorkspace.currentUserRole]?.color
                    )}
                  >
                    {activeWorkspace.currentUserRole}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {membersLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No members found in this workspace.
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/50 overflow-hidden">
              {members.map((member) => {
                const roleMeta = ROLE_CONFIG[member.role] || ROLE_CONFIG.viewer;
                const RoleIcon = roleMeta.icon;
                const isSelf = member.email === clerkUser?.primaryEmailAddress?.emailAddress;
                const isOwner = member.role === "owner";

                return (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 border border-border/60">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {(member.name || member.email).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {member.name || member.email}
                          </span>
                          {isSelf && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                              You
                            </Badge>
                          )}
                          {member.status === "invited" && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-500">
                              Invited
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {canManageMembers && !isOwner && !isSelf ? (
                        <Select
                          value={member.role}
                          onValueChange={(val) =>
                            handleRoleChange(member.id, val as WorkspaceRole)
                          }
                        >
                          <SelectTrigger className="h-8 w-[115px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn("text-xs gap-1 py-1 font-medium", roleMeta.color)}
                        >
                          <RoleIcon className="size-3" />
                          {roleMeta.label}
                        </Badge>
                      )}

                      {canManageMembers && !isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id, member.email)}
                          title="Remove member"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Invite Team Member
            </DialogTitle>
            <DialogDescription>
              Add a teammate to {activeWorkspace?.name || "your workspace"} with granular role-based permissions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  className="pl-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Workspace Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(val) => setInviteRole(val as WorkspaceRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-3.5 text-blue-400" />
                      <span>Admin</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="operator">
                    <div className="flex items-center gap-2">
                      <Headphones className="size-3.5 text-amber-400" />
                      <span>Operator</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="size-3.5 text-emerald-400" />
                      <span>Viewer</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground pt-1">
                {ROLE_CONFIG[inviteRole]?.desc}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
                disabled={inviting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Send Invitation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Workspace Dialog */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Users className="size-5 text-primary" />
              Create Team Workspace
            </DialogTitle>
            <DialogDescription>
              Create an isolated workspace for a department, client project, or specialized agent fleet.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateWorkspace} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name" className="text-xs">
                Workspace Name
              </Label>
              <Input
                id="ws-name"
                placeholder="e.g. Acme Support Team"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-slug" className="text-xs">
                Workspace Slug (Optional)
              </Label>
              <Input
                id="ws-slug"
                placeholder="e.g. acme-support"
                value={wsSlug}
                onChange={(e) => setWsSlug(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateWsOpen(false)}
                disabled={creatingWs}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingWs || !wsName.trim()}>
                {creatingWs ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Create Workspace"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
