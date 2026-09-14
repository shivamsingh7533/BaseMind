"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchOpsStatus,
  fetchGroundingMetric,
  fetchAnnouncements,
  fetchOpsTenants,
  fetchOpsAgents,
  fetchOpsDocuments,
  fetchOpsTrends,
  fetchOpsErrors,
  type OpsStatus,
  type GroundingMetric,
  type Announcement,
  type OpsTenant,
  type OpsAgent,
  type OpsDocumentsStats,
  type OpsTrendPoint,
  type OpsErrorsData,
} from "@/lib/api";
import {
  TAB_OVERVIEW,
  TAB_TENANTS,
  TAB_AGENTS,
  TAB_DOCS,
  TAB_TRENDS,
  TAB_ERRORS,
  TAB_PLANS,
  TAB_ANNOUNCE,
  TabsNavigation,
} from "./tabs";
import { OverviewPanel } from "./panels/overview";
import { TenantsPanel } from "./panels/tenants";
import { AgentsPanel } from "./panels/agents";
import { DocsPanel } from "./panels/documents";
import { TrendsPanel } from "./panels/trends";
import { ErrorsPanel } from "./panels/errors";
import { PlansPanel } from "./panels/plans";
import { AnnouncePanel } from "./panels/announce";

export default function OpsPage() {
  const { getToken, isSignedIn } = useAuth();
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [grounding, setGrounding] = useState<GroundingMetric | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [tenants, setTenants] = useState<OpsTenant[] | null>(null);
  const [agents, setAgents] = useState<OpsAgent[] | null>(null);
  const [documents, setDocuments] = useState<OpsDocumentsStats | null>(null);
  const [trends, setTrends] = useState<OpsTrendPoint[] | null>(null);
  const [errors, setErrors] = useState<OpsErrorsData | null>(null);
  const [denied, setDenied] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_OVERVIEW);

  const fetchAnnouncementsData = async (token: string) => {
    const data = await fetchAnnouncements(token);
    if (data) setAnnouncements(data);
  };

  const refreshAnnouncements = () => {
    getToken().then((t) => {
      if (t) fetchAnnouncementsData(t);
    });
  };

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const t = await getToken();
      if (!t || !alive) return;
      const [status, groundingData] = await Promise.all([
        fetchOpsStatus(t),
        fetchGroundingMetric(t),
      ]);
      if (!alive) return;
      if (status) {
        setOps(status);
        setDenied(false);
      } else {
        setDenied(true);
      }
      if (groundingData) setGrounding(groundingData);
      if (activeTab === TAB_ANNOUNCE) {
        const announcementsData = await fetchAnnouncements(t);
        if (alive && announcementsData) setAnnouncements(announcementsData);
      }
      if (activeTab === TAB_TENANTS || activeTab === TAB_PLANS) {
        const tenantsData = await fetchOpsTenants(t);
        if (alive && tenantsData) setTenants(tenantsData);
      }
      if (activeTab === TAB_AGENTS) {
        const agentsData = await fetchOpsAgents(t);
        if (alive && agentsData) setAgents(agentsData);
      }
      if (activeTab === TAB_DOCS) {
        const documentsData = await fetchOpsDocuments(t);
        if (alive && documentsData) setDocuments(documentsData);
      }
      if (activeTab === TAB_TRENDS) {
        const trendsData = await fetchOpsTrends(t);
        if (alive && trendsData) setTrends(trendsData);
      }
      if (activeTab === TAB_ERRORS) {
        const errorsData = await fetchOpsErrors(t);
        if (alive && errorsData) setErrors(errorsData);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getToken, activeTab]);

  if (denied)
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Card className="rounded-2xl border-destructive/20 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-red-500 text-white shadow">
                <ShieldAlert className="size-5" />
              </span>
              <div>
                <h1 className="font-heading text-lg font-semibold">Operator access only</h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Tera account is ops list me nahi hai. Render dashboard me{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-black/5">OPERATOR_EMAILS</code>{" "}
                  me woh exact email daal jo tu is app me login karta hai (comma-separated),
                  phir backend redeploy hone ka wait kar aur dobara{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-black/5">/ops</code> khol.
                </p>
                {!isSignedIn ? (
                  <Button asChild size="sm" className="mt-3">
                    <Link href="/login">Login karo</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  if (ops === null)
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );

  return (
    <>
      <TabsNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      {activeTab === TAB_OVERVIEW ? (
        <OverviewPanel ops={ops} grounding={grounding} />
      ) : activeTab === TAB_TENANTS ? (
        <TenantsPanel tenants={tenants} />
      ) : activeTab === TAB_AGENTS ? (
        <AgentsPanel agents={agents} />
      ) : activeTab === TAB_DOCS ? (
        <DocsPanel documents={documents} />
      ) : activeTab === TAB_TRENDS ? (
        <TrendsPanel trends={trends} />
      ) : activeTab === TAB_ERRORS ? (
        <ErrorsPanel errors={errors} />
      ) : activeTab === TAB_PLANS ? (
        <PlansPanel tenants={tenants} />
      ) : activeTab === TAB_ANNOUNCE ? (
        <AnnouncePanel announcements={announcements} onRefresh={refreshAnnouncements} />
      ) : (
        <OverviewPanel ops={ops} grounding={grounding} />
      )}
    </>
  );
}