"use client";

import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  CONNECTABLE_INTEGRATIONS,
  deriveIntelligenceStatus,
  filterIntegrations,
  getIntegrationCategories,
  normalizeIntegrationStatus,
  type IntegrationStatus,
  type IntelligenceCategory,
  type IntelligenceStatus,
  type RawConnectionStatus,
  type RawTenantConnectionSettings,
} from "@/lib/integration-registry";
import { SourceHealthBadge } from "./SourceHealthBadge";
import { useDashboardOptional } from "./DashboardContext";

export interface Connection {
  id: string;
  name: string;
  providerId: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  connected: boolean;
  status: IntegrationStatus;
  intelligenceStatus: IntelligenceStatus;
  intelligenceCategories: IntelligenceCategory[];
  lastSyncedAt: string | null;
  usedIn: string;
  addsIntelligence: string;
  actionPaths: string[];
  sourcePrompt: string | null;
}

interface SourceState {
  providerStatuses: Record<string, RawConnectionStatus>;
  settings: RawTenantConnectionSettings;
  connectionLoaded: boolean;
  settingsLoaded: boolean;
}

function ConnectionRow({
  connection,
  onClick,
  onRunAction,
}: {
  connection: Connection;
  onClick: () => void;
  onRunAction: () => void;
}) {
  const isConnected = connection.status === "connected";
  const canUseNow = connection.intelligenceStatus === "ai_using_it" ||
    connection.intelligenceStatus === "can_act_here" ||
    connection.intelligenceStatus === "signal_available";
  // The status CHIP is the single state indicator ("Connected" / "Not connected
  // yet"). The eyebrow line is reserved for DIFFERENTIATED detail only — Search
  // Console's manual-grant note — so we don't stamp "Not connected yet" twice on
  // the same card (chip + eyebrow).
  const detailCopy = !isConnected && connection.providerId === "google-search-console"
    ? "Needs a quick manual step"
    : null;

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-gray-border bg-surface-raised p-3.5 transition-colors hover:border-accent/25">
      <div className="flex items-start gap-3.5">
      <div className={`w-9 h-9 rounded-lg ${connection.iconBg} flex items-center justify-center shrink-0`}>
        <span className={`text-[14px] font-bold ${connection.iconColor}`}>{connection.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onClick}
          className="block text-left text-[13px] font-medium text-warm-black hover:text-white"
        >
          {connection.name}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SourceHealthBadge status={connection.status} lastSync={connection.lastSyncedAt} compact />
        <button
          type="button"
          onClick={onClick}
          className="rounded-full p-1 text-gray-faint transition-colors hover:bg-surface-raised hover:text-warm-white"
          aria-label={`View ${connection.name}`}
        >
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      </div>
      {/* Description spans the full card width (not the narrow middle column)
          so a short sentence doesn't ragged-wrap to 4-6 lines on a phone. */}
      <span className="block text-[12px] leading-relaxed text-gray-muted">{connection.addsIntelligence}</span>
      {detailCopy && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-faint">
            {detailCopy}
          </p>
        </div>
      )}
      {/* ONE action per row. "Manage" only for an actually-connected integration;
          everything not connected (incl. the "unknown"-status GSC row) says
          "Set up" so the verb never implies a connection that isn't there. When
          it's usable, the secondary "Ask Strelva" is a live affordance. */}
      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClick}
          className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-on-accent transition-colors hover:bg-accent/85"
        >
          {isConnected ? "Manage" : "Set up"}
        </button>
        {canUseNow && (
          <button
            type="button"
            onClick={onRunAction}
            className="rounded-lg border border-gray-border bg-surface-raised px-3 py-1.5 text-[11px] font-medium text-gray-muted transition-colors hover:border-accent/35 hover:text-warm-black"
          >
            Ask Strelva
          </button>
        )}
      </div>
    </div>
  );
}

type FilterTab = "Active" | "Needs attention" | "All";

export function ConnectionsPage() {
  const router = useRouter();
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const apiHref = dashboardHref;
  const setChatPrompt = dashboard?.setChatPrompt;
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [query, setQuery] = useState("");
  const [sourceState, setSourceState] = useState<SourceState>({
    providerStatuses: {},
    settings: {},
    connectionLoaded: false,
    settingsLoaded: false,
  });

  useEffect(() => {
    Promise.allSettled([
      fetch(apiHref("/api/tenant-settings"), { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load tenant settings");
        return r.json();
      }),
      fetch(apiHref("/api/connections"), { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load connections");
        return r.json();
      }),
    ])
      .then(([settingsResult, connectionsResult]) => {
        const nextState: SourceState = {
          providerStatuses: {},
          settings:
            settingsResult.status === "fulfilled"
              ? settingsResult.value.connections ?? {}
              : {},
          connectionLoaded: connectionsResult.status === "fulfilled",
          settingsLoaded: settingsResult.status === "fulfilled",
        };

        if (connectionsResult.status === "fulfilled") {
          for (const conn of connectionsResult.value.connections ?? []) {
            if (conn.provider) nextState.providerStatuses[conn.provider] = conn;
          }
        }

        setSourceState(nextState);
      });
  }, [apiHref]);

  const allConnections: Connection[] = useMemo(
    () =>
      CONNECTABLE_INTEGRATIONS.map((integration) => {
        const rawConnection = integration.connectionProvider
          ? sourceState.providerStatuses[integration.connectionProvider]
          : null;
        const status = normalizeIntegrationStatus(integration, {
          connection: rawConnection,
          settings: sourceState.settings,
          connectionLoaded: sourceState.connectionLoaded,
          settingsLoaded: sourceState.settingsLoaded,
        });

        return {
          id: integration.id,
          name: integration.displayName,
          providerId: integration.providerId,
          description: integration.shortDescription,
          icon: integration.icon,
          iconBg: integration.iconBg,
          iconColor: integration.iconColor,
          connected: status === "connected",
          status,
          intelligenceStatus: deriveIntelligenceStatus(integration, status),
          intelligenceCategories: getIntegrationCategories(integration),
          lastSyncedAt: rawConnection?.lastSyncedAt ?? null,
          usedIn: integration.usedIn,
          addsIntelligence: integration.addsIntelligence,
          actionPaths: integration.actionPaths ?? [],
          sourcePrompt: integration.sourcePrompt ?? null,
        };
      }),
    [sourceState]
  );

  const searchedConnectionIds = useMemo(
    () => new Set(filterIntegrations(CONNECTABLE_INTEGRATIONS, query).map((integration) => integration.id)),
    [query]
  );

  const connections = useMemo(() => {
    const searched = allConnections.filter((connection) => searchedConnectionIds.has(connection.id));
    if (activeTab === "Active") {
      return searched.filter((c) => c.intelligenceStatus === "ai_using_it" || c.intelligenceStatus === "can_act_here");
    }
    if (activeTab === "Needs attention") return searched.filter((c) => c.intelligenceStatus === "needs_attention");
    return searched;
  }, [allConnections, searchedConnectionIds, activeTab]);

  const connectedCount = allConnections.filter((c) => c.connected).length;
  const totalCount = allConnections.length;
  // The single "do this first" integration — Google Business — shown ONCE as a
  // hero and then excluded from the list below, so it never triple-lists
  // (priorities grid + recommended banner + available row was the old bug).
  const featured =
    allConnections.find((connection) => connection.id === "google-business" && connection.status !== "connected") ??
    allConnections.find((connection) => connection.id === "website-activity" && connection.status !== "connected");
  const showHero = !query.trim() && !!featured;
  const heroId = showHero ? featured?.id : undefined;

  const groupedConnections = useMemo(() => {
    // The hero (Google Business, first-run) is pulled OUT of the list so one
    // integration is never shown twice on this screen.
    const listed = connections.filter((c) => c.id !== heroId);
    const connected = listed.filter((c) => c.connected);
    const available = listed.filter((c) => !c.connected);
    return [
      { key: "connected", label: "Connected", connections: connected },
      { key: "available", label: "Available", connections: available },
    ].filter((group) => group.connections.length > 0);
  }, [connections, heroId]);

  const runConnectionPrompt = (connection: Connection) => {
    const prompt =
      connection.sourcePrompt ||
      `@${connection.name} Suggest my next site update from this source`;
    if (setChatPrompt) {
      setChatPrompt(prompt);
      router.push(dashboardHref("/dashboard/chat"));
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-5 pb-28 sm:px-8 sm:py-7 animate-route-enter">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
            Integrations
          </p>
          <h1 className="font-display text-[26px] sm:text-[32px] font-medium text-warm-black tracking-[-0.01em]">
            Connect your accounts
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-surface-inset border border-glass-border rounded-xl px-3.5 py-2 w-full sm:w-fit">
          <Search className="w-4 h-4 text-gray-subtle" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search integrations..."
            className="bg-transparent text-[13px] text-warm-black placeholder-gray-subtle outline-none w-full sm:w-[180px]"
          />
        </div>
      </div>
      <p className="text-[14px] text-gray-muted leading-relaxed max-w-[640px] mb-2">
        Connect the accounts Strelva manages for you: Google Business, reviews, booking, and more. Each one expands what we can see and update on your behalf.
      </p>
      <p className="text-[13px] text-gray-faint mb-6 sm:mb-8">
        {connectedCount} of {totalCount} connected
      </p>

      {showHero && featured && (
        <button
          type="button"
          onClick={() => router.push(dashboardHref(`/dashboard/sources/${featured.id}`))}
          className="mb-8 flex w-full items-center gap-4 rounded-2xl border border-accent/25 bg-accent-dim/60 p-4 text-left transition-colors hover:border-accent/45 sm:p-5"
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${featured.iconBg}`}>
            <span className={`text-[15px] font-bold ${featured.iconColor}`}>{featured.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent-text">Recommended first</p>
            <p className="mt-1 text-[15px] font-medium tracking-[-0.01em] text-warm-black">{featured.name}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-gray-muted">{featured.description}</p>
          </div>
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-accent sm:block" strokeWidth={1.5} />
        </button>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-glass-border mb-4 pb-0">
        {(["Active", "Needs attention", "All"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-[13px] transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "text-warm-black border-accent font-medium"
                : "text-gray-muted border-transparent hover:text-warm-black"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {groupedConnections.length > 0 ? (
        <div className="space-y-8">
          {groupedConnections.map((group) => (
            <section key={group.key}>
              {/* No per-group count — the header already carries the one honest
                  "N of M connected" tally; a second "4 accounts" here (the hero
                  is pulled out of the list) read as a contradiction. */}
              <div className="mb-3">
                <h2 className="text-[14px] font-medium text-warm-black">{group.label}</h2>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {group.connections.map((connection) => (
                  <ConnectionRow
                    key={`${group.key}-${connection.id}`}
                    connection={connection}
                    onClick={() => router.push(dashboardHref(`/dashboard/sources/${connection.id}`))}
                    onRunAction={() => runConnectionPrompt(connection)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-glass-border bg-surface-raised px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-warm-black">No connections found</p>
          <p className="mt-1 text-[13px] text-gray-muted">
            Try an account name, provider, or what it helps track.
          </p>
        </div>
      )}
    </div>
  );
}
