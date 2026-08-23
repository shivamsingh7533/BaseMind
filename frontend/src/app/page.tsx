"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
    body: "Drag and drop PDFs, connect Notion, or sync with Zendesk. We parse everything.",
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
    monthly: 49,
    annual: 39,
    features: [
      "Unlimited Agents",
      "10,000 Messages/mo",
      "Zendesk & Notion Sync",
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
  const [annual, setAnnual] = useState(false);
  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader className="items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl font-bold tracking-tight">
          Transparent Pricing
        </h2>
        <p className="text-muted-foreground">Scale without surprises.</p>
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className={cn(!annual && "text-primary")}>Monthly</span>
          <Switch checked={annual} onCheckedChange={setAnnual} />
          <span className={cn(annual && "text-primary")}>Annual</span>
          <Badge variant="secondary" className="text-success">
            -20%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
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
                ${annual ? plan.annual : plan.monthly}
              </span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </p>
            <Button
              className="mt-5 w-full"
              variant={plan.popular ? "default" : "outline"}
              asChild
            >
              <Link href="/dashboard">Get Started</Link>
            </Button>
            <ul className="mt-5 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const EMBED_CODE = `<script>
  window.BaseMind = {
    agentId: "bm_a7x9f",
    theme: "light"
  };
</script>
<script src="https://cdn.basemind.ai/v1.js"></script>`;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-20 text-center">
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
            <Link href="/dashboard">Start Free Trial</Link>
          </Button>
          <Button size="lg" variant="ghost" className="gap-2">
            <PlayCircle className="size-5" /> Watch Demo
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          14-day free trial. No credit card required.
        </p>
      </section>

      <section id="features" className="border-t bg-card py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border p-6">
              <FeatureIcon kind={f.icon} />
              <h3 className="mt-4 font-heading text-lg font-semibold">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
          <div className="rounded-xl border p-6 md:hidden">
            <h3 className="font-heading text-lg font-semibold">One-Line Embed</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Drop a single script tag into your app and instantly deploy your
              custom agent.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-6xl px-6">
          <div className="overflow-hidden rounded-xl border">
            <div className="grid md:grid-cols-2">
              <div className="bg-card p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <FeatureIcon kind="precision" />
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold">
                  One-Line Embed
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Drop a single script tag into your app and instantly deploy
                  your custom agent.
                </p>
              </div>
              <pre className="overflow-x-auto bg-zinc-950 p-6 font-mono text-xs leading-relaxed text-zinc-100">
                {EMBED_CODE}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <Pricing />
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © 2026 BaseMind. All rights reserved.
      </footer>
    </div>
  );
}
