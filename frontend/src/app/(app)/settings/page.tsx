"use client";

import { useEffect, useState, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { Database, HardDrive, Loader2, TriangleAlert } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { deleteWorkspace, getSettingsStatus, type SettingsStatus } from "@/lib/api";
import { useAppData } from "@/lib/store";

function StatusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="flex items-center gap-2.5 text-sm">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <Badge
        variant="outline"
        className={
          value === null
            ? "text-muted-foreground"
            : value
              ? "text-success"
              : "text-destructive"
        }
      >
        {value === null
          ? "checking…"
          : value
            ? "Connected"
            : "Not configured"}
      </Badge>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const reset = useAppData((s) => s.reset);

  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then(getSettingsStatus)
      .then((s) => {
        if (!cancelled) setStatus(s);
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || "Workspace";
  const initials = (displayName.slice(0, 2) || "B").toUpperCase();

  const onDelete = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await deleteWorkspace(token);
      if (res.ok) {
        reset();
        setConfirmOpen(false);
        toast.success("Workspace deleted — all data purged");
        void signOut();
        router.push("/");
        return;
      }
      toast.error(`Delete failed: ${res.detail}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Settings
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your workspace and account.
      </p>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Profile</CardTitle>
            <CardDescription>
              Identity is managed by Clerk — sign in to change these details.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 font-heading text-base font-semibold text-primary">
              {initials}
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                {displayName}
              </p>
              <p className="text-sm text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress ??
                  "No email on this account"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Service Status</CardTitle>
            <CardDescription>
              How the backend infrastructure reports itself right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Separator />
            <StatusRow
              icon={Database}
              label="PostgreSQL database"
              value={status === null ? null : status.db_configured}
            />
            <Separator />
            <StatusRow
              icon={HardDrive}
              label="Backblaze B2 storage"
              value={status === null ? null : status.b2_enabled}
            />
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-destructive">
              <TriangleAlert className="size-4" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently deletes all agents, knowledge, conversations, and
              analytics for this workspace. Uploaded files are also removed
              from Backblaze B2. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workspace?</DialogTitle>
            <DialogDescription>
              This permanently removes everything. Type{" "}
              <span className="font-semibold text-foreground">DELETE</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type DELETE to confirm"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setTyped("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== "DELETE" || deleting}
              onClick={onDelete}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete workspace"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}