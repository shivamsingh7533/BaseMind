"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Check,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  deleteUserApiKey,
  getUserApiKeys,
  saveUserApiKey,
  type AvailableModel,
  type UserApiKey,
} from "@/lib/api";

interface ProviderConfig {
  provider: "gemini" | "openai" | "anthropic" | "custom";
  name: string;
  tagline: string;
  placeholder: string;
  defaultActive?: boolean;
  docUrl: string;
  accent: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "gemini",
    name: "Google Gemini",
    tagline: "Gemini 3.6 Flash & 2.5 Pro (Default Platform Engine)",
    placeholder: "AIzaSy...",
    defaultActive: true,
    docUrl: "https://aistudio.google.com/app/apikey",
    accent: "text-blue-500",
  },
  {
    provider: "openai",
    name: "OpenAI",
    tagline: "GPT-4o & GPT-4o-mini",
    placeholder: "sk-proj-...",
    docUrl: "https://platform.openai.com/api-keys",
    accent: "text-emerald-500",
  },
  {
    provider: "anthropic",
    name: "Anthropic",
    tagline: "Claude 3.5 Sonnet",
    placeholder: "sk-ant-...",
    docUrl: "https://console.anthropic.com/settings/keys",
    accent: "text-amber-500",
  },
  {
    provider: "custom",
    name: "Custom OpenAI Endpoint",
    tagline: "Groq, Together AI, DeepSeek, or Self-Hosted vLLM",
    placeholder: "gsk_... or custom key",
    docUrl: "https://console.groq.com/keys",
    accent: "text-purple-500",
  },
];

export function LlmKeysCard() {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<UserApiKey[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [inputBaseUrl, setInputBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const token = await getToken();
        const res = await getUserApiKeys(token);
        if (active && res) {
          setKeys(res.keys);
          setAvailableModels(res.availableModels);
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [getToken]);

  const refreshKeys = async () => {
    try {
      const token = await getToken();
      const res = await getUserApiKeys(token);
      if (res) {
        setKeys(res.keys);
        setAvailableModels(res.availableModels);
      }
    } catch {
      toast.error("Failed to reload API keys");
    }
  };

  const openConfig = (p: ProviderConfig) => {
    setSelectedProvider(p);
    const existing = keys.find((k) => k.provider === p.provider);
    setInputKey("");
    setInputBaseUrl(existing?.baseUrl || (p.provider === "custom" ? "https://api.groq.com/openai/v1" : ""));
    setShowKey(false);
  };

  const handleSave = async () => {
    if (!selectedProvider) return;
    if (!inputKey.trim()) {
      toast.error("Please enter a valid API key");
      return;
    }
    if (selectedProvider.provider === "custom" && !inputBaseUrl.trim().startsWith("http")) {
      toast.error("Base URL is required for custom endpoints (e.g. https://api.groq.com/openai/v1)");
      return;
    }

    setTesting(true);
    try {
      const token = await getToken();
      const res = await saveUserApiKey(token, {
        provider: selectedProvider.provider,
        api_key: inputKey.trim(),
        base_url: selectedProvider.provider === "custom" ? inputBaseUrl.trim() : undefined,
      });

      if (res.ok) {
        toast.success(res.message || `${selectedProvider.name} key verified & saved!`);
        setSelectedProvider(null);
        await refreshKeys();
      } else {
        toast.error(`Verification failed: ${res.detail}`);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleRevoke = async () => {
    if (!selectedProvider) return;
    setRevoking(true);
    try {
      const token = await getToken();
      const ok = await deleteUserApiKey(token, selectedProvider.provider);
      if (ok) {
        toast.success(`${selectedProvider.name} key revoked`);
        setSelectedProvider(null);
        await refreshKeys();
      } else {
        toast.error("Failed to revoke key");
      }
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card className="mt-6 border-primary/20 shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-primary" />
            <CardTitle className="font-heading text-lg">
              AI Foundation Models &amp; BYOK (Bring Your Own Key)
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refreshKeys()}
            className="size-8 text-muted-foreground hover:text-foreground"
            title="Refresh keys status"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <CardDescription>
          BaseMind includes built-in Google Gemini platform quota. You can also connect your own OpenAI,
          Anthropic, or custom cloud API keys with zero markup and automated fallback failover.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Security Banner */}
        <div className="flex items-center gap-2.5 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Lock className="size-4 shrink-0 text-emerald-500" />
          <span>
            Enterprise Security: All API keys are encrypted at rest using <strong>AES-256 (Fernet)</strong> with
            isolated database storage. Plaintext keys are never stored, logged, or transmitted back to clients.
          </span>
        </div>

        {/* Provider Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-6 animate-spin mr-2" />
            <span className="text-xs">Loading AI keys status…</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((p) => {
              const userKey = keys.find((k) => k.provider === p.provider);
              const isActive = Boolean(userKey?.isValid);

              return (
                <div
                  key={p.provider}
                  className="flex flex-col justify-between rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold text-sm ${p.accent}`}>
                        {p.name}
                      </span>
                      {isActive ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]"
                        >
                          <Check className="size-3 mr-1" />
                          Custom Key ({userKey?.keyHashSuffix})
                        </Badge>
                      ) : p.defaultActive ? (
                        <Badge
                          variant="outline"
                          className="border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]"
                        >
                          Platform Quota Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] text-muted-foreground"
                        >
                          Not Configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.tagline}</p>
                    {userKey?.baseUrl && (
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        Endpoint: {userKey.baseUrl}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-2 border-t text-xs">
                    <a
                      href={p.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-primary transition"
                    >
                      Get API Key ↗
                    </a>
                    <Button
                      size="sm"
                      variant={isActive ? "outline" : "default"}
                      onClick={() => openConfig(p)}
                      className="h-7 text-xs gap-1.5"
                    >
                      <KeyRound className="size-3" />
                      {isActive ? "Change Key" : "Add Key"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Available Models Preview Bar */}
        {availableModels.length > 0 && (
          <div className="rounded-xl border bg-card/60 p-3 pt-2 text-xs">
            <div className="flex items-center gap-1.5 mb-1.5 font-medium text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>Available Model Gateway Fleet ({availableModels.length} models)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableModels.map((m) => (
                <Badge
                  key={m.id}
                  variant="outline"
                  className="text-[10px] py-0.5"
                >
                  <span className="font-semibold text-foreground mr-1">{m.name}</span>
                  <span className="text-muted-foreground font-mono">({m.provider})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* CONFIGURE KEY DIALOG */}
      <Dialog open={selectedProvider !== null} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="size-4" />
              </div>
              <DialogTitle className="text-base font-heading">
                Configure {selectedProvider?.name} API Key
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              BaseMind will perform a real-time verification ping before safely encrypting your key.
            </DialogDescription>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-3.5 py-2">
              {selectedProvider.provider === "custom" && (
                <div className="space-y-1">
                  <Label htmlFor="custom-url" className="text-xs font-semibold">
                    API Base URL (OpenAI-Compatible)
                  </Label>
                  <Input
                    id="custom-url"
                    type="url"
                    placeholder="https://api.groq.com/openai/v1"
                    value={inputBaseUrl}
                    onChange={(e) => setInputBaseUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Compatible with Groq, Together, DeepSeek, or vLLM endpoints.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="key-input" className="text-xs font-semibold">
                    API Secret Key
                  </Label>
                  <a
                    href={selectedProvider.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    Generate at {selectedProvider.name} ↗
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="key-input"
                    type={showKey ? "text" : "password"}
                    placeholder={selectedProvider.placeholder}
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    className="font-mono text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {keys.some((k) => k.provider === selectedProvider.provider) && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Active Custom Key</p>
                    <p className="text-[11px] text-muted-foreground">
                      Suffix: {keys.find((k) => k.provider === selectedProvider.provider)?.keyHashSuffix}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoking}
                    onClick={() => void handleRevoke()}
                    className="h-7 text-xs text-destructive hover:bg-destructive/10"
                  >
                    {revoking ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
                    Revoke Key
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProvider(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={testing}
              onClick={() => void handleSave()}
              className="gap-1.5 text-xs shadow-xs"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Verify &amp; Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
