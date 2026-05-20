"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, CircleCheck, Unplug, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import {
  INTELLIGENCE_CATEGORY_LABELS,
  deriveIntelligenceStatus,
  getIntegrationDefinition,
  getIntegrationCategories,
  normalizeIntegrationStatus,
  type IntegrationStatus,
  type RawConnectionStatus,
  type RawTenantConnectionSettings,
} from "@/lib/integration-registry";
import { SourceHealthBadge } from "./SourceHealthBadge";
import { useDashboardOptional } from "./DashboardContext";

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ConnectionDetailPage({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const detail = getIntegrationDefinition(connectionId);

  const [credentialsValue, setCredentialsValue] = useState("");
  const [yelpApiKey, setYelpApiKey] = useState("");
  const [yelpBusinessId, setYelpBusinessId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IntegrationStatus>("not_configured");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = status === "connected";

  // Check URL params for OAuth callback results
  useEffect(() => {
    const success = searchParams.get("success");
    const errorParam = searchParams.get("error");
    if (success === "true") {
      setSaved(true);
      setStatus("connected");
      setLastSyncedAt(new Date().toISOString());
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  // Fetch actual connection/settings status; never infer a connection from static metadata.
  useEffect(() => {
    if (!detail) return;

    Promise.allSettled([
      fetch(dashboardHref("/api/tenant-settings"), { credentials: "same-origin" }).then((res) => {
        if (!res.ok) throw new Error("Failed to load tenant settings");
        return res.json();
      }),
      fetch(dashboardHref("/api/connections"), { credentials: "same-origin" }).then((res) => {
        if (!res.ok) throw new Error("Failed to load connections");
        return res.json();
      }),
    ]).then(([settingsResult, connectionsResult]) => {
      const settings: RawTenantConnectionSettings =
        settingsResult.status === "fulfilled" ? settingsResult.value.connections ?? {} : {};
      const connections: RawConnectionStatus[] =
        connectionsResult.status === "fulfilled" ? connectionsResult.value.connections ?? [] : [];
      const conn = detail.connectionProvider
        ? connections.find((item) => item.provider === detail.connectionProvider) ?? null
        : null;

      setStatus(
        normalizeIntegrationStatus(detail, {
          connection: conn,
          settings,
          connectionLoaded: connectionsResult.status === "fulfilled",
          settingsLoaded: settingsResult.status === "fulfilled",
        })
      );
      setLastSyncedAt(conn?.lastSyncedAt ?? null);
    });
  }, [dashboardHref, detail]);

  const handleSaveCredentials = async () => {
    if (!detail?.configField || !credentialsValue.trim()) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(dashboardHref("/api/tenant-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [detail.configField]: credentialsValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      setStatus("connected");
      setCredentialsValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleYelpConnect = async () => {
    if (!yelpApiKey.trim() || !yelpBusinessId.trim()) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(dashboardHref("/api/connections/yelp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: yelpApiKey, businessId: yelpBusinessId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect");
      }

      setSaved(true);
      setStatus("connected");
      setLastSyncedAt(new Date().toISOString());
      setYelpApiKey("");
      setYelpBusinessId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!detail?.connectionProvider) return;

    setDisconnecting(true);
    setError(null);

    try {
      const endpointMap: Record<string, string> = {
        google: "/api/connections/google",
        yelp: "/api/connections/yelp",
        calendly: "/api/connections/calendly",
        instagram: "/api/connections/instagram",
        vegaro: "/api/connections/vegaro",
      };
      const endpoint = endpointMap[detail.connectionProvider] || "/api/connections/google";
      const res = await fetch(dashboardHref(endpoint), { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disconnect");
      }

      setStatus("not_configured");
      setLastSyncedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-muted">Connection not found</p>
      </div>
    );
  }

  const intelligenceStatus = deriveIntelligenceStatus(detail, status);
  const categories = getIntegrationCategories(detail);
  const canUseNow = intelligenceStatus === "ai_using_it" ||
    intelligenceStatus === "can_act_here" ||
    intelligenceStatus === "signal_available";
  const setupPath = status === "connected"
    ? "Connected and available according to the current sync status."
    : status === "coming_soon"
      ? "This source is planned. It is not available for setup yet."
      : detail.connectionProvider === "google"
        ? "Connect Google once, then the AI can use this as trusted business context."
        : detail.id === "google-search-console"
          ? "This source uses manual Search Console credential setup today, not OAuth."
          : detail.connectionProvider
            ? "Connect the provider before this source influences AI decisions."
            : detail.builtIn
              ? "This is a built-in Scaffold Web signal."
              : "Set this up before it influences AI decisions.";

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-14 lg:py-10 animate-route-enter">
      {/* Back link */}
      <button
        onClick={() => router.push(dashboardHref("/dashboard/sources"))}
        className="flex items-center gap-1.5 text-gray-faint hover:text-gray-muted transition-colors mb-8"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-[13px]">Sources</span>
      </button>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="w-16 h-16 rounded-[18px] bg-accent-dim border border-accent/20 flex items-center justify-center">
          <span className="text-[20px] font-bold text-accent">{detail.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-semibold text-warm-black">{detail.displayName}</h1>
          <p className="text-[13px] text-gray-muted mt-1">
            {detail.shortDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SourceHealthBadge status={intelligenceStatus} lastSync={lastSyncedAt} compact />
          {!isConnected && detail.connectionProvider === "google" && (
            <a
              href={dashboardHref("/api/oauth/google")}
              className="rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors inline-flex items-center"
            >
              Connect with Google
            </a>
          )}
          {!isConnected && detail.connectionProvider === "calendly" && (
            <a
              href={dashboardHref("/api/oauth/calendly")}
              className="rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors inline-flex items-center"
            >
              Connect with Calendly
            </a>
          )}
          {!isConnected && detail.connectionProvider === "instagram" && (
            <a
              href={dashboardHref("/api/oauth/instagram")}
              className="rounded-xl bg-accent px-6 py-2.5 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors inline-flex items-center"
            >
              Connect with Instagram
            </a>
          )}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-gray-border bg-surface-raised p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-faint">Setup path</p>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{detail.description}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-gray-fg">{setupPath}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] mb-8">
        <div className="rounded-2xl border border-gray-border bg-surface-raised p-5">
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">
            What this signal is
          </span>
          <p className="mt-2 text-[15px] font-medium text-warm-black">{detail.addsIntelligence}</p>
          {canUseNow ? (
            <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">
              This source is active. The AI uses it in chat, suggestions, and the weekly report when relevant data lands.
            </p>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-gray-muted">
              {status === "coming_soon"
                ? "Not available for setup yet — listed here so you know it's planned."
                : "Connect this source before the AI uses it. Until then, it stays silent — no fabricated insights, no fake numbers."}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-border bg-surface-raised p-5">
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">Connection state</span>
          <div className="mt-3">
            <SourceHealthBadge status={intelligenceStatus} lastSync={lastSyncedAt} />
          </div>
          <div className="mt-5">
            <span className="text-[11px] text-gray-faint uppercase tracking-wider">Where this appears</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.appearsIn.map((item) => (
                <span key={item} className="rounded-full border border-gray-border bg-surface-inset px-2.5 py-1 text-[11px] text-gray-muted">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <span className="text-[11px] text-gray-faint uppercase tracking-wider">Intelligence group</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map((category) => (
                <span key={category} className="rounded-full border border-gray-border bg-surface-inset px-2.5 py-1 text-[11px] text-gray-muted">
                  {INTELLIGENCE_CATEGORY_LABELS[category]}
                </span>
              ))}
            </div>
          </div>
          {detail.actionPaths?.length ? (
            <div className="mt-5">
              <span className="text-[11px] text-gray-faint uppercase tracking-wider">Action paths</span>
              <ul className="mt-2 space-y-1.5">
                {detail.actionPaths.map((path) => (
                  <li key={path} className="text-[12px] leading-relaxed text-gray-muted">
                    {path}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div>
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">Refresh behavior</span>
          <p className="text-[13px] text-warm-black mt-1">{detail.syncFrequency}</p>
        </div>
        {lastSyncedAt && (
          <div>
            <span className="text-[11px] text-gray-faint uppercase tracking-wider">Last synced</span>
            <p className="text-[13px] text-warm-black mt-1 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 text-gray-faint" />
              {formatRelativeTime(lastSyncedAt)}
            </p>
          </div>
        )}
        <div>
          <span className="text-[11px] text-gray-faint uppercase tracking-wider">Used in</span>
          <p className="text-[13px] text-warm-black mt-1">{detail.usedIn}</p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-terra/10 border border-terra/20 px-4 py-3 text-[13px] text-terra">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Success message */}
      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-accent/10 border border-accent/20 px-4 py-3 text-[13px] text-accent">
          <CircleCheck className="w-4 h-4" />
          Connection saved successfully
        </div>
      )}

      {/* Yelp credentials form */}
      {detail.connectionProvider === "yelp" && !isConnected && (
        <div className="mb-8 max-w-[600px]">
          <h3 className="text-[13px] font-medium text-warm-black mb-3">Yelp API Credentials</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-gray-muted block mb-1.5">API Key</label>
              <input
                type="password"
                value={yelpApiKey}
                onChange={(e) => setYelpApiKey(e.target.value)}
                placeholder="Your Yelp Fusion API key"
                className="w-full rounded-xl bg-surface-raised border border-gray-border px-4 py-2.5 text-[13px] text-warm-black placeholder:text-gray-faint font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="text-[12px] text-gray-muted block mb-1.5">Business ID</label>
              <input
                type="text"
                value={yelpBusinessId}
                onChange={(e) => setYelpBusinessId(e.target.value)}
                placeholder="your-business-name-city"
                className="w-full rounded-xl bg-surface-raised border border-gray-border px-4 py-2.5 text-[13px] text-warm-black placeholder:text-gray-faint font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <button
              onClick={handleYelpConnect}
              disabled={saving || !yelpApiKey.trim() || !yelpBusinessId.trim()}
              className="rounded-xl bg-accent px-5 py-2 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Connecting..." : "Connect Yelp"}
            </button>
            <p className="text-[11px] text-gray-faint leading-relaxed">
              Get your API key from the{" "}
              <a
                href="https://www.yelp.com/developers/v3/manage_app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Yelp Fusion API
              </a>
              . Your Business ID is the last part of your Yelp page URL.
            </p>
          </div>
        </div>
      )}

      {/* Coming soon */}
      {status === "coming_soon" && (
        <div className="mb-8 max-w-[600px] rounded-2xl border border-glass-border bg-surface-raised px-5 py-4">
          <h3 className="text-[13px] font-medium text-warm-black mb-1">Connection coming soon</h3>
          <p className="text-[12px] text-gray-muted leading-relaxed">
            This source is visible so you can see what it will support, but setup is not available yet.
          </p>
        </div>
      )}

      {/* Credentials form for configurable connections */}
      {detail.configField && (
        <div className="mb-8 max-w-[600px]">
          <h3 className="text-[13px] font-medium text-warm-black mb-3">
            {detail.id === "google-search-console" ? "Service Account Key (JSON)" : "Credentials"}
          </h3>
          <textarea
            value={credentialsValue}
            onChange={(e) => setCredentialsValue(e.target.value)}
            placeholder={
              detail.id === "google-search-console"
                ? 'Paste your Google Cloud service account JSON key here...'
                : "Enter credentials..."
            }
            rows={6}
            className="w-full rounded-xl bg-surface-raised border border-gray-border px-4 py-3 text-[13px] text-warm-black placeholder:text-gray-faint font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={handleSaveCredentials}
              disabled={saving || !credentialsValue.trim()}
              className="rounded-xl bg-accent px-5 py-2 text-[13px] font-medium text-white hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Saving..." : "Save Credentials"}
            </button>
            {saved && (
              <span className="text-[12px] text-accent flex items-center gap-1.5">
                <CircleCheck className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            {error && (
              <span className="text-[12px] text-terra">{error}</span>
            )}
          </div>
          {detail.id === "google-search-console" && (
            <p className="text-[11px] text-gray-faint mt-3 leading-relaxed">
              Create a service account in Google Cloud Console, download the JSON key, and paste it above.
              Make sure the service account has access to your Search Console property.
            </p>
          )}
        </div>
      )}

      {/* Disconnect */}
      {isConnected && detail.connectionProvider && (
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-3 text-terra hover:text-terra-light transition-colors disabled:opacity-50"
        >
          {disconnecting ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Unplug className="w-4 h-4" strokeWidth={1.5} />
          )}
          <span className="text-[13px] font-medium">{disconnecting ? "Disconnecting..." : "Disconnect"}</span>
        </button>
      )}
    </div>
  );
}
