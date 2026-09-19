"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createCheckout, getBilling, verifyPayment, type BillingStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (event: string, callback: (response: unknown) => void) => void;
    };
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

export const PLANS = [
  {
    name: "Starter",
    tagline: "Perfect for side projects.",
    monthly: 0,
    annual: 0,
    features: ["1 Custom Agent", "500 Messages/mo", "Basic File Uploads (PDF, TXT)"],
    popular: false,
  },
  {
    name: "Pro",
    tagline: "For growing support teams.",
    monthly: 499,
    annual: 4999,
    features: [
      "Unlimited Agents",
      "10,000 Messages/mo",
      "Cited Answers (RAG + Sources)",
      "Hybrid Vector Search (pgvector)",
      "Priority Webhook Ingestion",
    ],
    popular: true,
  },
] as const;

const BILLING_CACHE_KEY = "basemind_billing_v1";

export function PricingSection({ className }: { className?: string }) {
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [annual, setAnnual] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(BILLING_CACHE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return null;
  });
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    getToken()
      .then((t) => {
        if (!t || cancelled) return;
        return getBilling(t).then((b) => {
          if (!cancelled && b) {
            setBilling(b);
            try {
              localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(b));
            } catch {}
          }
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const refreshBilling = () => {
    void getToken().then((token) => {
      void getBilling(token).then((b) => {
        if (b) {
          setBilling(b);
          try {
            localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(b));
          } catch {}
        }
      });
    });
  };

  const startCheckout = async (cycle: "monthly" | "annual") => {
    if (!isSignedIn) {
      router.push("/signup");
      return;
    }
    setUpgrading(true);
    try {
      const token = await getToken();
      const checkout = await createCheckout(token, cycle);
      if (!checkout) {
        setUpgrading(false);
        return;
      }
      if (checkout.demo) {
        toast.success(checkout.notice || "Demo Mode: Upgraded to Pro without payment!");
        setUpgrading(false);
        refreshBilling();
        return;
      }
      await loadRazorpayCheckout();

      const options: Record<string, unknown> = {
        key: checkout.key_id,
        name: "BaseMind",
        description:
          checkout.description ||
          (cycle === "annual" ? "Pro Plan — ₹4,999/year" : "Pro Plan — ₹499/month"),
        prefill: {
          name: user?.fullName || user?.primaryEmailAddress?.emailAddress || "",
          email: user?.primaryEmailAddress?.emailAddress || "",
        },
        theme: {
          color: "#0f766e",
        },
        modal: {
          animation: true,
          backdropclose: false,
          ondismiss: function () {
            setUpgrading(false);
          },
        },
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id?: string;
          razorpay_signature?: string;
        }) {
          try {
            if (response.razorpay_payment_id) {
              const res = await verifyPayment(token, {
                razorpay_order_id: response.razorpay_order_id || checkout.order_id || "",
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                interval: cycle,
              });
              if (!res.ok) {
                toast.error(`Payment verification failed: ${res.detail}`);
                setUpgrading(false);
                return;
              }
            }
            toast.success("Payment successful — upgraded to Pro!");
          } catch {
            toast.error("Could not verify payment with server.");
          } finally {
            setUpgrading(false);
            refreshBilling();
          }
        },
      };

      if (checkout.order_id) {
        options.order_id = checkout.order_id;
        options.amount = checkout.amount;
        options.currency = checkout.currency || "INR";
      } else if (checkout.subscription_id && checkout.subscription_id !== "demo_sub") {
        options.subscription_id = checkout.subscription_id;
      }

      const rzp = new window.Razorpay(options);
      if (typeof rzp.on === "function") {
        rzp.on("payment.failed", function (failRes: unknown) {
          setUpgrading(false);
          const detail = (failRes as { error?: { description?: string } })?.error?.description;
          toast.error(detail ? `Payment failed: ${detail}` : "Payment was not completed.");
        });
      }
      rzp.open();
    } catch {
      setUpgrading(false);
      toast.error("Could not start Razorpay checkout.");
    }
  };

  const showPrice = (plan: (typeof PLANS)[number]) => {
    if (plan.monthly === 0) return { amount: "₹0", unit: "/mo" };
    if (annual) return { amount: `₹${plan.annual.toLocaleString("en-IN")}`, unit: "/yr" };
    return { amount: `₹${plan.monthly}`, unit: "/mo" };
  };

  const renderCta = (plan: (typeof PLANS)[number]) => {
    if (plan.name === "Starter") {
      return (
        <Button className="mt-5 w-full" variant="outline" asChild>
          <Link href={isSignedIn ? "/dashboard" : "/signup"}>
            {isSignedIn ? "Open App" : "Get Started"}
          </Link>
        </Button>
      );
    }

    if (isSignedIn && billing?.plan === "pro") {
      return (
        <Button className="mt-5 w-full" variant="outline" asChild>
          <Link href="/settings">You&apos;re on Pro</Link>
        </Button>
      );
    }
    return (
      <Button
        className="mt-5 w-full"
        disabled={upgrading}
        onClick={() => void startCheckout(annual ? "annual" : "monthly")}
      >
        {upgrading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {isSignedIn ? "Upgrade to Pro" : "Sign up & Upgrade"}
      </Button>
    );
  };

  return (
    <Card className={cn("mx-auto max-w-4xl", className)}>
      <CardHeader className="items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl font-bold tracking-tight">
          Transparent Pricing
        </h2>
        <p className="text-muted-foreground">Scale without surprises.</p>
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className={cn(!annual && "text-primary")}>Monthly</span>
          <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Switch to annual plan" />
          <span className={cn(annual && "text-primary")}>Annual</span>
          <Badge variant="secondary" className="text-success">
            Save ₹989/yr
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const price = showPrice(plan);
          return (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-xl border p-6",
                plan.popular && "border-primary shadow-sm"
              )}
            >
              {plan.popular ? (
                <Badge className="absolute -top-2.5 right-4">Most Popular</Badge>
              ) : null}
              <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-4">
                <span className="font-heading text-4xl font-bold">
                  {price.amount}
                </span>
                <span className="text-sm text-muted-foreground">{price.unit}</span>
              </p>
              {renderCta(plan)}
              <ul className="mt-5 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.popular && (
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Secure payments via Razorpay UPI, cards & netbanking.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
