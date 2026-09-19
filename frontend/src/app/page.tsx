"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo-lockup";
import { Badge } from "@/components/ui/badge";
import { PricingSection } from "@/components/pricing-section";

const FEATURES = [
  {
    icon: "precision",
    title: "Built for Precision",
    body: "Advanced RAG architecture ensuring hallucination-free, context-aware responses.",
  },
  {
    icon: "upload",
    title: "Frictionless Upload",
    body: "Drag and drop PDFs, TXT, or CSV. We parse and index everything into pgvector.",
  },
  {
    icon: "search",
    title: "Semantic Search",
    body: "Vector embeddings ensure the agent understands context, not just keywords.",
  },
] as const;

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

export default function LandingPage() {
  // Strip any legacy hash like #features or #pricing from the URL while preserving smooth navigation
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) {
      const rawHash = window.location.hash.replace(/^#/, "");
      if (rawHash === "features" || rawHash === "pricing") {
        const el = document.getElementById(rawHash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
        // Immediately clean hash from URL bar
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
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
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">View Pricing</Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link href="/features" className="gap-1.5">
              <Sparkles className="size-4 text-primary" />
              All Features
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free while in beta. No credit card required.
        </p>
      </section>

      {/* Features Overview */}
      <section id="features" className="border-t bg-card py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Enterprise RAG & Multi-Agent Architecture
            </h2>
            <p className="mt-2 text-muted-foreground">
              Designed from the ground up for high-accuracy response generation.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-background/50 p-6 transition hover:border-primary/50">
                <FeatureIcon kind={f.icon} />
                <h3 className="mt-4 font-heading text-lg font-semibold">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button variant="outline" asChild>
              <Link href="/features" className="gap-2">
                Explore Full Feature Deep Dive <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <PricingSection />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-5">
          <Link
            href="/features"
            className="hover:text-foreground hover:underline"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="hover:text-foreground hover:underline"
          >
            Pricing
          </Link>
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
