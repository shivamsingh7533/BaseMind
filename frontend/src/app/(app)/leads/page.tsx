"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Building2,
  Clock,
  Copy,
  Download,
  Inbox,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteLead,
  exportLeadsCsv,
  getAgents,
  getLeads,
  updateLead,
  type Agent,
  type Lead,
  type LeadsSummary,
  type LeadStatus,
} from "@/lib/api";

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; badge: string; dot: string }
> = {
  new: {
    label: "New",
    badge: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    dot: "bg-blue-500 animate-pulse",
  },
  contacted: {
    label: "Contacted",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    dot: "bg-amber-500",
  },
  qualified: {
    label: "Qualified",
    badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  closed: {
    label: "Closed",
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};

export default function LeadsPage() {
  const { getToken } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<LeadsSummary>({
    total: 0,
    today: 0,
    contacted: 0,
    conversionRate: 0,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const token = await getToken();
        const [leadsRes, agentsRes] = await Promise.all([
          getLeads(token, {
            agentId: selectedAgent,
            status: selectedStatus,
            q: search,
          }),
          getAgents(token),
        ]);

        if (leadsRes) {
          setLeads(leadsRes.leads);
          setSummary(leadsRes.summary);
        }
        if (agentsRes) {
          setAgents(agentsRes);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getToken, selectedAgent, selectedStatus, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );

    const token = await getToken();
    const updated = await updateLead(token, leadId, { status: newStatus });
    if (!updated) {
      toast.error("Failed to update status");
      void loadData();
    } else {
      toast.success(`Lead marked as ${STATUS_CONFIG[newStatus].label}`);
    }
  };

  const handleDelete = async (leadId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this lead?"
    );
    if (!confirmed) return;

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    const token = await getToken();
    const ok = await deleteLead(token, leadId);
    if (!ok) {
      toast.error("Failed to delete lead");
      void loadData();
    } else {
      toast.success("Lead removed");
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const blob = await exportLeadsCsv(token);
      if (!blob) {
        toast.error("Export failed");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `basemind-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("CSV file downloaded successfully!");
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (selectedStatus !== "all" && lead.status !== selectedStatus)
        return false;
      if (selectedAgent !== "all" && lead.agentId !== selectedAgent)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = lead.name?.toLowerCase().includes(q);
        const matchesEmail = lead.email?.toLowerCase().includes(q);
        const matchesCompany = lead.company?.toLowerCase().includes(q);
        const matchesMsg = lead.message?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesCompany && !matchesMsg)
          return false;
      }
      return true;
    });
  }, [leads, selectedStatus, selectedAgent, search]);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Leads & Inquiries
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              {summary.total} Total
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Capture contact information from visitors interacting with your
            embedded AI widgets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing || loading}
            className="text-xs gap-1.5"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={handleExportCsv}
            disabled={exporting || leads.length === 0}
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Total Leads Captured
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {summary.total}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All-time inquiries
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                New Today (24h)
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1 flex items-center gap-2">
                <span>{summary.today}</span>
                {summary.today > 0 && (
                  <span className="flex size-2 rounded-full bg-emerald-500 animate-ping" />
                )}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Recent prospects
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                In Discussion
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {summary.contacted}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Contacted or qualified
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <UserCheck className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Engagement Rate
              </p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {summary.conversionRate}%
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Response progress
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Sparkles className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card/40 p-3 rounded-xl border">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company…"
            className="pl-8 text-xs h-9"
          />
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Agent Filter */}
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary/50"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {(["all", "new", "contacted", "qualified", "closed"] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStatus(st)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                    selectedStatus === st
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* LEADS TABLE */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card className="border border-dashed p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
            <Inbox className="size-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            No leads found
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {search || selectedAgent !== "all" || selectedStatus !== "all"
              ? "No leads matched your current filters. Try resetting the search or filter options."
              : "Enable 'Visitor Lead Capture Form' on your agents in the Agents Studio to start collecting contact details from your website visitors."}
          </p>
        </Card>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/30 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Visitor</th>
                  <th className="px-4 py-3">Company & Phone</th>
                  <th className="px-4 py-3">Agent Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Captured</th>
                  <th className="px-4 py-3">Inquiry Note</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredLeads.map((lead) => {
                  const initial =
                    (lead.name || lead.email || "V")[0]?.toUpperCase() || "V";
                  const statusInfo =
                    STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* VISITOR NAME & EMAIL */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {lead.name || "Anonymous Visitor"}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="truncate">{lead.email}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(lead.email, "Email")
                                }
                                className="text-muted-foreground hover:text-foreground"
                                title="Copy email"
                              >
                                <Copy className="size-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* COMPANY & PHONE */}
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="space-y-0.5">
                          {lead.company ? (
                            <p className="flex items-center gap-1 text-foreground/90 font-medium">
                              <Building2 className="size-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{lead.company}</span>
                            </p>
                          ) : null}
                          {lead.phone ? (
                            <p className="flex items-center gap-1 text-[11px]">
                              <Phone className="size-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{lead.phone}</span>
                            </p>
                          ) : !lead.company ? (
                            <span className="text-muted-foreground/60">—</span>
                          ) : null}
                        </div>
                      </td>

                      {/* AGENT BADGE */}
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className="text-[11px] gap-1 font-normal py-0.5"
                        >
                          <span className="size-1.5 rounded-full bg-primary" />
                          <span className="truncate max-w-[120px]">
                            {lead.agentName || "General Bot"}
                          </span>
                        </Badge>
                      </td>

                      {/* STATUS DROPDOWN */}
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border cursor-pointer transition-all ${statusInfo.badge}`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${statusInfo.dot}`}
                              />
                              <span>{statusInfo.label}</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {(
                              [
                                "new",
                                "contacted",
                                "qualified",
                                "closed",
                              ] as const
                            ).map((st) => (
                              <DropdownMenuItem
                                key={st}
                                onClick={() =>
                                  void handleStatusChange(lead.id, st)
                                }
                                className="text-xs capitalize"
                              >
                                Mark as {st}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>

                      {/* DATE */}
                      <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                        {lead.createdAt ? (
                          <span>
                            {new Date(lead.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* MESSAGE NOTE */}
                      <td className="px-4 py-3 max-w-xs">
                        {lead.message ? (
                          <p
                            className="truncate text-muted-foreground text-[11px]"
                            title={lead.message}
                          >
                            &ldquo;{lead.message}&rdquo;
                          </p>
                        ) : (
                          <span className="text-muted-foreground/50 text-[11px]">
                            None
                          </span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lead.conversationId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-foreground"
                              asChild
                              title="View chat thread"
                            >
                              <a href="/logs">
                                <MessageSquare className="size-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => void handleDelete(lead.id)}
                            title="Delete lead"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
