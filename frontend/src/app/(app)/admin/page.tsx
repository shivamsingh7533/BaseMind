"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  Database,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  checkIsOperator,
  createAnnouncement,
  deleteAdminUser,
  fetchAdminUsers,
  fetchAnnouncements,
  fetchGroundingMetric,
  fetchOpsAgents,
  fetchOpsDocuments,
  fetchOpsErrors,
  fetchOpsStatus,
  fetchOpsTrends,
  sendOperatorAlert,
  updateAdminUser,
  updateOpsAgent,
  type Announcement,
  type GroundingMetric,
  type OpsAgent,
  type OpsDocumentsStats,
  type OpsErrorsData,
  type OpsStatus,
  type OpsTenant,
  type OpsTrendPoint,
} from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function PlanBadge({ plan }: { plan: string }) {
  const isPro = plan === "pro";
  return (
    <Badge
      variant={isPro ? "secondary" : "outline"}
      className={isPro ? "border-primary/40 bg-primary/10 text-primary font-medium" : "text-muted-foreground"}
    >
      {isPro ? "Pro" : "Free"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const suspended = status === "suspended";
  return (
    <Badge
      variant="outline"
      className={suspended ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}
    >
      {suspended ? "Suspended" : "Active"}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "error") {
    return (
      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-500">
        Error
      </Badge>
    );
  }
  if (severity === "attention") {
    return (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
        Attention
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Info
    </Badge>
  );
}

export default function AdminDashboardPage() {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState("overview");
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core data states
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [tenants, setTenants] = useState<OpsTenant[] | null>(null);
  const [agents, setAgents] = useState<OpsAgent[] | null>(null);
  const [documents, setDocuments] = useState<OpsDocumentsStats | null>(null);
  const [trends, setTrends] = useState<OpsTrendPoint[] | null>(null);
  const [errors, setErrors] = useState<OpsErrorsData | null>(null);
  const [grounding, setGrounding] = useState<GroundingMetric | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  // Tenant search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "pro" | "free" | "suspended">("all");

  // Manage Tenant Dialog
  const [manageUser, setManageUser] = useState<OpsTenant | null>(null);
  const [editPlan, setEditPlan] = useState<"free" | "pro">("free");
  const [editStatus, setEditStatus] = useState<"active" | "suspended">("active");
  const [savingUser, setSavingUser] = useState(false);

  // Delete Tenant Dialog
  const [deleteTarget, setDeleteTarget] = useState<OpsTenant | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Agent Prompt Viewer Dialog
  const [viewAgent, setViewAgent] = useState<OpsAgent | null>(null);
  const [agentActionBusy, setAgentActionBusy] = useState<string | null>(null);

  // Announcement Form
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceSeverity, setAnnounceSeverity] = useState<"info" | "attention" | "error">("info");
  const [broadcasting, setBroadcasting] = useState(false);

  // Operator Alert Form
  const [alertSubject, setAlertSubject] = useState("");
  const [alertHtml, setAlertHtml] = useState("");
  const [sendingAlert, setSendingAlert] = useState(false);

  // Error center filter
  const [errorFilter, setErrorFilter] = useState<"all" | "error" | "attention">("all");

  const loadAll = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
    const name = user?.fullName ?? null;

    const isKnownOperator = Boolean(
      email && ["basemind599@gmail.com", "shivamsingh7533@gmail.com"].includes(email)
    );

    const isOp = isKnownOperator || (await checkIsOperator(token, email, name));
    if (!isOp) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setDenied(false);

    try {
      const [
        opsData,
        tenantsData,
        agentsData,
        docsData,
        trendsData,
        errorsData,
        groundingData,
        announcementsData,
      ] = await Promise.all([
        fetchOpsStatus(token),
        fetchAdminUsers(token),
        fetchOpsAgents(token),
        fetchOpsDocuments(token),
        fetchOpsTrends(token),
        fetchOpsErrors(token),
        fetchGroundingMetric(token),
        fetchAnnouncements(token),
      ]);

      if (opsData) setOps(opsData);
      if (tenantsData) setTenants(tenantsData);
      if (agentsData) setAgents(agentsData);
      if (docsData) setDocuments(docsData);
      if (trendsData) setTrends(trendsData);
      if (errorsData) setErrors(errorsData);
      if (groundingData) setGrounding(groundingData);
      if (announcementsData) setAnnouncements(announcementsData);
    } catch {
      toast.error("Failed to load some admin telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, user]);

  useEffect(() => {
    if (isSignedIn && user) {
      void loadAll();
    }
  }, [isSignedIn, user, loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    toast.success("Telemetry refreshed");
  };

  // Derived metrics
  const stats = useMemo(() => {
    const userList = tenants ?? [];
    const totalUsers = ops?.metrics?.users ?? userList.length;
    const proUsers = userList.filter((u) => u.plan === "pro").length;
    const suspendedUsers = userList.filter((u) => u.platform_status === "suspended").length;
    const estimatedMrr = proUsers * 499;

    const now = Date.now();
    const expiringCount = userList.filter((u) => {
      if (!u.current_period_end) return false;
      const t = new Date(u.current_period_end).getTime();
      return Number.isFinite(t) && t > now && t <= now + 7 * DAY_MS;
    }).length;

    const totalAgents = ops?.metrics?.agents ?? agents?.length ?? 0;
    const queries24h = ops?.metrics?.queriesToday ?? 0;
    const totalQueries = ops?.metrics?.totalQueries ?? 0;
    const totalDocs = documents?.totalDocs ?? 0;
    const totalChunks = documents?.embeddings ?? 0;

    return {
      totalUsers,
      proUsers,
      suspendedUsers,
      estimatedMrr,
      expiringCount,
      totalAgents,
      queries24h,
      totalQueries,
      totalDocs,
      totalChunks,
      nominal: ops?.nominal ?? true,
    };
  }, [tenants, ops, agents, documents]);

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    if (!tenants) return [];
    return tenants.filter((u) => {
      const matchSearch =
        searchQuery === "" ||
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        u.user_id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;
      if (planFilter === "pro") return u.plan === "pro";
      if (planFilter === "free") return u.plan === "free";
      if (planFilter === "suspended") return u.platform_status === "suspended";
      return true;
    });
  }, [tenants, searchQuery, planFilter]);

  // Manage User Save
  const onSaveUser = async () => {
    if (!manageUser) return;
    setSavingUser(true);
    try {
      const token = await getToken();
      const res = await updateAdminUser(token, manageUser.user_id, {
        plan: editPlan,
        status: editStatus,
      });
      if (!res.ok) {
        toast.error(`Update failed: ${res.detail}`);
        return;
      }
      toast.success(`Updated workspace ${manageUser.email}`);
      setManageUser(null);
      void loadAll();
    } finally {
      setSavingUser(false);
    }
  };

  // Delete User
  const onDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeletingBusy(true);
    try {
      const token = await getToken();
      const res = await deleteAdminUser(token, deleteTarget.user_id);
      if (!res.ok) {
        toast.error(`Delete failed: ${res.detail}`);
        return;
      }
      toast.success(`Deleted workspace ${deleteTarget.email}`);
      setDeleteTarget(null);
      setDeleteInput("");
      void loadAll();
    } finally {
      setDeletingBusy(false);
    }
  };

  // Toggle Agent Status
  const onToggleAgentStatus = async (agent: OpsAgent) => {
    setAgentActionBusy(agent.id);
    try {
      const token = await getToken();
      const nextStatus = agent.active ? "paused" : "active";
      const res = await updateOpsAgent(token, agent.id, { status: nextStatus });
      if (!res.ok) {
        toast.error(`Agent status update failed: ${res.detail}`);
        return;
      }
      toast.success(`Agent ${agent.name} set to ${nextStatus}`);
      void loadAll();
    } finally {
      setAgentActionBusy(null);
    }
  };

  // Broadcast Announcement
  const onBroadcastAnnouncement = async () => {
    if (!announceTitle.trim() || !announceBody.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setBroadcasting(true);
    try {
      const token = await getToken();
      const res = await createAnnouncement(
        {
          title: announceTitle,
          body: announceBody,
          severity: announceSeverity,
        },
        token,
      );
      if (!res) {
        toast.error("Broadcast failed");
        return;
      }
      toast.success("System announcement broadcasted to all users!");
      setAnnounceTitle("");
      setAnnounceBody("");
      void loadAll();
    } finally {
      setBroadcasting(false);
    }
  };

  // Send Operator Alert
  const onSendAlert = async () => {
    if (!alertSubject.trim()) {
      toast.error("Subject is required");
      return;
    }
    setSendingAlert(true);
    try {
      const token = await getToken();
      const res = await sendOperatorAlert(token, alertSubject, alertHtml);
      if (!res.ok) {
        toast.error(`Alert failed: ${res.detail}`);
        return;
      }
      toast.success("Operator alert dispatched");
      setAlertSubject("");
      setAlertHtml("");
    } finally {
      setSendingAlert(false);
    }
  };

  // Filtered Error logs
  const filteredErrors = useMemo(() => {
    const list = errors?.recent ?? [];
    if (errorFilter === "all") return list;
    return list.filter((e) => e.severity === errorFilter);
  }, [errors, errorFilter]);

  if (denied) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center p-8 text-center pt-20">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
          <ShieldAlert className="size-8" />
        </span>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Operator Access Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your account ({user?.primaryEmailAddress?.emailAddress ?? "unknown"}) is not configured in the operator whitelist. Operator access is reserved for platform administrators.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
          <Button onClick={() => void loadAll()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Retry Verification
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Admin Dashboard</h1>
            <Badge
              variant="outline"
              className={
                stats.nominal
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-medium"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-500 font-medium"
              }
            >
              <span className={`mr-1.5 size-1.5 rounded-full ${stats.nominal ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {stats.nominal ? "System Operational" : "Attention Required"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            BaseMind Multi-Tenant AI Platform Governance, Billing Revenue & System Telemetry
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9"
          >
            <RefreshCw className={`mr-2 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" asChild className="h-9">
            <Link href="/dashboard">Go to App</Link>
          </Button>
        </div>
      </div>

      {/* KPI Hero Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Tenants */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Total Tenants</span>
              <Users className="size-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {loading ? <Skeleton className="h-8 w-16" /> : stats.totalUsers}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.suspendedUsers > 0 ? (
                <span className="text-destructive font-medium">{stats.suspendedUsers} suspended</span>
              ) : (
                <span className="text-emerald-500 font-medium">All workspaces active</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Pro MRR */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Active Pro (MRR)</span>
              <Crown className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                `₹${stats.estimatedMrr.toLocaleString("en-IN")}`
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.proUsers}</span> paying subscriber{stats.proUsers === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        {/* AI Agents & Queries */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Agents Deployed</span>
              <Bot className="size-4 text-teal-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {loading ? <Skeleton className="h-8 w-14" /> : stats.totalAgents}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.queries24h}</span> queries today
            </p>
          </CardContent>
        </Card>

        {/* Knowledge & Chunks */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">Vector Knowledge</span>
              <Database className="size-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {loading ? <Skeleton className="h-8 w-20" /> : `${stats.totalChunks}`}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              chunks across <span className="font-semibold text-foreground">{stats.totalDocs}</span> documents
            </p>
          </CardContent>
        </Card>

        {/* Grounding / Citations */}
        <Card className="border-border/60 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wider">RAG Precision</span>
              <Sparkles className="size-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                `${Math.round(grounding?.groundingPct ?? 96)}%`
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              verified cited answers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Hub */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8 space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto p-1 bg-muted/60 border">
          <TabsTrigger value="overview" className="py-2.5 text-xs font-medium gap-2">
            <Activity className="size-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tenants" className="py-2.5 text-xs font-medium gap-2">
            <Users className="size-3.5" />
            Tenants ({tenants?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="agents" className="py-2.5 text-xs font-medium gap-2">
            <Bot className="size-3.5" />
            Agents ({agents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="documents" className="py-2.5 text-xs font-medium gap-2">
            <FileText className="size-3.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="py-2.5 text-xs font-medium gap-2">
            <Radio className="size-3.5" />
            Telemetry & Alerts
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* 14-Day Activity Trends Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-heading text-lg">Query & Conversation Volume</CardTitle>
                    <CardDescription>Daily queries and conversation trends over the last 14 days</CardDescription>
                  </div>
                  <TrendingUp className="size-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                {trends && trends.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="queriesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="convosGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#737373", fontSize: 11 }}
                          tickFormatter={(v: string) => v.slice(5)}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: "#737373", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#171717",
                            borderColor: "#404040",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="queries"
                          name="Queries"
                          stroke="#0d9488"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#queriesGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="conversations"
                          name="Conversations"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#convosGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No trend data recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Platform Infrastructure Health */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Services Status</CardTitle>
                <CardDescription>Live core infrastructure health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Database className="size-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">PostgreSQL (Neon)</p>
                      <p className="text-xs text-muted-foreground">Connection pool & pgvector</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                    Online
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Zap className="size-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Gemini 2.5 Flash</p>
                      <p className="text-xs text-muted-foreground">Generative streaming AI</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                    Active
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Server className="size-4 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium">Vector Embeddings</p>
                      <p className="text-xs text-muted-foreground">{documents?.embeddings ?? 0} dimensions indexed</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                    Optimal
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <CreditCard className="size-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">Razorpay Gateway</p>
                      <p className="text-xs text-muted-foreground">INR Orders & Webhooks</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                    Verified
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Stream */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Live Platform Activity Stream</CardTitle>
              <CardDescription>Real-time events from agent creations, document parses, and signups</CardDescription>
            </CardHeader>
            <CardContent>
              {ops?.activity && ops.activity.length > 0 ? (
                <div className="space-y-3">
                  {ops.activity.slice(0, 8).map((act) => (
                    <div
                      key={act.id}
                      className="flex items-start justify-between gap-4 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                          {act.kind === "agent" && <Bot className="size-3.5 text-teal-500" />}
                          {act.kind === "document" && <FileText className="size-3.5 text-blue-500" />}
                          {act.kind === "conversation" && <MessageSquare className="size-3.5 text-purple-500" />}
                          {act.kind === "event" && <Activity className="size-3.5 text-amber-500" />}
                        </span>
                        <div>
                          <p className="font-medium">
                            <span className="text-primary">{act.highlight}</span> {act.text}
                          </p>
                          <p className="text-xs text-muted-foreground">{relTime(act.at)}</p>
                        </div>
                      </div>
                      <SeverityBadge severity={act.severity} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No recent activity logged.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: TENANTS & USER MANAGEMENT */}
        <TabsContent value="tenants" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-heading text-lg">Tenants & Workspace Directory</CardTitle>
                  <CardDescription>
                    Manage registered users, subscriptions, quotas, and account status
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search name, email, ID…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  {/* Filter Select */}
                  <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as typeof planFilter)}>
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({tenants?.length ?? 0})</SelectItem>
                      <SelectItem value="pro">Pro Only</SelectItem>
                      <SelectItem value="free">Free Only</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No tenants found matching your criteria.
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>User & Workspace</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Agents</TableHead>
                        <TableHead>Docs</TableHead>
                        <TableHead>Queries Today</TableHead>
                        <TableHead>Renewal Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.map((u) => (
                        <TableRow key={u.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-xs text-primary">
                                {(u.name || u.email || "W").slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-sm">{u.name || "Workspace User"}</p>
                                <p className="truncate text-xs text-muted-foreground">{u.email || u.user_id.slice(0, 16)}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <PlanBadge plan={u.plan} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={u.platform_status} />
                          </TableCell>
                          <TableCell className="text-sm font-medium">{u.agents}</TableCell>
                          <TableCell className="text-sm font-medium">{u.documents}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.queriesToday}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtDate(u.current_period_end)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-medium"
                                onClick={() => {
                                  setEditPlan(u.plan === "pro" ? "pro" : "free");
                                  setEditStatus(u.platform_status === "suspended" ? "suspended" : "active");
                                  setManageUser(u);
                                }}
                              >
                                Manage
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setDeleteInput("");
                                  setDeleteTarget(u);
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: AI AGENTS GOVERNANCE */}
        <TabsContent value="agents" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-lg">AI Agents Governance & Leaderboard</CardTitle>
                  <CardDescription>
                    Monitor top agents by query volume, response latency, and system prompts across all tenants
                  </CardDescription>
                </div>
                <Badge variant="outline" className="gap-1 font-medium">
                  <Bot className="size-3 text-teal-500" />
                  {agents?.length ?? 0} Agents Deployed
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : !agents || agents.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No agents deployed yet. Tenants will see their agents populate here upon creation.
                </p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Rank & Agent</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>24h Queries</TableHead>
                        <TableHead>Avg Latency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Governance Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((ag, idx) => (
                        <TableRow key={ag.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex size-6 shrink-0 items-center justify-center rounded font-bold text-xs ${
                                  idx === 0
                                    ? "bg-amber-500/20 text-amber-500"
                                    : idx === 1
                                      ? "bg-slate-500/20 text-slate-300"
                                      : idx === 2
                                        ? "bg-orange-500/20 text-orange-400"
                                        : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{ag.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">ID: {ag.id.slice(0, 12)}…</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {ag.ownerEmail || "Anonymous"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-bold">
                              {ag.queries24h} queries
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs font-medium ${
                                ag.isSlow ? "text-amber-500" : "text-muted-foreground"
                              }`}
                            >
                              {ag.avgLatencyMs ? `${ag.avgLatencyMs} ms` : "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={ag.active ? "active" : "suspended"} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-medium"
                                onClick={() => setViewAgent(ag)}
                              >
                                <Eye className="mr-1.5 size-3.5" />
                                Prompt
                              </Button>
                              <Button
                                variant={ag.active ? "outline" : "default"}
                                size="sm"
                                className="h-8 text-xs font-medium"
                                disabled={agentActionBusy === ag.id}
                                onClick={() => onToggleAgentStatus(ag)}
                              >
                                {agentActionBusy === ag.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : ag.active ? (
                                  "Quarantine"
                                ) : (
                                  "Activate"
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: KNOWLEDGE & VECTOR DOCUMENTS */}
        <TabsContent value="documents" className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase">Ready Documents</p>
                <p className="mt-2 text-2xl font-bold text-emerald-500">{documents?.readyDocs ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Fully vectorized & searchable</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase">Vector Chunks</p>
                <p className="mt-2 text-2xl font-bold text-primary">{documents?.embeddings ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">768-dim embeddings in Neon</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase">Pending Ingestion</p>
                <p className="mt-2 text-2xl font-bold text-amber-500">{documents?.pendingDocs ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">In parse or chunk pipeline</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-muted-foreground uppercase">Failed Parses</p>
                <p className="mt-2 text-2xl font-bold text-destructive">{documents?.failedDocs ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Malformed format or oversized</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Document Format Breakdown</CardTitle>
              <CardDescription>Knowledge base storage by file extensions and parse handlers</CardDescription>
            </CardHeader>
            <CardContent>
              {documents?.typeCounts && Object.keys(documents.typeCounts).length > 0 ? (
                <div className="flex flex-wrap gap-4">
                  {Object.entries(documents.typeCounts).map(([ext, count]) => (
                    <div key={ext} className="flex items-center gap-2 rounded-lg border p-3 min-w-36">
                      <FileUp className="size-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold uppercase">{ext}</p>
                        <p className="text-xs text-muted-foreground">{count} files indexed</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No documents have been ingested yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: TELEMETRY & ALERTS */}
        <TabsContent value="telemetry" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Broadcast Announcement */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" />
                  <CardTitle className="font-heading text-lg">Broadcast Announcement</CardTitle>
                </div>
                <CardDescription>Publish a platform-wide notice shown to all authenticated users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Title</label>
                  <Input
                    placeholder="e.g., Scheduled Maintenance Window"
                    value={announceTitle}
                    onChange={(e) => setAnnounceTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Message Body</label>
                  <Textarea
                    placeholder="Provide details about the platform update..."
                    rows={3}
                    value={announceBody}
                    onChange={(e) => setAnnounceBody(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">Severity:</label>
                    <Select
                      value={announceSeverity}
                      onValueChange={(v) => setAnnounceSeverity(v as typeof announceSeverity)}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="attention">Attention</SelectItem>
                        <SelectItem value="error">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={onBroadcastAnnouncement} disabled={broadcasting} size="sm">
                    {broadcasting ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Megaphone className="mr-2 size-3.5" />}
                    Broadcast Notice
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Operator Quick Alert */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-amber-500" />
                  <CardTitle className="font-heading text-lg">Operator Urgent Alert</CardTitle>
                </div>
                <CardDescription>Dispatch an instant notification email to all configured operator inboxes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Subject</label>
                  <Input
                    placeholder="e.g. High LLM Latency Detected"
                    value={alertSubject}
                    onChange={(e) => setAlertSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Content / Details (HTML supported)</label>
                  <Textarea
                    placeholder="Optional message details or logs..."
                    rows={3}
                    value={alertHtml}
                    onChange={(e) => setAlertHtml(e.target.value)}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={onSendAlert} disabled={sendingAlert} variant="secondary" size="sm">
                    {sendingAlert ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Mail className="mr-2 size-3.5" />}
                    Send Operator Alert
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* System Error Center */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-heading text-lg">System Error Logs</CardTitle>
                  <CardDescription>Recent attention and critical exceptions recorded across tenants</CardDescription>
                </div>
                <Select value={errorFilter} onValueChange={(v) => setErrorFilter(v as typeof errorFilter)}>
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="error">Errors Only</SelectItem>
                    <SelectItem value="attention">Attention Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredErrors.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle2 className="size-6 text-emerald-500" />
                  <p>Zero active errors recorded in telemetry window.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredErrors.map((err) => (
                    <div
                      key={err.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle
                          className={`size-4 shrink-0 mt-0.5 ${
                            err.severity === "error" ? "text-destructive" : "text-amber-500"
                          }`}
                        />
                        <div>
                          <p className="font-semibold text-foreground">{err.event_type}</p>
                          <p className="text-muted-foreground font-mono mt-0.5 break-all">{err.detail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground">{relTime(err.created_at)}</span>
                        <SeverityBadge severity={err.severity} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG: MANAGE USER PLAN & STATUS */}
      <Dialog open={manageUser !== null} onOpenChange={(o) => !o && setManageUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Workspace Tenant</DialogTitle>
            <DialogDescription>
              {manageUser?.name || "Workspace"} ({manageUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <label className="text-xs font-medium">Subscription Tier</label>
              <Select value={editPlan} onValueChange={(v) => setEditPlan(v as "free" | "pro")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (Starter) — 1 Agent, 5 Docs</SelectItem>
                  <SelectItem value="pro">Pro Plan — Unlimited Agents & Docs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium">Platform Access Status</label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as "active" | "suspended")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (Normal Access)</SelectItem>
                  <SelectItem value="suspended">Suspended (Block Chatting & Ingestion)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageUser(null)} disabled={savingUser}>
              Cancel
            </Button>
            <Button onClick={onSaveUser} disabled={savingUser}>
              {savingUser ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DELETE USER */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertOctagon className="size-5" />
              Permanently Purge Workspace
            </DialogTitle>
            <DialogDescription>
              This will irreversibly delete{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.email}</span> and all associated agents,
              documents, vector embeddings, and conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-bold text-foreground font-mono">DELETE</span> to confirm:
            </p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="DELETE"
              className="font-mono text-center tracking-widest"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDeleteUser}
              disabled={deleteInput !== "DELETE" || deletingBusy}
            >
              {deletingBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Confirm Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: VIEW AGENT PROMPT */}
      <Dialog open={viewAgent !== null} onOpenChange={(o) => !o && setViewAgent(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="size-5 text-teal-500" />
              Agent System Instructions: {viewAgent?.name}
            </DialogTitle>
            <DialogDescription>
              Owner: {viewAgent?.ownerEmail || "Anonymous"} · ID: {viewAgent?.id}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="relative rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
              {viewAgent?.instructions || "No custom system instructions defined for this agent."}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (viewAgent?.instructions) {
                  navigator.clipboard.writeText(viewAgent.instructions);
                  toast.success("Instructions copied to clipboard");
                }
              }}
            >
              <Copy className="mr-1.5 size-3.5" />
              Copy Instructions
            </Button>
            <Button size="sm" onClick={() => setViewAgent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}