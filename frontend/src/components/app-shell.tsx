"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Database,
  LayoutDashboard,
  Settings,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/knowledge-base", label: "Knowledge", icon: Database },
  { href: "/logs", label: "Logs", icon: TerminalSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card md:flex">
        <Link
          href="/dashboard"
          className="flex h-16 items-center gap-2.5 border-b px-5"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4.5" />
          </span>
          <span className="font-heading text-lg font-bold tracking-tight">
            BaseMind
          </span>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              AC
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Acme Corp</p>
              <p className="truncate text-xs text-muted-foreground">
                Pro plan
              </p>
            </div>
          </div>
        </div>
      </aside>

      <nav className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </span>
          <span className="font-heading font-bold">BaseMind</span>
        </Link>
        <div className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "rounded-md p-2",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="size-4" />
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="min-w-0 flex-1 md:ml-60">{children}</main>
    </div>
  );
}
