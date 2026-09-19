import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronDown, HelpCircle, Shield, Zap } from "lucide-react";
import { PricingSection } from "@/components/pricing-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing | BaseMind — Simple, Transparent Pricing",
  description:
    "Choose the right plan for your team. From individual side projects to high-scale support teams with unlimited AI agents and vector RAG.",
};

const COMPARISON_ROWS = [
  { feature: "AI Support Agents", starter: "1 Agent", pro: "Unlimited Agents" },
  { feature: "Monthly Messages", starter: "500 / month", pro: "10,000 / month" },
  { feature: "Document File Uploads", starter: "PDF, TXT", pro: "PDF, TXT, CSV, MD" },
  { feature: "Knowledge Vector Storage", starter: "10 MB", pro: "500 MB (pgvector HNSW)" },
  { feature: "Cited Grounded Responses", starter: "Basic", pro: "Full Attribution & Source Snippets" },
  { feature: "FastAPI Token Streaming (SSE)", starter: "Standard", pro: "High Priority Low-Latency" },
  { feature: "Multi-Agent Routing", starter: "—", pro: "Included" },
  { feature: "Audit Logs & Telemetry", starter: "7 days", pro: "90 days retention" },
  { feature: "Community & Email Support", starter: "Community", pro: "Priority Email & SLA" },
];

const FAQS = [
  {
    q: "Can I cancel or change my plan anytime?",
    a: "Yes. You can manage your subscription at any time from your Account Settings. If you cancel, your Pro benefits remain active until the end of the billing period.",
  },
  {
    q: "What payment methods are supported?",
    a: "We process payments securely via Razorpay, supporting UPI (Google Pay, PhonePe, Paytm), credit/debit cards (Visa, Mastercard, RuPay), and net banking from all major Indian and international banks.",
  },
  {
    q: "What happens if I exceed 10,000 messages in a month?",
    a: "Your agents continue to operate. We provide a soft buffer and will notify you to add extra capacity or discuss custom high-volume enterprise tiers.",
  },
  {
    q: "How does the annual billing discount work?",
    a: "Selecting Annual billing gives you 12 months of BaseMind Pro for ₹4,999 instead of ₹5,988, saving you nearly ₹1,000 per year.",
  },
  {
    q: "Is my proprietary data safe and private?",
    a: "Absolutely. All tenant data is strictly isolated with PostgreSQL row-level security and tenant IDs. Your documents and vectors are never used to train global foundation models.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b bg-gradient-to-b from-primary/5 via-background to-background py-16 text-center">
        <div className="mx-auto max-w-4xl px-6">
          <Badge variant="outline" className="mb-4 gap-1.5 border-primary/40 text-primary">
            <Zap className="size-3.5" />
            Simple & Predictable
          </Badge>
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, Transparent Pricing for Teams of Any Size
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Start for free to test your workflows, then upgrade to Pro to unlock unlimited agents,
            hybrid vector RAG, and high-volume message throughput.
          </p>
        </div>
      </section>

      {/* Main Pricing Cards */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <PricingSection />
        </div>
      </section>

      {/* Plan Comparison Table */}
      <section className="border-t bg-muted/20 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Compare Features Side-by-Side
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything included in each tier at a glance.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 font-heading">
                <tr>
                  <th className="p-4 font-semibold">Feature</th>
                  <th className="p-4 font-semibold">Starter (Free)</th>
                  <th className="p-4 font-semibold text-primary">Pro (₹499/mo)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="transition-colors hover:bg-muted/30">
                    <td className="p-4 font-medium text-foreground">{row.feature}</td>
                    <td className="p-4 text-muted-foreground">{row.starter}</td>
                    <td className="p-4 font-semibold text-primary">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <Badge variant="outline" className="mb-2 gap-1.5">
              <HelpCircle className="size-3.5" />
              Got Questions?
            </Badge>
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-muted-foreground">
              Have a question that isn&apos;t answered here? Reach out to support.
            </p>
          </div>

          <div className="mt-10 space-y-4">
            {FAQS.map((faq, idx) => (
              <details
                key={idx}
                className="group rounded-xl border bg-card p-5 transition hover:border-primary/40 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between font-heading font-semibold text-foreground">
                  <span>{faq.q}</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Still have questions about enterprise volume or custom models?
            </p>
            <Button variant="outline" className="mt-3" asChild>
              <Link href="mailto:support@basemind.com">Contact Sales & Support</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust & Guarantee Banner */}
      <section className="border-t bg-card py-12 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 px-6 sm:flex-row sm:gap-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="size-4 text-primary" />
            <span>256-bit SSL encrypted checkout</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-primary" />
            <span>Instant activation upon payment</span>
          </div>
        </div>
      </section>
    </div>
  );
}
