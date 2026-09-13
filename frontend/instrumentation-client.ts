export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.08,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
    });
  }
}