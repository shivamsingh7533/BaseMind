"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Show, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { fetchOpsStatus } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const MARKETING_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
];

const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/chat", label: "Chat" },
  { href: "/knowledge-base", label: "Knowledge" },
  { href: "/logs", label: "Logs" },
];

const OPS_CACHE_KEY = "basemind_showOps";
const OPS_CACHE_TTL_MS = 5 * 60 * 1000;
const OPS_CACHE_TS_KEY = "basemind_showOps_ts";

function subscribeOps(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getOpsSnapshot() {
  return window.localStorage.getItem(OPS_CACHE_KEY) === "1";
}

function opsCacheFresh() {
  const ts = Number(window.localStorage.getItem(OPS_CACHE_TS_KEY) ?? "0");
  return Date.now() - ts < OPS_CACHE_TTL_MS;
}

function setOpsCache(value: "1" | "0") {
  window.localStorage.setItem(OPS_CACHE_KEY, value);
  window.localStorage.setItem(OPS_CACHE_TS_KEY, String(Date.now()));
}

function getOpsServerSnapshot() {
  return false;
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isSignedIn, getToken } = useAuth();
  const cachedOps = useSyncExternalStore(subscribeOps, getOpsSnapshot, getOpsServerSnapshot);
  const [opsConfirmed, setOpsConfirmed] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    if (opsCacheFresh()) return;
    let alive = true;
    getToken()
      .then((t) => fetchOpsStatus(t))
      .then((ops) => {
        if (alive) {
          const value = ops ? "1" : "0";
          setOpsConfirmed(!!ops);
          setOpsCache(value);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isSignedIn, getToken, opsConfirmed]);

  const links = [
    ...MARKETING_LINKS,
    ...APP_LINKS,
    ...(cachedOps || opsConfirmed ? [{ href: "/ops", label: "Ops" }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="font-heading text-lg font-bold tracking-tight">
            BaseMind
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
          {links.map((item) => {
            const active =
              item.href.startsWith("/#") === false &&
              (pathname === item.href || pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "transition-colors hover:text-foreground",
                  active && "text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Show when="signed-out">
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button variant="ghost">Sign In</Button>
            </SignInButton>
            <Button asChild>
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <UserButton appearance={{ elements: { avatarBox: "size-8" } }} />
          </Show>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="text-left">BaseMind</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={
                    item.href.startsWith("/#")
                      ? undefined
                      : pathname === item.href || pathname.startsWith(item.href + "/")
                        ? "page"
                        : undefined
                  }
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-3 h-px bg-border" />
              <div className="flex items-center justify-between px-3 py-2">
                <Show when="signed-out">
                  <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
                    <Button variant="ghost" className="justify-start">
                      Sign In
                    </Button>
                  </SignInButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                  <span className="text-sm font-medium">Account</span>
                </Show>
              </div>
              <Show when="signed-out">
                <Button asChild className="mt-1">
                  <Link href="/signup" onClick={() => setOpen(false)}>
                    Start Free Trial
                  </Link>
                </Button>
              </Show>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
