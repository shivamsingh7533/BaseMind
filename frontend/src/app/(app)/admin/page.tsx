"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Ban,
  CalendarClock,
  Crown,
  Loader2,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type OpsTenant,
} from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PlanBadge({ plan }: { plan: string }) {
  const isPro = plan === "pro";
  return (
    <Badge variant={isPro ? "secondary" : "outline"} className={isPro ? "text-primary" : "text-muted-foreground"}>
      {isPro ? "Pro" : "Free"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const suspended = status === "suspended";
  return (
    <Badge
      variant="outline"
      className={suspended ? "text-destructive" : "text-success"}
    >
      {suspended ? "Suspended" : "Active"}
    </Badge>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="size-5 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="font-heading text-2xl font-bold tracking-tight">{value}</p>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<OpsTenant[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [expiringCount, setExpiringCount] = useState(0);

  const [manage, setManage] = useState<OpsTenant | null>(null);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [platformStatus, setPlatformStatus] = useState<"active" | "suspended">("active");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<OpsTenant | null>(null);
  const [typed, setTyped] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    const token = await getToken();
    const data = await fetchAdminUsers(token);
    if (data === null) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setUsers(data);
    const now = Date.now();
    setExpiringCount(
      data.filter((u) => {
        if (!u.current_period_end) return false;
        const t = new Date(u.current_period_end).getTime();
        return Number.isFinite(t) && t > now && t <= now + 7 * DAY_MS;
      }).length,
    );
  }, [getToken]);

  useEffect(() => {
    let paused = false;
    const id = setInterval(() => {
      if (!paused) void load().catch(() => undefined);
    }, 30_000);
    getToken()
      .then(() => load().catch(() => undefined))
      .catch(() => undefined);
    const handleVisibility = () => { paused = document.hidden; };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [getToken, load]);

  const stats = useMemo(() => {
    if (!users) return null;
    const total = users.length;
    const pro = users.filter((u) => u.plan === "pro").length;
    const suspended = users.filter((u) => u.platform_status === "suspended").length;
    return { total, pro, suspended, expiring: expiringCount };
  }, [users, expiringCount]);

  const openManage = (u: OpsTenant) => {
    setPlan(u.plan === "pro" ? "pro" : "free");
    setPlatformStatus(u.platform_status === "suspended" ? "suspended" : "active");
    setManage(u);
  };

  const onSaveManage = async () => {
    if (!manage) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await updateAdminUser(token, manage.user_id, { plan, status: platformStatus });
      if (!res.ok) {
        toast.error(`Update failed: ${res.detail}`);
        return;
      }
      toast.success(`${manage.email} updated`);
      setManage(null);
      void load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const token = await getToken();
      const res = await deleteAdminUser(token, deleting.user_id);
      if (!res.ok) {
        toast.error(`Delete failed: ${res.detail}`);
        return;
      }
      toast.success(`${deleting.email} deleted`);
      setDeleting(null);
      setTyped("");
      void load();
    } finally {
      setDeletingBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 p-6 lg:p-8">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-7 text-destructive" />
        </span>
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Admin access only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The owner has not granted your account operator access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage users, subscriptions, and workspace access.
      </p>

      {stats ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Total users" value={String(stats.total)} />
          <StatCard icon={Crown} label="Pro subscribers" value={String(stats.pro)} hint="Active paying plan" />
          <StatCard icon={CalendarClock} label="Expiring in 7 days" value={String(stats.expiring)} hint="Upcoming renewals" />
          <StatCard icon={Ban} label="Suspended" value={String(stats.suspended)} hint="Blocked from chatting" />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-heading">Users</CardTitle>
          <CardDescription>
            {users ? `${users.length} workspace${users.length === 1 ? "" : "s"} on the platform` : "Loading users…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users === null ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Subscription ends</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={u.plan} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.platform_status} />
                    </TableCell>
                    <TableCell>{u.agents}</TableCell>
                    <TableCell>{u.documents}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(u.current_period_end)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openManage(u)}
                        >
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setTyped("");
                            setDeleting(u);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={manage !== null} onOpenChange={(open) => !open && setManage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage user</DialogTitle>
            <DialogDescription>
              {manage ? `${manage.name} — ${manage.email}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="plan-select">
                Plan
              </label>
              <Select
                value={plan}
                onValueChange={(v) => setPlan(v as "free" | "pro")}
              >
                <SelectTrigger id="plan-select">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="status-select">
                Account status
              </label>
              <Select
                value={platformStatus}
                onValueChange={(v) => setPlatformStatus(v as "active" | "suspended")}
              >
                <SelectTrigger id="status-select">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManage(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSaveManage} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this user?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-semibold text-foreground">{deleting?.email}</span> and
              everything they own — agents, knowledge, conversations, files, and their
              subscription. This cannot be undone. Type{" "}
              <span className="font-semibold text-foreground">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type DELETE to confirm"
            aria-label="Type DELETE to confirm"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setTyped("");
              }}
              disabled={deletingBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== "DELETE" || deletingBusy}
              onClick={onDelete}
            >
              {deletingBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}