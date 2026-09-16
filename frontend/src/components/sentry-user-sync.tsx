"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";

export function SentryUserSync() {
  const { user, isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn && user) {
      Sentry.setUser({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? undefined,
        username: user.username ?? undefined,
      });
      Sentry.setTag("clerk_id", user.id);
    } else if (isSignedIn === false) {
      Sentry.setUser(null);
    }
  }, [isSignedIn, user]);

  return null;
}
