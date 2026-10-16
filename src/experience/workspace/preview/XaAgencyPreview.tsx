"use client";
/**
 * XA-6 preview: the real agency screens (AgencyHome's Today, Queue, Library
 * and Minutes; AgencyClientXa; the agency website draft with its send panel)
 * inside the real StrelvaShell, reading fixtures through the same transport
 * they use in the app. Fictional data only; nothing is sent anywhere.
 */
import { useMemo } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";
import { AgencyHome } from "../AgencyHome";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { useAgencyClientHome } from "../useAgencyClientHome";
import { AgencyClientXa, useAgencyGrants } from "../agency/xa/AgencyClientXa";
import { clientColor } from "../agency/xa/client-color";
import { splitQueue } from "../agency/xa/agency-xa-model";
import { AgencyWebsiteDocumentDraftExperience, type AgencyDocumentTransport } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";
import { agencyDocumentFixture } from "@/experience/agency-website/agency-document-fixture";
import { XA_AGENCY, XA_CLIENT, XA_MINUTES, xaAgencyClients, xaAgencyLibrary, xaAgencySnapshot, xaHarborSystems, type XaAgencyScreen, type XaAgencyState } from "./xa-agency-fixture";
import styles from "./xa-foundation-preview.module.css";


const BASE = "/preview/strelva/xa/xa6-agency";
const never = () => new Promise<Response>(() => undefined);

function previewHref(screen: XaAgencyScreen, mode: "light" | "dark", state?: XaAgencyState) {
  const query = new URLSearchParams();
  if (state && state !== "ready") query.set("state", state);
  if (mode === "dark") query.set("mode", "dark");
  const search = query.toString();
  return `${BASE}/${screen}${search ? `?${search}` : ""}`;
}

/** Answers the agency's reads the way the server would, for one fixture state. */
function fixtureRouter(screen: XaAgencyScreen, state: XaAgencyState): typeof fetch {
  // Versions resolved inline in this preview session read back as offered.
  const resolved = new Set<string>();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://preview.local");
    const path = url.pathname;
    const wait = (ms = 220) => new Promise(resolve => setTimeout(resolve, ms));
    if (path === "/api/workspace/agency-clients") {
      if (state === "loading") return never();
      if (state === "error" && screen !== "minutes") return Response.json({ error: "Unavailable" }, { status: 503 });
      await wait();
      return Response.json(xaAgencyClients(state === "empty" && screen === "minutes" ? "ready" : state));
    }
    if (path === "/api/workspace/agency-client-time") {
      if (state === "waiting") return Response.json({ error: "Care plan reports are not enabled." }, { status: 503 });
      if (state === "error") return Response.json({ error: "Unavailable" }, { status: 500 });
      await wait(120);
      return Response.json(state === "empty" ? [] : XA_MINUTES[url.searchParams.get("workspaceId") ?? ""] ?? []);
    }
    if (path === "/api/workspace/agency-library") {
      if (state === "loading") return never();
      if (state === "error") return Response.json({ error: "Unavailable" }, { status: 500 });
      await wait();
      return Response.json(xaAgencyLibrary(state, resolved));
    }
    if (path === "/api/workspace/versions" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { versionId: string; rowRevision: number };
      await wait(400);
      resolved.add(body.versionId);
      return Response.json({ outcome: "prepared", rowRevision: body.rowRevision + 1, receipt: null });
    }
    if (path === "/api/workspace/versions") {
      const conflict = xaAgencyLibrary("ready").sources.flatMap(source => source.versions).find(version => version.systemId === url.searchParams.get("systemId") && version.state === "conflicts");
      if (!conflict) return Response.json({ error: "Not in this preview" }, { status: 404 });
      return Response.json({ workspaceId: conflict.workspaceId, systemId: conflict.systemId, versionId: conflict.versionId, rowRevision: 4, canManage: true, canMakeReal: false, pendingRelease: null,
        possibilities: [{ sourceRevision: 3, conflicts: conflict.conflicts.map(item => ({ ...item })), missingAccounts: [] }] });
    }
    if (path === "/api/workspace/agencies") {
      if (state === "waiting") return Response.json({ error: "Not shared with agencies." }, { status: 403 });
      return Response.json({ directory: [], agencies: [{ agencyWorkspaceId: XA_AGENCY, name: "North Studio", seat: true, ofRecord: true, scopes: [
        { scope: "website", level: "prepare", status: "active" }, { scope: "inquiries", level: "full_control", status: "active" },
        { scope: "bookings", level: "prepare", status: "active" }, { scope: "internal_tools", level: "full_control", status: "active" },
      ] }] });
    }
    if (path === "/api/workspace/agency-client-home") {
      if (state === "loading") return never();
      if (state === "error") return Response.json({ error: "Unavailable" }, { status: 500 });
      const open = state !== "done";
      return Response.json({
        workspaceId: XA_CLIENT.harbor,
        decisions: [
          { id: "f0000000-0000-4000-8000-000000000001", title: "New cleaning prices on harbordental.com/services", systemId: "b0000000-0000-4000-8000-000000000001", since: "2026-10-13T14:42:00.000Z", state: open ? "open" : "approved" },
          { id: "f0000000-0000-4000-8000-000000000002", title: "Thanksgiving week hours", systemId: "b0000000-0000-4000-8000-000000000002", since: "2026-10-14T16:12:00.000Z", state: state === "waiting" ? "open" : "approved" },
        ],
        changes: [
          { id: "f1000000-0000-4000-8000-000000000001", systemId: "b0000000-0000-4000-8000-000000000003", title: "After-hours reply turned on for the Inbox", at: "2026-10-12T15:00:00.000Z", actor: { kind: "agency", displayName: "Maya at North Studio" } },
        ],
        deliveryChecks: [], deliveries: [],
      });
    }
    if (path === "/api/service-requests") return Response.json({ requests: [] });
    if (path === "/api/workspace/provider-client-queue") return Response.json({ agencyWorkspaceId: XA_AGENCY, items: [], nextCursor: null });
    if (path === "/api/workspace/agency-proposals") return Response.json({ proposals: [], listing: { listed: false, summary: null } });
    if (path === "/api/agency-website-draft-access") return Response.json({ websites: [] });
    if (path === "/api/agency-applications") return Response.json({ applications: [] });
    if (path === "/api/work-allowances") return Response.json({ error: "Not in preview" }, { status: 404 });
    return Response.json({ error: "Not in this preview" }, { status: 404 });
  }) as typeof fetch;
}

export function XaAgencyPreview({ screen, state, mode }: { screen: XaAgencyScreen; state: XaAgencyState; mode: "light" | "dark" }) {
  const request = useMemo(() => fixtureRouter(screen, state), [screen, state]);
  const snapshot = useMemo(() => xaAgencySnapshot(), []);
  // The sidebar reads the same batched read the screens do: the Queue count, and a dot on each client that waits on the agency.
  const page = useMemo(() => xaAgencyClients(state), [state]);
  const you = splitQueue(page.queue).you;
  const waiting = new Set(you.filter(item => item.kind !== "improvement").map(item => item.workspaceId));
  const clients: StrelvaClientLink[] = state === "empty" && screen !== "client" ? [] : [
    { id: XA_CLIENT.harbor, name: "Harbor Dental", href: previewHref("client", mode), current: screen === "client" || screen === "prepare" },
    { id: XA_CLIENT.north, name: "North Coast Realty", href: previewHref("today", mode) },
    { id: XA_CLIENT.lakeview, name: "Lakeview Mediation", href: previewHref("today", mode) },
    { id: XA_CLIENT.fieldwork, name: "Fieldwork Studio", href: previewHref("today", mode) },
  ].map(client => ({ ...client, color: clientColor(client.id), waits: waiting.has(client.id) || undefined }));
  const agencyView = screen === "today" ? "home" : screen === "queue" ? "queue" : screen === "library" ? "library" : screen === "minutes" ? "minutes" : "clients";
  const insideClient = screen === "client" || screen === "prepare";
  const shell = {
    appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode,
    notice: <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p>,
    workspaceName: "North Studio", accountName: "Maya Okafor",
    agencyNavigation: {
      active: agencyView, queueCount: state === "loading" || state === "error" ? null : you.length, clients, agencyWorkspaceId: insideClient ? XA_AGENCY : undefined,
      hrefs: { home: previewHref("today", mode), queue: previewHref("queue", mode), library: previewHref("library", mode), minutes: previewHref("minutes", mode), clients: previewHref("client", mode) },
    },
  } as const;
  const title = screen === "today" ? "Today" : screen === "queue" ? "Queue" : screen === "library" ? "Library" : screen === "minutes" ? "Minutes" : "Harbor Dental";

  return <WorkspaceRequestContext.Provider value={request}>
    <StrelvaShell {...shell} title={title} active="home">
      {screen === "client" ? <ClientScreen state={state} />
        : screen === "prepare" ? <PrepareScreen state={state} />
          : <AgencyHome key={`${screen}:${state}`} view={agencyView} onViewChange={() => undefined} snapshot={snapshot} busy={false}
            onWorkspace={() => window.location.assign(previewHref("client", mode))} onOpenClientWork={() => window.location.assign(previewHref("prepare", mode))} onOpenWork={() => undefined} onStart={() => undefined} />}
    </StrelvaShell>
  </WorkspaceRequestContext.Provider>;
}

function ClientScreen({ state }: { state: XaAgencyState }) {
  const shared = useAgencyClientHome(XA_CLIENT.harbor);
  const request = useMemo(() => fixtureRouter("client", state), [state]);
  const grants = useAgencyGrants(request, XA_CLIENT.harbor, XA_AGENCY);
  // No agency-readable owner name exists yet, so the preview names the business the way the app does.
  return <AgencyClientXa clientName="Harbor Dental" workspaceId={XA_CLIENT.harbor} agencyName="North Studio" agencyHref={previewHref("today", "light")}
    systems={state === "empty" ? [] : xaHarborSystems()} systemsLoading={state === "loading"} grants={grants} shared={shared.state}
    systemHref={() => previewHref("prepare", "light")} onRetryShared={shared.refresh} onAsk={() => undefined} />;
}

const HOURS_NODE = "service-one";

function PrepareScreen({ state }: { state: XaAgencyState }) {
  const transport = useMemo<AgencyDocumentTransport>(() => {
    const fixture = agencyDocumentFixture(state === "error" ? "agency-revoked" : state === "empty" ? "agency-no-permission" : "agency-active");
    if (fixture.website) {
      fixture.website.rebuild.title = "Harbor Dental website";
      const nodes = fixture.website.rebuild.candidate!.document.nodes;
      nodes[HOURS_NODE]!.props = { title: "Hours", body: "Mon to Fri 8 to 5. Sat 9 to 1. 1180 Elmwood Ave, Buffalo." };
      nodes["service-two"]!.props = { title: "Cleanings and exams", body: "Cleanings $120. New patient exams $95." };
    }
    return {
      read: () => state === "loading" ? new Promise(() => undefined) : Promise.resolve(structuredClone(fixture)),
      save: async (_binding, website) => { await new Promise(resolve => setTimeout(resolve, 600)); return { website: { ...website, rebuild: { ...website.rebuild, candidate: { ...website.rebuild.candidate!, revision: 2 } } } }; },
    };
  }, [state]);
  const edits = state === "ready" || state === "done" || state === "waiting" ? { [HOURS_NODE]: { props: JSON.stringify({ title: "Thanksgiving week hours", body: "Wed, Nov 25: 8 to 1. Thu, Nov 26 and Fri, Nov 27: closed. Sat 9 to 1. 1180 Elmwood Ave, Buffalo." }, null, 2), children: [] } } : undefined;
  return <AgencyWebsiteDocumentDraftExperience bindingId="11111111-1111-4111-8111-111111111111" transport={transport} clientName="Harbor Dental" initialEdits={edits} />;
}
