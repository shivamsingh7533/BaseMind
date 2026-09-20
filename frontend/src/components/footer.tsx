import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ArrowUpRight, Heart, Mail, ShieldCheck } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t bg-muted/20 text-muted-foreground transition-colors">
      {/* Main Grid */}
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <LogoMark className="size-8 transition-transform duration-300 group-hover:scale-105" />
              <span className="font-heading text-xl font-bold tracking-tight text-foreground">
                Base<span className="text-primary">Mind</span>
              </span>
            </Link>

            <p className="text-sm leading-relaxed text-muted-foreground max-w-sm">
              Turn your documents, website links, and company knowledge into autonomous, cited AI customer support agents in minutes.
            </p>

            {/* Live Operational Badge */}
            <div className="pt-2">
              <a
                href="https://basemind-api.onrender.com/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80 shadow-xs hover:border-primary/50 transition-colors"
                title="View API Health & System Metrics"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span>All Systems Operational</span>
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </a>
            </div>

            {/* Social / Contact Icons */}
            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://github.com/shivamsingh7533/BaseMind"
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                aria-label="GitHub Repository"
              >
                <GithubIcon className="size-4" />
              </a>
              <a
                href="mailto:basemind599@gmail.com"
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                aria-label="Email Support"
              >
                <Mail className="size-4" />
              </a>
            </div>
          </div>

          {/* Column 1: Product */}
          <div className="space-y-3">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
              Product
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/features" className="hover:text-foreground transition-colors">
                  Features & Pillars
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-foreground transition-colors">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <Link href="/agents" className="hover:text-foreground transition-colors">
                  Agent Studio
                </Link>
              </li>
              <li>
                <Link href="/knowledge-base" className="hover:text-foreground transition-colors">
                  Knowledge Base (RAG)
                </Link>
              </li>
              <li>
                <Link href="/chat" className="hover:text-foreground transition-colors">
                  Live Chat & Takeover
                </Link>
              </li>
              <li>
                <Link href="/leads" className="hover:text-foreground transition-colors">
                  Leads CRM
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Integrations & Solutions */}
          <div className="space-y-3">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
              Integrations
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/agents" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
                  Embeddable Chat Widget
                </Link>
              </li>
              <li>
                <Link href="/agents" className="hover:text-foreground transition-colors">
                  Slack Bot Integration
                </Link>
              </li>
              <li>
                <Link href="/agents" className="hover:text-foreground transition-colors">
                  Discord Bot Integration
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-foreground transition-colors">
                  Human-in-the-Loop
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                  White-Label Branding
                  <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">Pro</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Legal */}
          <div className="space-y-3">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
              Trust & Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-foreground transition-colors">
                  Workspace Settings
                </Link>
              </li>
              <li>
                <a
                  href="https://basemind-api.onrender.com/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  System Status <ArrowUpRight className="size-3" />
                </a>
              </li>
              <li className="pt-2 text-xs flex items-center gap-1.5 text-muted-foreground/80">
                <ShieldCheck className="size-3.5 text-primary" />
                <span>Isolated pgvector &amp; B2 Storage</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 sm:flex-row text-xs">
          <p className="text-muted-foreground">
            &copy; {new Date().getFullYear()} BaseMind. All rights reserved.
          </p>

          <div className="flex items-center gap-1 text-muted-foreground">
            <span>Engineered with</span>
            <Heart className="size-3 text-red-500 fill-red-500 inline" />
            <span>using Next.js, FastAPI &amp; Gemini RAG</span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <span className="text-border">&bull;</span>
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <span className="text-border">&bull;</span>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
