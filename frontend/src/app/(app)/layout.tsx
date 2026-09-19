import { ErrorBoundary } from "@/components/error-boundary";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <main id="main-content">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
