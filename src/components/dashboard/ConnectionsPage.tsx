"use client";

import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  DISCOVERABLE_INTEGRATIONS,
  filterIntegrations,
  normalizeIntegrationStatus,
  type IntegrationUsageExample,
  type IntegrationStatus,
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
  lastSyncedAt: string | null;
  usedIn: string;
  usageExamples: IntegrationUsageExample[];
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
  const action = connection.usageExamples[0];

  return (
    <div className="flex items-start gap-3.5 w-full rounded-xl p-3.5 hover:bg-gray-bg transition-colors">
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
        <span className="text-[12px] text-gray-muted block mt-0.5">{connection.description}</span>
        <span className="mt-2 block text-[11px] leading-relaxed text-gray-faint">
          {connection.connected ? "Powers now" : "Connect to unlock"}: {connection.usedIn}
        </span>
        {action && (
          <button
            type="button"
            onClick={onRunAction}
            className="mt-3 rounded-lg border border-gray-border bg-surface-raised px-3 py-1.5 text-[11px] font-medium text-gray-muted transition-colors hover:border-accent/35 hover:text-warm-white"
          >
            Ask AI: {action.title}
          </button>
        )}
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
  );
}

type FilterTab = "All" | "Connected" | "Available";

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
          lastSyncedAt: rawConnection?.lastSyncedAt ?? null,
          usedIn: integration.usedIn,
          usageExamples: integration.usageExamples,
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
    if (activeTab === "Connected") return searched.filter((c) => c.connected);
    if (activeTab === "Available") return searched.filter((c) => !c.connected);
    return searched;
  }, [allConnections, searchedConnectionIds, activeTab]);

  const featured = allConnections[0]; // Google Analytics as featured
  const runConnectionPrompt = (connection: Connection) => {
    const prompt = connection.usageExamples[0]?.prompt || `Use ${connection.name} to suggest my next site update`;
    if (setChatPrompt) {
      setChatPrompt(prompt);
      router.push(dashboardHref("/dashboard/chat"));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 animate-route-enter">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
            Connected accounts
          </p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[24px] sm:text-[30px] font-semibold text-warm-black tracking-[-0.02em]">Connections that unlock AI work</h1>
            <span className="text-[13px] text-gray-muted">{connections.filter((c) => c.connected).length} active</span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-surface-inset border border-glass-border rounded-xl px-3.5 py-2 w-full sm:w-fit">
          <Search className="w-4 h-4 text-gray-subtle" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts..."
            className="bg-transparent text-[13px] text-warm-black placeholder-gray-subtle outline-none w-full sm:w-[180px]"
          />
        </div>
      </div>
      <p className="text-[14px] text-gray-muted leading-relaxed max-w-[640px] mb-6 sm:mb-8">
        Each connection should make the AI more useful: better weekly reports, review replies, SEO suggestions, email updates, social posts, or booking insights.
      </p>

      {/* Featured hero card */}
      {!query.trim() && <div
        onClick={() => router.push(dashboardHref(`/dashboard/sources/${featured.id}`))}
        className="flex flex-col lg:flex-row rounded-2xl dashboard-panel overflow-hidden mb-8 cursor-pointer hover:border-gray-border transition-colors"
      >
        <div className="flex-1 flex flex-col justify-center gap-4 p-5 sm:p-7 lg:p-8">
          <div className="w-12 h-12 rounded-xl bg-glass border border-gray-border flex items-center justify-center">
            <span className="text-[16px] font-bold text-accent">{featured.icon}</span>
          </div>
          <h2 className="text-[22px] font-semibold text-white">Turn {featured.name} into weekly proof</h2>
          <p className="text-[13px] text-[#ffffffaa] leading-relaxed max-w-[340px]">
            Connected sources feed the reports and AI prompts owners actually use. The goal is fewer dashboards and clearer next moves.
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runConnectionPrompt(featured);
            }}
            className="self-start rounded-xl bg-[rgba(255,255,255,0.09)] border border-[rgba(255,255,255,0.13)] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[rgba(255,255,255,0.14)] transition-colors"
          >
            Ask AI with this
          </button>
        </div>
        <div className="lg:w-[390px] flex items-center justify-center p-5 sm:p-6 pt-0 lg:pt-6">
          <div className="w-full rounded-2xl bg-glass border border-gray-border overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-gray-border">
              <span className="text-[11px] font-medium text-accent">@Analytics</span>
              <span className="text-[11px] text-[#ffffffcc]">how did my site do this week?</span>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[12px] text-[#ffffffcc] leading-relaxed">
                Your site had 47 visitors this week, up 12% from last week. Your main offer got the most views (28). 3 people clicked your primary call-to-action after your latest update.
              </p>
            </div>
          </div>
        </div>
      </div>}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-glass-border mb-4 pb-0">
        {(["All", "Connected", "Available"] as const).map((tab) => (
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

      {/* Grid — two columns */}
      {connections.length > 0 ? (
        <div className="grid gap-1 md:grid-cols-2">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              onClick={() => router.push(dashboardHref(`/dashboard/sources/${connection.id}`))}
              onRunAction={() => runConnectionPrompt(connection)}
            />
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
