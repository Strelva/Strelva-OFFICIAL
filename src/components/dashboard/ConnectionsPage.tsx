"use client";

import { useRouter } from "next/navigation";
import { XaRow, XaRows, XaSays, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty, DashLoading, DashPage, DashSection } from "./xa/DashboardXa";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CONNECTABLE_INTEGRATIONS,
  deriveIntelligenceStatus,
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

/**
 * One account as an open row. Only the Google listing is a System, so only it
 * wears a clay tile; the rest are plain names. The section a row sits in says
 * whether it is connected; a row adds a word only when something is wrong.
 */
function ConnectionRow({ connection, onClick }: { connection: Connection; onClick: () => void }) {
  const state = connectionStatusWord(connection.status);
  const trouble = state.kind === "waits" || state.kind === "down";
  const detail = state.kind === "waits" ? `Your ${connection.name} sign-in ran out, so Strelva stopped reading it.`
    : state.kind === "down" ? `${state.word}. ${connection.addsIntelligence}`
    : !connection.connected && connection.providerId === "google-search-console"
      ? `${connection.addsIntelligence} One step on your side: give Strelva read access to your site in Google Search Console.`
      : connection.addsIntelligence;
  // Every row that asks the owner to do something carries the way to do it.
  const action = state.kind === "waits" ? <XaTextLink onClick={onClick} aria-label={`Sign in to ${connection.name} again`}>Sign in again</XaTextLink>
    : state.kind === "down" ? <XaTextLink onClick={onClick} aria-label={`Reconnect ${connection.name}`}>Reconnect</XaTextLink>
    : !connection.connected ? <XaTextLink onClick={onClick} aria-label={`Connect ${connection.name}`}>Connect</XaTextLink>
    : undefined;
  return (
    <XaRow
      lead={connection.id === "google-business" ? <XaSystemTile kind="listing" size={32} /> : undefined}
      title={connection.name}
      detail={detail}
      tone={trouble ? "waits" : undefined}
      action={action}
      onClick={connection.connected ? onClick : undefined}
    />
  );
}

export function ConnectionsPage() {
  const router = useRouter();
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const apiHref = dashboardHref;
  const [sourceState, setSourceState] = useState<SourceState>({
    providerStatuses: {},
    settings: {},
    connectionLoaded: false,
    settingsLoaded: false,
  });

  const [loadDone, setLoadDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setLoadDone(false); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      fetch(apiHref("/api/tenant-settings"), { credentials: "same-origin" }).then(async (r) => {
        if (!r.ok) { await r.text().catch(() => ""); throw new Error("Failed to load tenant settings"); }
        return r.json();
      }),
      fetch(apiHref("/api/connections"), { credentials: "same-origin" }).then(async (r) => {
        if (!r.ok) { await r.text().catch(() => ""); throw new Error("Failed to load connections"); }
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

        if (!live) return;
        setSourceState(nextState);
        setLoadDone(true);
      });
    return () => { live = false; };
  }, [apiHref, attempt]);

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

  // A list of five needs no search box (October 16); filterIntegrations stays for longer lists.
  const connections = allConnections;

  const connectedCount = allConnections.filter((c) => c.connected).length;
  const totalCount = allConnections.length;
  // The single "do this first" integration — Google Business — shown ONCE as a
  // hero and then excluded from the list below, so it never triple-lists
  // (priorities grid + recommended banner + available row was the old bug).
  const featured =
    allConnections.find((connection) => connection.id === "google-business" && connection.status !== "connected") ??
    allConnections.find((connection) => connection.id === "website-activity" && connection.status !== "connected");
  const showHero = !!featured;
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
  // The accounts themselves come from /api/connections. When that read fails,
  // nothing true can be said about them, so no row and no Connect is shown.
  const failed = loadDone && !sourceState.connectionLoaded;

  if (!loadDone) return <DashPage title="Connections." label="Connections"><DashLoading label="Reading your connections" rows={5} /></DashPage>;
  if (failed) {
    return (
      <DashPage title="Connections." label="Connections">
        <DashEmpty
          pose="fixing"
          title="Strelva could not read your connections just now."
          job="Nothing was changed. Your accounts stay connected the way they were."
          secondary={<XaTextLink onClick={retry}>Try again</XaTextLink>}
        />
      </DashPage>
    );
  }

  return (
    <DashPage
      title="Connections."
      // A sentence, not a score: "1 of 5" read as a progress meter.
      quiet={connectedCount === 0 ? "Nothing is connected yet." : connectedCount === totalCount ? "Everything is connected." : connectedCount === 1 ? "One is connected so far." : `${connectedCount} are connected so far.`}
      lede="Each one lets Strelva see or do a little more for you."
      label="Connections"
    >
      {showHero && featured ? (
        <XaSays links={[<XaTextLink key="go" onClick={() => open(featured)}>Set it up</XaTextLink>]}>
          Start with {featured.name}. {featured.description}
        </XaSays>
      ) : null}

      <GoogleResourceSelector connected={sourceState.providerStatuses.google?.status === "connected"} />

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
          Nothing is connected yet. Start with your Google listing.
        </p>
      )}
    </DashPage>
  );
}
