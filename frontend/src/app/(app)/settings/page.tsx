"use client";

import { useEffect, useState, type ElementType } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import {
  Database,
  HardDrive,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  cancelSubscription,
  createCheckout,
  deleteWorkspace,
  getBilling,
  getSettingsStatus,
  type BillingStatus,
} from "@/lib/api";
import { useAppData } from "@/lib/store";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}
function loadRazorpayCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

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
      {value === null ? (
        <Skeleton aria-label="Checking…" className="h-6 w-24" />
      ) : (
        <Badge
          variant="outline"
          className={value ? "text-success" : "text-destructive"}
        >
          {value ? "Connected" : "Not configured"}
        </Badge>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();
  const reset = useAppData((s) => s.reset);

  const [status, setStatus] = useState<any | null>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) => {
        void getSettingsStatus(token).then((s) => {
          if (!cancelled) setStatus(s);
        });
        void getBilling(token).then((b) => {
          if (!cancelled) setBilling(b);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const refreshBilling = () => {
    void getToken().then((token) => {
      void getBilling(token).then((b) => {
        if (b) setBilling(b);
      });
    });
  };

  const onUpgrade = async () => {
    setUpgrading(true);
    try {
      const token = await getToken();
      const checkout = await createCheckout(token, cycle);
      if (!checkout) {
        toast.error("Could not start checkout. Please try again.");
        return;
      }
      await loadRazorpayCheckout();
      const rzp = new window.Razorpay({
        key: checkout.key_id,
        subscription_id: checkout.subscription_id,
        name: "BaseMind",
        description:
          cycle === "annual" ? "Pro Plan — ₹4,999/year" : "Pro Plan — ₹499/month",
        prefill: {
          name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "",
          email: user?.primaryEmailAddress?.emailAddress || "",
        },
        handler: function () {
          toast.success("Payment successful — upgrading your plan");
          refreshBilling();
        },
        modal: {
          ondismiss: function () {
            setUpgrading(false);
            refreshBilling();
          },
        },
      });
      rzp.open();
    } catch {
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setUpgrading(false);
    }
  };

  const onCancel = async () => {
    setCancelling(true);
    try {
      const token = await getToken();
      const res = await cancelSubscription(token);
      if (!res.ok) {
        toast.error(`Cancel failed: ${res.detail}`);
        return;
      }
      toast.success("Subscription cancelled — back on the Free plan");
      refreshBilling();
    } finally {
      setCancelling(false);
    }
  };

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
        router.push("/dashboard");
        return;
      }
      toast.error(`Delete failed: ${res.detail}`);
    } finally {
      setDeleting(false);
    }
  };

  const isPro = billing?.plan === "pro";

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
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
              <div className="flex items-center gap-2">
                <p className="font-heading text-base font-semibold">
                  {displayName}
                </p>
                {isPro && (
                  <Badge className="text-primary">Pro</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress ??
                  "No email on this account"}
              </p>
              {isPro && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto px-0 text-muted-foreground hover:text-destructive"
                  onClick={onCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Cancel subscription"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!isPro && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <Sparkles className="size-4 text-primary" />
                Plan & Billing
              </CardTitle>
              <CardDescription>
                Upgrade to Pro for unlimited agents and knowledge. Cancel anytime
                from here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/50 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-heading text-lg font-semibold">
                      {billing === null ? (
                        <Skeleton className="h-6 w-24" />
                      ) : (
                        "Free"
                      )}
                    </p>
                    {billing !== null && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {billing.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {billing === null
                      ? " "
                      : "1 agent and 5 documents included"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2.5">
                  <div className="flex overflow-hidden rounded-lg border bg-background p-1 text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setCycle("monthly")}
                      disabled={upgrading}
                      className={cn(
                        "rounded-md px-3 py-1.5 transition-colors",
                        cycle === "monthly"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Monthly · ₹499/mo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycle("annual")}
                      disabled={upgrading}
                      className={cn(
                        "rounded-md px-3 py-1.5 transition-colors",
                        cycle === "annual"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Annual · ₹4,999/yr
                    </button>
                  </div>
                  {cycle === "annual" && (
                    <p className="text-xs text-success">You save ₹989 per year</p>
                  )}
                  <Button onClick={onUpgrade} disabled={upgrading}>
                    {upgrading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
            aria-label="Type DELETE to confirm"
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