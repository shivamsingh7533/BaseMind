"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Show, SignInButton, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { checkIsOperator } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const MARKETING_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

const APP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/chat", label: "Chat" },
  { href: "/knowledge-base", label: "Knowledge" },
  { href: "/logs", label: "Logs" },
];

const OPERATOR_EMAILS = [
  "basemind599@gmail.com",
  "shivamsingh7533@gmail.com",
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [opsConfirmed, setOpsConfirmed] = useState(false);

  const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
  const isOperator =
    Boolean(userEmail && OPERATOR_EMAILS.includes(userEmail)) || opsConfirmed;

  useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const name = user?.fullName ?? null;
    getToken()
      .then((t) => checkIsOperator(t, email, name))
      .then((isOp) => {
        if (alive && isOp) {
          setOpsConfirmed(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isSignedIn, getToken, user]);

  if (pathname?.startsWith("/widget")) {
    return null;
  }

  const links = [
    ...MARKETING_LINKS,
    ...APP_LINKS,
    ...(isOperator ? [{ href: "/admin", label: "Admin" }] : []),
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
              pathname === item.href || pathname.startsWith(item.href + "/");
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
                    pathname === item.href || pathname.startsWith(item.href + "/")
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
