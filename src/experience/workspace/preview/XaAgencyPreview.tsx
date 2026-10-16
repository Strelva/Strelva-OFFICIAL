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
import { AgencyClientTools } from "../agency/xa/AgencyClientTools";
import { clientColor } from "@/platform/presentation/client-color";
import { splitQueue } from "../agency/xa/agency-xa-model";
import { AgencyWebsiteDocumentDraftExperience, type AgencyDocumentTransport } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";
import { agencyDocumentFixture } from "@/experience/agency-website/agency-document-fixture";
import { XA_AGENCY, XA_CLIENT, XA_MINUTES, xaAgencyClients, xaAgencyLibrary, xaAgencySnapshot, xaClientSystems, xaHarborSystems, type XaAgencyScreen, type XaAgencyState } from "./xa-agency-fixture";
import styles from "./xa-foundation-preview.module.css";
import { XA_CLIENTS, XA_DAY, XA_NORTH, xaClient, type XaClientKey, xaSearchItems } from "./xa-day";


const BASE = "/preview/strelva/xa/xa6-agency";
const never = () => new Promise<Response>(() => undefined);

function previewHref(screen: XaAgencyScreen, mode: "light" | "dark", state?: XaAgencyState, client?: XaClientKey) {
  const query = new URLSearchParams();
  if (client && client !== "harbor") query.set("client", client);
  if (state && state !== "ready") query.set("state", state);
  if (mode === "dark") query.set("mode", "dark");
  const search = query.toString();
  return `${BASE}/${screen}${search ? `?${search}` : ""}`;
}

/** Answers the agency's reads the way the server would, for one fixture state. */
function fixtureRouter(screen: XaAgencyScreen, state: XaAgencyState, client: XaClientKey = "harbor"): typeof fetch {
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
      if (client !== "harbor") return Response.json({ workspaceId: XA_CLIENT[client], decisions: [], changes: [], deliveryChecks: [], deliveries: [] });
      return Response.json({
        workspaceId: XA_CLIENT.harbor,
        decisions: [
          { id: "f0000000-0000-4000-8000-000000000001", title: "New cleaning prices on the Services page", systemId: "b0000000-0000-4000-8000-000000000001", since: "2026-11-21T15:42:00.000Z", state: open ? "open" : "approved" },
          { id: "f0000000-0000-4000-8000-000000000002", title: "Thanksgiving week hours", systemId: "b0000000-0000-4000-8000-000000000002", since: "2026-11-22T17:12:00.000Z", state: state === "waiting" ? "open" : "approved" },
        ],
        changes: [
          { id: "f1000000-0000-4000-8000-000000000001", systemId: "b0000000-0000-4000-8000-000000000003", title: "After-hours reply turned on for Inquiries", at: "2026-11-20T16:00:00.000Z", actor: { kind: "agency", displayName: "Maya at North Studio" } },
        ],
        deliveryChecks: [], deliveries: [],
      });
    }
    // Care plan reports have their own preview (xs-apps-care); here they read as switched off, the way the route answers when they are.
    if (path === "/api/workspace/care-reports") return Response.json({ error: "Care plan reports are not enabled." }, { status: 503 });
    if (path === "/api/service-requests") return Response.json({ requests: [] });
    if (path === "/api/workspace/provider-client-queue") return Response.json({ agencyWorkspaceId: XA_AGENCY, items: [], nextCursor: null });
    if (path === "/api/workspace/agency-proposals") return Response.json({ proposals: [], listing: { listed: false, summary: null } });
    if (path === "/api/agency-website-draft-access") return Response.json({ websites: [] });
    if (path === "/api/agency-applications") return Response.json({ applications: [] });
    if (path === "/api/work-allowances") return Response.json({ error: "Not in preview" }, { status: 404 });
    return Response.json({ error: "Not in this preview" }, { status: 404 });
  }) as typeof fetch;
}

export function XaAgencyPreview({ screen, state, mode, client = "harbor" }: { screen: XaAgencyScreen; state: XaAgencyState; mode: "light" | "dark"; client?: XaClientKey }) {
  const request = useMemo(() => fixtureRouter(screen, state, client), [screen, state, client]);
  const snapshot = useMemo(() => xaAgencySnapshot(), []);
  // The sidebar reads the same batched read the screens do: the Queue count, and a dot on each client that waits on the agency.
  const page = useMemo(() => xaAgencyClients(state), [state]);
  const you = splitQueue(page.queue).you;
  const waiting = new Set(you.filter(item => item.kind !== "improvement").map(item => item.workspaceId));
  const clients: StrelvaClientLink[] = state === "empty" && screen !== "client" ? [] : [
  // Every client in the rail opens its own client screen, in the shared fixture's order.
  ...XA_CLIENTS.map(entry => ({ id: XA_CLIENT[entry.key], name: entry.name, href: previewHref("client", mode, undefined, entry.key), current: (screen === "client" && client === entry.key) || (screen === "prepare" && entry.key === "harbor") })),
  ].map(link => ({ ...link, color: clientColor(link.id), waits: waiting.has(link.id) || undefined }));
  const agencyView = screen === "today" ? "home" : screen === "queue" ? "queue" : screen === "library" ? "library" : screen === "minutes" ? "minutes" : "clients";
  const openClient = (workspaceId: string) => window.location.assign(previewHref("client", mode, undefined, XA_CLIENTS.find(entry => XA_CLIENT[entry.key] === workspaceId)?.key));
  const insideClient = screen === "client" || screen === "prepare";
  const shell = {
    appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode,
    notice: <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p>,
    workspaceName: XA_NORTH.name, accountName: XA_NORTH.person,
    agencyNavigation: {
      active: agencyView, queueCount: state === "loading" || state === "error" ? null : you.length, clients, agencyWorkspaceId: insideClient ? XA_AGENCY : undefined,
      hrefs: { home: previewHref("today", mode), queue: previewHref("queue", mode), library: previewHref("library", mode), minutes: previewHref("minutes", mode), clients: previewHref("clients", mode) },
    },
  } as const;
  const title = screen === "today" ? "Home" : screen === "clients" ? "Clients" : screen === "queue" ? "Queue" : screen === "library" ? "Library" : screen === "minutes" ? "Time this month" : xaClient(client).name;

  return <WorkspaceRequestContext.Provider value={request}>
    <StrelvaShell searchItems={xaSearchItems("agency")} {...shell} title={title} active="home">
      {screen === "client" ? <ClientScreen state={state} client={client} />
        : screen === "prepare" ? <PrepareScreen state={state} />
          : <AgencyHome key={`${screen}:${state}`} now={XA_DAY.now} view={agencyView} onViewChange={() => undefined} snapshot={snapshot} busy={false}
            onWorkspace={openClient} onOpenSystem={openClient} onOpenClientWork={() => window.location.assign(previewHref("prepare", mode))} onOpenWork={() => undefined} onStart={() => undefined} />}
    </StrelvaShell>
  </WorkspaceRequestContext.Provider>;
}

function ClientScreen({ state, client }: { state: XaAgencyState; client: XaClientKey }) {
  const workspaceId = XA_CLIENT[client];
  const shared = useAgencyClientHome(workspaceId);
  const request = useMemo(() => fixtureRouter("client", state, client), [state, client]);
  const grants = useAgencyGrants(request, workspaceId, XA_AGENCY);
  // Harbor Dental has its full set of Systems; the other clients show the Systems the client list already reads.
  const systems = client === "harbor" ? xaHarborSystems() : xaClientSystems(workspaceId);
  // No agency-readable owner name exists yet, so the preview names the business the way the app does.
  return <AgencyClientXa clientName={xaClient(client).name} workspaceId={workspaceId} agencyName={XA_NORTH.name} agencyHref={previewHref("today", "light")}
    systems={state === "empty" ? [] : systems} systemsLoading={state === "loading"} grants={grants} shared={shared.state}
    systemHref={() => previewHref("prepare", "light")} onRetryShared={shared.refresh} onAsk={() => undefined}
    tools={<AgencyClientTools workspaceId={workspaceId} clientName={xaClient(client).name} agencyWorkspaceId={XA_AGENCY} agencyName={XA_NORTH.name} viewerEmail={XA_NORTH.email} canManage request={request} />} />;
}

const HOURS_NODE = "service-one";

function PrepareScreen({ state }: { state: XaAgencyState }) {
  const transport = useMemo<AgencyDocumentTransport>(() => {
    const fixture = agencyDocumentFixture(state === "error" ? "agency-revoked" : state === "empty" ? "agency-no-permission" : "agency-active");
    if (fixture.website) {
      fixture.website.rebuild.title = "Harbor Dental website";
      const nodes = fixture.website.rebuild.candidate!.document.nodes;
      nodes[HOURS_NODE]!.props = { title: "Hours", body: "Mon to Fri 8 to 5. Sat 9 to 1. 1180 Elmwood Ave, Buffalo." };
      nodes["service-two"]!.props = { title: "Cleanings and exams", body: "Cleanings, exams and X-rays for the whole family. New patients welcome." };
    }
    return {
      read: () => state === "loading" ? new Promise(() => undefined) : Promise.resolve(structuredClone(fixture)),
      // Applies the sent lines the way the server does, so the page reads back what was sent (and what Undo put back).
      save: async (_binding, website, _section, ops) => {
        await new Promise(resolve => setTimeout(resolve, 600));
        const next = structuredClone(website);
        const candidate = next.rebuild.candidate!;
        for (const op of ops) {
          const [, , id, field] = op.path.split("/");
          const node = candidate.document.nodes[id!.replace(/~1/g, "/").replace(/~0/g, "~")];
          if (node && field === "props") node.props = op.value as typeof node.props;
          if (node && field === "children") node.children = op.value as string[];
        }
        candidate.revision += 1;
        return { website: next };
      },
    };
  }, [state]);
  const edits = state === "ready" || state === "done" || state === "waiting" ? { [HOURS_NODE]: { props: JSON.stringify({ title: "Thanksgiving week hours", body: "Wed, Nov 25: 8 to 1. Thu, Nov 26 and Fri, Nov 27: closed. Sat 9 to 1. 1180 Elmwood Ave, Buffalo." }, null, 2), children: [] } } : undefined;
  return <AgencyWebsiteDocumentDraftExperience bindingId="11111111-1111-4111-8111-111111111111" transport={transport} clientName="Harbor Dental" initialEdits={edits} />;
}
