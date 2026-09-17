import { API_URL, authHeader } from "./client";
import type { BillingStatus, CheckoutResponse } from "./types";

export async function getBilling(
  token?: string | null
): Promise<BillingStatus | null> {
  try {
    const res = await fetch(`${API_URL}/api/billing`, {
      headers: authHeader(token),
    });
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}

export async function createCheckout(
  token?: string | null,
  interval: "monthly" | "annual" = "monthly"
): Promise<CheckoutResponse | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/billing/checkout?interval=${interval}`,
      {
        method: "POST",
        headers: authHeader(token),
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as CheckoutResponse;
  } catch {
    return null;
  }
}

export async function cancelSubscription(
  token?: string | null
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/billing/cancel`, {
      method: "POST",
      headers: authHeader(token),
    });
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      return { ok: false, detail: body.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, detail: "Network error" };
  }
}