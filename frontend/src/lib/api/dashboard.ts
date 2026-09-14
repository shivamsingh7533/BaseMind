import { db } from "@/lib/seed-data";
import { authHeader, request } from "./client";
import type { DashboardData } from "./types";

export const getDashboard = (token?: string | null) =>
  request<DashboardData>("/api/dashboard", db.dashboard, {
    headers: authHeader(token),
  });