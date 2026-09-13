import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { LogoMark } from "@/components/logo";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link href="/" className="mb-6" aria-label="BaseMind home">
        <LogoMark className="size-14" />
      </Link>
      <SignIn
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
