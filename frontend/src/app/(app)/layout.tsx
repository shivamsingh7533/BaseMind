import { ErrorBoundary } from "@/components/error-boundary";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <ErrorBoundary>{children}</ErrorBoundary>
    </div>
  );
}
