import Link from "next/link";
import { Bot } from "lucide-react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link
        href="/"
        className="mb-6 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        aria-label="BaseMind home"
      >
        <Bot className="size-7" />
      </Link>
      <SignUp
        fallbackRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: "#0d9488",
            colorBackground: "transparent",
            borderRadius: "0.75rem",
          },
          elements: {
            card: "bg-card shadow-sm",
            rootBox: "w-full",
          },
        }}
      />
    </div>
  );
}
