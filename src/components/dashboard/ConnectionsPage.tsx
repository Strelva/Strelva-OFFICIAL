"use client";

import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  DISCOVERABLE_INTEGRATIONS,
  INTELLIGENCE_CATEGORY_LABELS,
  deriveIntelligenceStatus,
  filterIntegrations,
  getIntegrationCategories,
  normalizeIntegrationStatus,
  type IntegrationUsageExample,
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
  usageExamples: IntegrationUsageExample[];
  addsIntelligence: string;
  aiCanUseThisTo: string[];
  exampleInsight: string;
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
  const needsSetup = connection.status === "not_configured" || connection.status === "needs_reauth" || connection.status === "sync_failed";
  const canUseNow = connection.intelligenceStatus === "ai_using_it" ||
    connection.intelligenceStatus === "can_act_here" ||
    connection.intelligenceStatus === "signal_available";
  const setupCopy = connection.status === "connected"
    ? "Connected account"
    : connection.status === "coming_soon"
      ? "Planned source"
      : connection.providerId === "google-business"
        ? "OAuth ready"
        : connection.providerId === "google-search-console"
          ? "Manual Search Console setup"
          : connection.connected
            ? "Available"
            : needsSetup
              ? "Setup required"
              : "Built-in signal";
  const actionCopy = canUseNow ? "Ask AI with source" : "Connect first";

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-gray-border bg-surface-raised p-4 transition-colors hover:border-accent/25">
      <div className="flex items-start gap-3.5">
      <div className={`w-[42px] h-[42px] rounded-xl ${connection.iconBg} flex items-center justify-center shrink-0`}>
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
        <span className="text-[12px] text-gray-muted block mt-0.5">{connection.addsIntelligence}</span>
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
      <div className="grid grid-cols-[88px_1fr] gap-3 rounded-lg border border-gray-border bg-surface-inset px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-faint">Setup</span>
        <span className="text-[12px] text-warm-white">{setupCopy}</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-faint">Feeds</span>
        <span className="text-[12px] leading-relaxed text-gray-muted">{connection.usedIn}</span>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-faint">
          {canUseNow ? "AI can use this to" : "Once connected, AI can"}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">
          {connection.aiCanUseThisTo.slice(0, 2).join("; ")}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClick}
          className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-accent/85"
        >
          {needsSetup ? "Set up source" : "Manage source"}
        </button>
        <button
          type="button"
          onClick={onRunAction}
          disabled={!canUseNow}
          className={`rounded-lg border border-gray-border bg-surface-raised px-3 py-1.5 text-[11px] font-medium transition-colors ${
            canUseNow
              ? "text-gray-muted hover:border-accent/35 hover:text-warm-black"
              : "cursor-not-allowed text-gray-faint opacity-60"
          }`}
        >
          {actionCopy}
        </button>
      </div>
    </div>
  );
}

const CATEGORY_ORDER: IntelligenceCategory[] = [
  "understands_customers",
  "understands_demand",
  "understands_content",
  "can_take_action",
];

type FilterTab = "All" | "AI using it" | "Needs attention";

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
      DISCOVERABLE_INTEGRATIONS.map((integration) => {
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
          usageExamples: integration.usageExamples,
          addsIntelligence: integration.addsIntelligence,
          aiCanUseThisTo: integration.aiCanUseThisTo,
          exampleInsight: integration.exampleInsight,
          actionPaths: integration.actionPaths ?? [],
          sourcePrompt: integration.sourcePrompt ?? null,
        };
      }),
    [sourceState]
  );

  const searchedConnectionIds = useMemo(
    () => new Set(filterIntegrations(DISCOVERABLE_INTEGRATIONS, query).map((integration) => integration.id)),
    [query]
  );

  const connections = useMemo(() => {
    const searched = allConnections.filter((connection) => searchedConnectionIds.has(connection.id));
    if (activeTab === "AI using it") {
      return searched.filter((c) => c.intelligenceStatus === "ai_using_it" || c.intelligenceStatus === "can_act_here");
    }
    if (activeTab === "Needs attention") return searched.filter((c) => c.intelligenceStatus === "needs_attention");
    return searched;
  }, [allConnections, searchedConnectionIds, activeTab]);

  const groupedConnections = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        connections: connections.filter((connection) => connection.intelligenceCategories.includes(category)),
      })).filter((group) => group.connections.length > 0),
    [connections]
  );

  const usableNowCount = allConnections.filter((c) =>
    c.intelligenceStatus === "ai_using_it" ||
    c.intelligenceStatus === "can_act_here" ||
    c.intelligenceStatus === "signal_available"
  ).length;
  const needsSetupCount = allConnections.filter((c) =>
    c.status === "not_configured" || c.status === "needs_reauth" || c.status === "sync_failed"
  ).length;
  const featured =
    allConnections.find((connection) => connection.id === "google-business" && connection.status !== "connected") ??
    allConnections.find((connection) => connection.id === "website-activity") ??
    allConnections[0];
  const runConnectionPrompt = (connection: Connection) => {
    const prompt =
      connection.sourcePrompt ||
      connection.usageExamples[0]?.prompt ||
      `@${connection.name} Suggest my next site update from this source`;
    if (setChatPrompt) {
      setChatPrompt(prompt);
      router.push(dashboardHref("/dashboard/chat"));
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 animate-route-enter">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
            Business sources
          </p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[24px] sm:text-[30px] font-semibold text-warm-black tracking-[-0.02em]">
              What the AI can really use
            </h1>
            <span className="text-[13px] text-gray-muted">
              {usableNowCount} usable now
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-surface-inset border border-glass-border rounded-xl px-3.5 py-2 w-full sm:w-fit">
          <Search className="w-4 h-4 text-gray-subtle" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sources..."
            className="bg-transparent text-[13px] text-warm-black placeholder-gray-subtle outline-none w-full sm:w-[180px]"
          />
        </div>
      </div>
      <p className="text-[14px] text-gray-muted leading-relaxed max-w-[640px] mb-6 sm:mb-8">
        Built-in site signals work now. Connected accounts add outside context. Sources that still need OAuth, credentials, or manual setup stay clearly marked until they are actually available.
      </p>

      {!query.trim() && (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-border bg-surface-raised p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Usable now</p>
            <p className="mt-2 text-[24px] font-semibold text-warm-white">
              {usableNowCount}
            </p>
            <p className="mt-1 text-[12px] text-gray-muted">Built-in or connected sources the AI can reference today.</p>
          </div>
          <div className="rounded-xl border border-gray-border bg-surface-raised p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-gray-faint">Needs setup</p>
            <p className="mt-2 text-[24px] font-semibold text-warm-white">
              {needsSetupCount}
            </p>
            <p className="mt-1 text-[12px] text-gray-muted">OAuth, credentials, manual setup, or sync repair required.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push(dashboardHref(`/dashboard/sources/${featured.id}`))}
            className="rounded-xl border border-accent/25 bg-accent-dim p-4 text-left transition-colors hover:border-accent/45"
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-accent">Best next source</p>
            <p className="mt-2 text-[15px] font-medium text-warm-white">{featured.name}</p>
            <p className="mt-1 text-[12px] text-gray-muted">{featured.description}</p>
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-glass-border mb-4 pb-0">
        {(["All", "AI using it", "Needs attention"] as const).map((tab) => (
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
            <section key={group.category}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-medium text-warm-black">{INTELLIGENCE_CATEGORY_LABELS[group.category]}</h2>
                <span className="text-[11px] text-gray-faint">{group.connections.length} sources</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.connections.map((connection) => (
                  <ConnectionRow
                    key={`${group.category}-${connection.id}`}
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
