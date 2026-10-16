"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { XaInitial, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage, DashSection } from "./xa/DashboardXa";
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
import { useDashboardOptional } from "./DashboardContext";
import { GoogleResourceSelector } from "./GoogleResourceSelector";

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

/** Status as an exception (XA): only what differs from normal gets a dot and a word. */
export function connectionStatusWord(status: IntegrationStatus): { kind: "waits" | "down" | "live" | null; word: string } {
  if (status === "connected") return { kind: "live", word: "Connected" };
  if (status === "sync_failed") return { kind: "down", word: "Stopped syncing" };
  if (status === "needs_reauth") return { kind: "waits", word: "Sign in again" };
  return { kind: null, word: "Not connected" };
}

function ConnectionRow({ connection, onClick }: { connection: Connection; onClick: () => void }) {
  const state = connectionStatusWord(connection.status);
  const detail = !connection.connected && connection.providerId === "google-search-console"
    ? `${connection.addsIntelligence} Needs one manual step.`
    : connection.addsIntelligence;
  return (
    <XaRow
      lead={<XaInitial name={connection.name} size={32} />}
      title={connection.name}
      detail={detail}
      tone={state.kind === "waits" || state.kind === "down" ? "waits" : undefined}
      meta={state.kind === "waits" || state.kind === "down" ? <XaStatus kind={state.kind} size="sm">{state.word}</XaStatus> : <span>{state.word}</span>}
      onClick={onClick}
    />
  );
}

type FilterTab = "all" | "active" | "attention";

export function ConnectionsPage() {
  const router = useRouter();
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const apiHref = dashboardHref;
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [sourceState, setSourceState] = useState<SourceState>({
    providerStatuses: {},
    settings: {},
    connectionLoaded: false,
    settingsLoaded: false,
  });

  const [loadDone, setLoadDone] = useState(false);

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
        setLoadDone(true);
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
    if (activeTab === "active") {
      return searched.filter((c) => c.intelligenceStatus === "ai_using_it" || c.intelligenceStatus === "can_act_here");
    }
    if (activeTab === "attention") return searched.filter((c) => c.intelligenceStatus === "needs_attention");
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
      { key: "available", label: "Not connected yet", connections: available },
    ].filter((group) => group.connections.length > 0);
  }, [connections, heroId]);


  const open = (connection: Connection) => router.push(dashboardHref(`/dashboard/sources/${connection.id}`));
  const failed = loadDone && !sourceState.connectionLoaded && !sourceState.settingsLoaded;

  return (
    <DashPage
      title="Connections."
      quiet={`${connectedCount} of ${totalCount} accounts are connected. Each one lets Strelva see or do a little more for you.`}
      actions={<label className="flex min-h-[40px] w-full items-center gap-2 rounded-full bg-[var(--st-surface)] px-4 shadow-[var(--st-shadow-sm)] sm:w-[240px]">
        <Search className="h-4 w-4 shrink-0 text-[var(--st-text-3)]" strokeWidth={1.7} aria-hidden="true" />
        <span className="sr-only">Search connections</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connections" className="w-full bg-transparent text-[14px] text-[var(--st-text)] outline-none placeholder:text-[var(--st-faint)]" />
      </label>}
      label="Connections"
    >
      {showHero && featured ? (
        <XaSays links={[<XaTextLink key="go" onClick={() => open(featured)}>Set it up</XaTextLink>]}>
          Start with {featured.name}. {featured.description}
        </XaSays>
      ) : null}

      <GoogleResourceSelector connected={sourceState.providerStatuses.google?.status === "connected"} />

      <div><XaSegmented label="Which connections" value={activeTab} onChange={setActiveTab} options={[
        { value: "all", label: "All" },
        { value: "active", label: "In use" },
        { value: "attention", label: "Needs you" },
      ]} /></div>

      {failed ? <DashNote tone="down" role="status">Your connections didn&apos;t load. Nothing about them changed; reload to try again.</DashNote> : null}

      {groupedConnections.length > 0 ? (
        groupedConnections.map((group) => (
          <DashSection key={group.key} label={group.label}>
            <XaRows label={group.label}>
              {group.connections.map((connection) => (
                <ConnectionRow key={`${group.key}-${connection.id}`} connection={connection} onClick={() => open(connection)} />
              ))}
            </XaRows>
          </DashSection>
        ))
      ) : (
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">
          {query.trim() ? "No connection matches that. Try an account name, or what it helps with." : activeTab === "attention" ? "Nothing needs you. Every connected account is syncing." : "Nothing is in use yet. Connect an account below to start."}
        </p>
      )}
    </DashPage>
  );
}
