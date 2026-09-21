"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Check,
  Code2,
  Layers,
  Loader2,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getAgentActions,
  createAgentAction,
  updateAgentAction,
  deleteAgentAction,
  testAgentAction,
  type Agent,
  type AgentAction,
} from "@/lib/api";

interface AgentActionsDialogProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParameterItem {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50",
  PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
  DELETE: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50",
};

const PRESETS = [
  {
    label: "Order Status Tracker",
    name: "track_order",
    description: "Look up real-time shipping status and delivery updates by customer order number.",
    method: "POST" as const,
    url: "https://httpbin.org/post",
    params: [
      { name: "order_id", type: "string" as const, description: "Customer alphanumeric order ID", required: true },
      { name: "carrier", type: "string" as const, description: "Optional shipping carrier name", required: false },
    ],
  },
  {
    label: "Lead & Meeting Scheduler",
    name: "schedule_consultation",
    description: "Book an appointment or submit sales demo inquiries into the internal CRM.",
    method: "POST" as const,
    url: "https://httpbin.org/post",
    params: [
      { name: "customer_name", type: "string" as const, description: "Full name of the customer", required: true },
      { name: "email", type: "string" as const, description: "Valid contact email address", required: true },
      { name: "preferred_date", type: "string" as const, description: "Requested booking date or time window", required: true },
    ],
  },
  {
    label: "Inventory / Availability Check",
    name: "check_stock",
    description: "Query real-time stock levels or seat availability for a product SKU or service.",
    method: "POST" as const,
    url: "https://httpbin.org/post",
    params: [
      { name: "product_sku", type: "string" as const, description: "Product item SKU or identifier", required: true },
    ],
  },
];

export function AgentActionsDialog({
  agent,
  open,
  onOpenChange,
}: AgentActionsDialogProps) {
  const { getToken } = useAuth();
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formMethod, setFormMethod] = useState<"GET" | "POST" | "PUT" | "DELETE">("POST");
  const [formHeaders, setFormHeaders] = useState("{}");
  const [formParams, setFormParams] = useState<ParameterItem[]>([]);
  const [savingAction, setSavingAction] = useState(false);

  // Test Webhook State
  const [testingAction, setTestingAction] = useState<AgentAction | null>(null);
  const [testParamsJson, setTestParamsJson] = useState("{}");
  const [executingTest, setExecutingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    statusCode: number;
    latencyMs: number;
    response?: unknown;
    error?: string;
  } | null>(null);

  const refreshActions = useCallback(async () => {
    if (!agent) return;
    try {
      const token = await getToken();
      const list = await getAgentActions(token, agent.id);
      setActions(list);
    } catch {
      toast.error("Failed to refresh actions");
    }
  }, [agent, getToken]);

  useEffect(() => {
    if (!open || !agent) return;
    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      try {
        const token = await getToken();
        const list = await getAgentActions(token, agent.id);
        if (active) setActions(list);
      } catch {
        if (active) toast.error("Failed to load actions");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [open, agent, getToken]);

  const resetForm = () => {
    setEditingActionId(null);
    setFormName("");
    setFormDescription("");
    setFormWebhookUrl("");
    setFormMethod("POST");
    setFormHeaders("{}");
    setFormParams([]);
    setIsFormOpen(false);
  };

  const startCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (act: AgentAction) => {
    setEditingActionId(act.id);
    setFormName(act.name);
    setFormDescription(act.description);
    setFormWebhookUrl(act.webhookUrl);
    setFormMethod(act.method);
    setFormHeaders(act.headersJson || "{}");

    try {
      const parsed = JSON.parse(act.parametersSchemaJson || "{}");
      if (Array.isArray(parsed)) {
        setFormParams(parsed);
      } else if (parsed.properties) {
        const requiredList = parsed.required || [];
        const items: ParameterItem[] = Object.entries(parsed.properties).map(([k, val]) => {
          const v = val as { type?: string; description?: string };
          return {
            name: k,
            type: (v.type === "number" || v.type === "boolean" ? v.type : "string"),
            description: v.description || "",
            required: requiredList.includes(k),
          };
        });
        setFormParams(items);
      } else {
        setFormParams([]);
      }
    } catch {
      setFormParams([]);
    }

    setIsFormOpen(true);
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setFormName(preset.name);
    setFormDescription(preset.description);
    setFormWebhookUrl(preset.url);
    setFormMethod(preset.method);
    setFormParams(preset.params);
  };

  const handleSaveAction = async () => {
    if (!agent) return;
    const cleanName = formName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanName) {
      toast.error("Tool name is required (use lowercase letters and underscores)");
      return;
    }
    if (!formDescription.trim()) {
      toast.error("Description is required so Gemini knows when to trigger this tool");
      return;
    }
    if (!formWebhookUrl.trim().startsWith("http")) {
      toast.error("Valid Webhook URL (http:// or https://) is required");
      return;
    }

    // Build JSON parameters
    const paramsPayload = formParams.map((p) => ({
      name: p.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      type: p.type,
      description: p.description.trim(),
      required: p.required,
    }));

    setSavingAction(true);
    try {
      const token = await getToken();
      if (editingActionId) {
        const updated = await updateAgentAction(token, editingActionId, {
          name: cleanName,
          description: formDescription.trim(),
          webhook_url: formWebhookUrl.trim(),
          method: formMethod,
          headers_json: formHeaders.trim() || "{}",
          parameters_schema_json: JSON.stringify(paramsPayload),
        });
        if (updated) {
          toast.success(`Tool "${cleanName}" updated`);
          resetForm();
          await refreshActions();
        } else {
          toast.error("Failed to update tool");
        }
      } else {
        const created = await createAgentAction(token, agent.id, {
          agent_id: agent.id,
          name: cleanName,
          description: formDescription.trim(),
          webhook_url: formWebhookUrl.trim(),
          method: formMethod,
          headers_json: formHeaders.trim() || "{}",
          parameters_schema_json: JSON.stringify(paramsPayload),
          enabled: true,
        });
        if (created) {
          toast.success(`Tool "${cleanName}" created!`);
          resetForm();
          await refreshActions();
        } else {
          toast.error("Failed to create tool");
        }
      }
    } finally {
      setSavingAction(false);
    }
  };

  const handleToggleEnabled = async (act: AgentAction) => {
    try {
      const token = await getToken();
      const nextState = !act.enabled;
      setActions((prev) =>
        prev.map((a) => (a.id === act.id ? { ...a, enabled: nextState } : a))
      );
      const res = await updateAgentAction(token, act.id, { enabled: nextState });
      if (!res) {
        // Rollback
        setActions((prev) =>
          prev.map((a) => (a.id === act.id ? { ...a, enabled: act.enabled } : a))
        );
        toast.error("Could not toggle tool status");
      }
    } catch {
      toast.error("Error updating tool");
    }
  };

  const handleDelete = async (act: AgentAction) => {
    if (!confirm(`Are you sure you want to delete tool "${act.name}"?`)) return;
    try {
      const token = await getToken();
      const ok = await deleteAgentAction(token, act.id);
      if (ok) {
        toast.success(`Tool "${act.name}" removed`);
        setActions((prev) => prev.filter((a) => a.id !== act.id));
      } else {
        toast.error("Failed to delete tool");
      }
    } catch {
      toast.error("Error deleting tool");
    }
  };

  const openTestRunner = (act: AgentAction) => {
    setTestingAction(act);
    setTestResult(null);

    // Build initial sample parameters JSON from schema
    let sample: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(act.parametersSchemaJson || "[]");
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          sample[p.name] = p.type === "number" ? 123 : p.type === "boolean" ? true : `sample_${p.name}`;
        }
      } else if (parsed.properties) {
        for (const [k, v] of Object.entries(parsed.properties)) {
          const prop = v as { type?: string };
          sample[k] = prop.type === "number" ? 123 : prop.type === "boolean" ? true : `sample_${k}`;
        }
      }
    } catch {
      sample = { query: "test" };
    }
    setTestParamsJson(JSON.stringify(sample, null, 2));
  };

  const runTestWebhook = async () => {
    if (!testingAction) return;
    setExecutingTest(true);
    setTestResult(null);
    try {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(testParamsJson);
      } catch {
        toast.error("Invalid JSON in test parameters");
        setExecutingTest(false);
        return;
      }
      const token = await getToken();
      const res = await testAgentAction(token, testingAction.id, params);
      setTestResult(res);
      if (res && res.statusCode < 400) {
        toast.success(`Webhook responded with HTTP ${res.statusCode} (${res.latencyMs}ms)`);
      } else {
        toast.error(`Webhook error: ${res?.error || `HTTP ${res?.statusCode}`}`);
      }
    } catch {
      toast.error("Failed to execute test webhook");
    } finally {
      setExecutingTest(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <div>
              <DialogTitle className="font-heading text-lg">
                Agent Tools &amp; Webhooks (Function Calling)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Empower <strong className="text-foreground">{agent?.name}</strong> to perform actions and query live external systems.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-8 animate-spin mb-2" />
            <p className="text-xs">Loading tools and webhooks...</p>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Header explanation banner */}
            <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <Sparkles className="size-4 shrink-0 text-primary mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">
                    How Function Calling Works:
                  </p>
                  <p>
                    When visitors ask questions in chat (e.g. <em>&quot;Where is my package #8912?&quot;</em>),
                    Gemini 2.5 automatically identifies the matching tool, extracts parameters, triggers your webhook,
                    and synthesizes the live answer back to the visitor.
                  </p>
                </div>
              </div>
            </div>

            {/* ACTION LIST */}
            {!isFormOpen && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Configured Actions ({actions.length})</h3>
                  </div>
                  <Button
                    size="sm"
                    onClick={startCreate}
                    className="gap-1.5 text-xs shadow-xs"
                  >
                    <Plus className="size-3.5" />
                    Add Action Tool
                  </Button>
                </div>

                {actions.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <Layers className="mx-auto size-8 text-muted-foreground/60 mb-2" />
                    <p className="text-sm font-medium text-foreground">No action tools yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      Connect your shipping APIs, booking engines, or CRM webhooks to give your AI agent direct action execution powers.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startCreate}
                      className="mt-4 gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" />
                      Create First Tool
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map((act) => {
                      let paramCount = 0;
                      try {
                        const parsed = JSON.parse(act.parametersSchemaJson || "[]");
                        paramCount = Array.isArray(parsed)
                          ? parsed.length
                          : Object.keys(parsed.properties || {}).length;
                      } catch {
                        paramCount = 0;
                      }

                      return (
                        <div
                          key={act.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-xs"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono font-bold uppercase ${METHOD_COLORS[act.method] || ""}`}
                              >
                                {act.method}
                              </Badge>
                              <code className="text-xs font-semibold text-primary font-mono bg-primary/5 px-1.5 py-0.5 rounded border border-primary/20">
                                {act.name}
                              </code>
                              <Badge variant="secondary" className="text-[10px]">
                                {paramCount} {paramCount === 1 ? "param" : "params"}
                              </Badge>
                              {!act.enabled && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {act.description}
                            </p>
                            <p className="text-[11px] font-mono text-muted-foreground/80 truncate max-w-md">
                              {act.webhookUrl}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0">
                            <div className="flex items-center gap-2 mr-2">
                              <Switch
                                size="sm"
                                checked={act.enabled}
                                onCheckedChange={() => void handleToggleEnabled(act)}
                                title={act.enabled ? "Disable tool" : "Enable tool"}
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() => openTestRunner(act)}
                            >
                              <Play className="size-3 text-emerald-500 fill-emerald-500" />
                              Test
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() => startEdit(act)}
                            >
                              <Settings2 className="size-3" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleDelete(act)}
                              title="Delete action"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* CREATE / EDIT ACTION FORM */}
            {isFormOpen && (
              <div className="space-y-4 rounded-xl border bg-card/40 p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold">
                      {editingActionId ? "Edit Action Tool" : "Configure New Action Tool"}
                    </h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={resetForm}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                {!editingActionId && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Quick Start Presets:
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {PRESETS.map((p) => (
                        <Button
                          key={p.name}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-dashed"
                          onClick={() => applyPreset(p)}
                        >
                          <Sparkles className="size-3 text-primary" />
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="action-name" className="text-xs font-semibold">
                      Function Name (Alphanumeric &amp; Underscores)
                    </Label>
                    <Input
                      id="action-name"
                      placeholder="e.g. track_order_status"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Exact identifier provided to the LLM (e.g. <code className="text-primary">check_inventory</code>).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="action-method" className="text-xs font-semibold">
                      HTTP Method
                    </Label>
                    <select
                      id="action-method"
                      value={formMethod}
                      onChange={(e) => setFormMethod(e.target.value as "GET" | "POST" | "PUT" | "DELETE")}
                      className="h-9 w-full rounded-md border bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="POST">POST (JSON Body)</option>
                      <option value="GET">GET (Query Params)</option>
                      <option value="PUT">PUT (JSON Body)</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="action-webhook" className="text-xs font-semibold">
                      Webhook Target URL
                    </Label>
                    <Input
                      id="action-webhook"
                      placeholder="https://api.yourcompany.com/v1/orders/status"
                      value={formWebhookUrl}
                      onChange={(e) => setFormWebhookUrl(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      BaseMind will send an HTTP request with tool arguments to this endpoint when Gemini calls it.
                    </p>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="action-desc" className="text-xs font-semibold">
                      Tool Description (Critical for AI Tool Selection)
                    </Label>
                    <Textarea
                      id="action-desc"
                      rows={2}
                      placeholder="e.g. Queries current shipping tracking info, package transit location, and estimated arrival date for a customer order number."
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      The AI reads this description to decide when to call the webhook. Be specific!
                    </p>
                  </div>

                  {/* PARAMETERS BUILDER */}
                  <div className="space-y-2 sm:col-span-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        Function Arguments / Parameters ({formParams.length})
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          setFormParams((prev) => [
                            ...prev,
                            {
                              name: `param_${prev.length + 1}`,
                              type: "string",
                              description: "",
                              required: true,
                            },
                          ])
                        }
                      >
                        <Plus className="size-3" />
                        Add Parameter
                      </Button>
                    </div>

                    {formParams.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No parameters configured. Webhook will be invoked with an empty payload.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {formParams.map((param, index) => (
                          <div
                            key={index}
                            className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border bg-background/50 p-2.5 text-xs"
                          >
                            <div className="w-full sm:w-1/4">
                              <Input
                                placeholder="name"
                                value={param.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormParams((list) =>
                                    list.map((item, i) => (i === index ? { ...item, name: val } : item))
                                  );
                                }}
                                className="h-8 font-mono text-xs"
                              />
                            </div>
                            <div className="w-full sm:w-28">
                              <select
                                value={param.type}
                                onChange={(e) => {
                                  const val = e.target.value as "string" | "number" | "boolean";
                                  setFormParams((list) =>
                                    list.map((item, i) => (i === index ? { ...item, type: val } : item))
                                  );
                                }}
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                              >
                                <option value="string">string</option>
                                <option value="number">number</option>
                                <option value="boolean">boolean</option>
                              </select>
                            </div>
                            <div className="flex-1">
                              <Input
                                placeholder="Parameter description for AI"
                                value={param.description}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormParams((list) =>
                                    list.map((item, i) => (i === index ? { ...item, description: val } : item))
                                  );
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={param.required}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setFormParams((list) =>
                                      list.map((item, i) => (i === index ? { ...item, required: val } : item))
                                    );
                                  }}
                                  className="rounded text-primary"
                                />
                                Req.
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  setFormParams((list) => list.filter((_, i) => i !== index))
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CUSTOM HEADERS */}
                  <div className="space-y-1.5 sm:col-span-2 pt-2 border-t">
                    <Label htmlFor="action-headers" className="text-xs font-semibold">
                      Custom HTTP Headers (JSON)
                    </Label>
                    <Textarea
                      id="action-headers"
                      rows={2}
                      placeholder='{"Authorization": "Bearer secret-token", "X-Custom-Header": "value"}'
                      value={formHeaders}
                      onChange={(e) => setFormHeaders(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Optional auth headers or API keys passed directly to your webhook.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={savingAction}
                    onClick={() => void handleSaveAction()}
                    className="gap-1.5 text-xs"
                  >
                    {savingAction ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {editingActionId ? "Save Changes" : "Create Action"}
                  </Button>
                </div>
              </div>
            )}

            {/* LIVE TEST MODAL / CARD */}
            {testingAction && (
              <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Play className="size-4 text-emerald-500 fill-emerald-500" />
                    <h4 className="text-xs font-bold text-foreground">
                      Test Runner: <code className="font-mono text-primary">{testingAction.name}</code>
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => {
                      setTestingAction(null);
                      setTestResult(null);
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Test Parameters (JSON Payload)</Label>
                  <Textarea
                    rows={3}
                    value={testParamsJson}
                    onChange={(e) => setTestParamsJson(e.target.value)}
                    className="font-mono text-xs bg-background"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Sends real HTTP request to: <code className="font-mono">{testingAction.webhookUrl}</code>
                  </p>
                  <Button
                    size="sm"
                    disabled={executingTest}
                    onClick={() => void runTestWebhook()}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {executingTest ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 fill-white" />}
                    Send Test Webhook
                  </Button>
                </div>

                {testResult && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={testResult.statusCode < 400 ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        HTTP {testResult.statusCode}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Latency: {testResult.latencyMs}ms
                      </Badge>
                    </div>
                    <pre className="max-h-40 overflow-y-auto rounded-lg bg-black/80 p-3 text-[11px] font-mono text-emerald-300">
                      {JSON.stringify(testResult.response || testResult.error, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
