"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo-lockup";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createCheckout, getBilling, type BillingStatus } from "@/lib/api";
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

const FEATURES = [
  {
    icon: "precision",
    title: "Built for Precision",
    body: "Advanced RAG architecture ensuring hallucination-free, context-aware responses.",
    chip: null,
  },
  {
    icon: "upload",
    title: "Frictionless Upload",
    body: "Drag and drop PDFs, TXT, or CSV. We parse everything.",
    chip: "docs.pdf",
  },
  {
    icon: "search",
    title: "Semantic Search",
    body: "Vector embeddings ensure the agent understands context, not just keywords.",
    chip: null,
  },
] as const;

const PLANS = [
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
    ],
    popular: true,
  },
];

function FeatureIcon({ kind }: { kind: (typeof FEATURES)[number]["icon"] }) {
  const cls = "size-5 text-primary";
  if (kind === "upload")
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          d="M12 16V8m0 0l-3 3m3-3l3 3M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  if (kind === "search")
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls}>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cls}>
      <path
        d="M9 4a3 3 0 00-3 3v1a3 3 0 000 6v1a3 3 0 003 3m6-14a3 3 0 013 3v1a3 3 0 010 6v1a3 3 0 01-3 3M10 10l-2 2 2 2m4-4l2 2-2 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pricing() {
  const { isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [annual, setAnnual] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getToken()
      .then((token) => (token ? getBilling(token) : null))
      .then((b) => {
        if (cancelled) return;
        setBilling(b ?? null);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
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
    if (checking) {
      return (
        <Button className="mt-5 w-full" disabled>
          <Loader2 className="mr-2 size-4 animate-spin" /> Checking…
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
    <Card className="mx-auto max-w-4xl">
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <LogoLockup withTagline className="mb-6" />
        <Badge variant="outline" className="mb-5 gap-1.5 border-primary/40 text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          BaseMind 2.0 Live
        </Badge>
        <h1 className="mx-auto max-w-3xl font-heading text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Scale Your Support with{" "}
          <span className="text-primary">Custom AI Agents</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Transform your knowledge base into an intelligent, conversational
          support agent in minutes. No coding required.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free while in beta. No credit card required.
        </p>
      </section>

      <section id="features" className="border-t bg-card py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border p-6">
              <FeatureIcon kind={f.icon} />
              <h2 className="mt-4 font-heading text-lg font-semibold">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="py-20">
        <Pricing />
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-5">
          <Link
            href="/legal/privacy"
            className="hover:text-foreground hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/legal/terms"
            className="hover:text-foreground hover:underline"
          >
            Terms of Service
          </Link>
        </div>
        <p className="mt-3">© 2026 BaseMind. All rights reserved.</p>
      </footer>
    </div>
  );
}
