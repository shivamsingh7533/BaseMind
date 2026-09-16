export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { init, feedbackIntegration } = await import("@sentry/nextjs");
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
      tracesSampleRate: 0.08,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
      integrations: [
        feedbackIntegration({
          colorScheme: "system",
          isNameRequired: false,
          isEmailRequired: false,
        }),
      ],
    });
  }
}