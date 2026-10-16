"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { XaAnswers, XaButton, XaField, XaInitial, XaSays, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashNote, DashPage } from "./xa/DashboardXa";
import { ConfirmDialog } from "./ConfirmDialog";
import { connectionStatusWord } from "./ConnectionsPage";
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
  const [platformReady, setPlatformReady] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const isConnected = status === "connected";

  // Check URL params for the provider sign-in callback results
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
      setPlatformReady(conn?.platformReady !== false);
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
      <DashEmpty pose="alone" title="There's no connection by that name." job="Your other connections are unchanged"
        action={<XaTextLink href={dashboardHref("/dashboard/integrations")}>See every connection</XaTextLink>} />
    );
  }

  const intelligenceStatus = deriveIntelligenceStatus(detail, status);
  const categories = getIntegrationCategories(detail);
  const canUseNow = intelligenceStatus === "ai_using_it" ||
    intelligenceStatus === "can_act_here" ||
    intelligenceStatus === "signal_available";
  const setupPath = status === "connected"
    ? "Connected. Strelva reads it each time it syncs."
    : detail.connectionProvider === "google"
      ? "Connect Google once to link your Business Profile, Search Console and Analytics. Then Strelva can rely on it."
      : detail.id === "google-search-console"
        ? "This one uses a key you paste in below, not a sign-in button."
        : detail.connectionProvider
          ? "Connect it first. Until then Strelva doesn't use it."
          : detail.builtIn
            ? "This comes built into Strelva. Nothing to connect."
            : "Set it up first. Until then Strelva doesn't use it.";

  const state = connectionStatusWord(status);
  const oauthHref = !isConnected && platformReady && detail.connectionProvider && ["google", "calendly", "instagram"].includes(detail.connectionProvider)
    ? dashboardHref(`/api/oauth/${detail.connectionProvider}`) : null;
  const providerName = detail.connectionProvider === "google" ? "Google" : detail.connectionProvider === "calendly" ? "Calendly" : detail.connectionProvider === "instagram" ? "Instagram" : detail.displayName;

  return (
    <DashPage
      title={`${detail.displayName}.`}
      quiet={detail.shortDescription}
      lead={<XaInitial name={detail.displayName} size={48} />}
      actions={oauthHref ? <XaButton variant="primary" onClick={() => window.location.assign(oauthHref)}>Connect with {providerName}</XaButton>
        : isConnected ? <XaStatus kind="live">Connected{lastSyncedAt ? `, synced ${formatRelativeTime(lastSyncedAt)}` : ""}</XaStatus>
          : state.kind ? <XaStatus kind={state.kind === "live" ? "live" : state.kind}>{state.word}</XaStatus> : null}
      width="narrow"
      label={detail.displayName}
    >
      <p className="m-0 text-[14px]"><XaTextLink href={dashboardHref("/dashboard/integrations")}>Back to Connections</XaTextLink></p>
      {!isConnected && !platformReady ? <DashNote tone="quiet">Strelva hasn&apos;t switched {detail.displayName} on yet. Connecting works once it has.</DashNote> : null}
      {error ? <DashNote tone="down" role="alert">{error}</DashNote> : null}
      {saved ? <DashNote tone="live" role="status">Saved. {detail.displayName} is connected.</DashNote> : null}

      <XaSays>{setupPath}</XaSays>

      <XaAnswers labelWidth={160} rows={[
        ["What it gives Strelva", <>{detail.addsIntelligence} {canUseNow ? "Strelva uses it in chat, ideas and your weekly report when new data lands." : "Until it is connected, it stays silent: no made-up numbers."}</>],
        ["Where it shows up", detail.appearsIn.join(", ")],
        ["Kinds of signal", categories.map((category) => INTELLIGENCE_CATEGORY_LABELS[category]).join(", ")],
        ...(detail.actionPaths?.length ? [["What Strelva can do", detail.actionPaths.join(". ")] as const] : []),
        ["Refreshes", detail.syncFrequency],
        ...(lastSyncedAt ? [["Last synced", formatRelativeTime(lastSyncedAt)] as const] : []),
        ["Used in", detail.usedIn],
      ]} />

      {detail.connectionProvider === "yelp" && !isConnected && (
        <form className="flex max-w-[520px] flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleYelpConnect(); }}>
          <XaField label="Yelp API key" type="password" value={yelpApiKey} onChange={(e) => setYelpApiKey(e.target.value)} placeholder="Your Yelp Fusion API key" autoComplete="off" />
          <XaField label="Yelp business ID" value={yelpBusinessId} onChange={(e) => setYelpBusinessId(e.target.value)} placeholder="your-business-name-city"
            hint={<>Find the key in <a className="text-[var(--st-accent)] hover:underline" href="https://www.yelp.com/developers/v3/manage_app" target="_blank" rel="noopener noreferrer">Yelp Fusion</a>. The business ID is the last part of your Yelp page address.</>} />
          <div><XaButton type="submit" busy={saving} disabled={!yelpApiKey.trim() || !yelpBusinessId.trim()}>Connect Yelp</XaButton></div>
        </form>
      )}

      {detail.configField && (
        <form className="flex max-w-[560px] flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleSaveCredentials(); }}>
          <XaTextArea
            label={detail.id === "google-search-console" ? "Service account key" : "Credentials"}
            value={credentialsValue}
            onChange={(e) => setCredentialsValue(e.target.value)}
            placeholder={detail.id === "google-search-console" ? "Paste the key file Google Cloud gave you" : "Paste the credentials"}
            rows={6}
            hint={detail.id === "google-search-console" ? "Make a service account in Google Cloud, download its key, paste it here, and give it access to your Search Console property." : undefined}
          />
          <div><XaButton type="submit" busy={saving} disabled={!credentialsValue.trim()}>Save credentials</XaButton></div>
        </form>
      )}

      {isConnected && detail.connectionProvider ? (
        <p className="m-0 text-[14px]"><XaTextLink onClick={() => setConfirmDisconnect(true)}>Disconnect {detail.displayName}</XaTextLink></p>
      ) : null}
      <ConfirmDialog open={confirmDisconnect} busy={disconnecting} destructive title={`Disconnect ${detail.displayName}?`} confirmLabel="Disconnect" cancelLabel="Keep it connected"
        message={`Strelva stops reading ${detail.displayName}. Nothing already on your site or listing changes, and you can connect it again any time.`}
        onCancel={() => setConfirmDisconnect(false)} onConfirm={async () => { await handleDisconnect(); setConfirmDisconnect(false); }} />
    </DashPage>
  );
}
