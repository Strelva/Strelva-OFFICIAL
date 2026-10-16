"use client";
/**
 * XA-8 preview: Business record, people, leaving (XA · R1..R6), rendered with
 * the REAL lane components inside the real StrelvaShell and XA sidebar.
 * Fictional fixtures only (Harbor Dental, Dr. Amy Lin, 1180 Elmwood Ave,
 * North Studio, Maya Okafor). Every network call is a local stub; nothing
 * reaches a real business and nothing is sent to anyone.
 */
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { WorkspaceBusinessDetails } from "@/experience/places/WorkspaceBusinessDetails";
import type { RecordReaders } from "@/experience/places/BusinessDetailsForm";
import { readersFromSystems } from "@/experience/record/record-readers";
import { PeopleAndAccess } from "@/experience/record/PeopleAndAccess";
import { RecordLoading } from "@/experience/record/RecordStates";
import { WorkspaceExport } from "@/experience/workspace/WorkspaceExport";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import type { BusinessRecord, BusinessRecordSource } from "@/platform/business-record/contracts";
import type { StrelvaDetailsPlace } from "@/experience/app-frame/workspace-places";

import type { Xa8Screen, Xa8State } from "./xa8-record-screens";
import { recordGoogleApprovalCopy } from "@/products/publishing/record-consent";

const WS = "11111111-1111-4111-8111-111111111111";
const AMY = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-15T15:00:00-04:00");
const BASE = "/preview/strelva/xa/xa8-record";

const fact = (value: unknown, source: BusinessRecordSource, updatedAt: string, verified = true) => ({ value, source, verified, updatedAt, updatedBy: AMY });

function harborRecord(access: BusinessRecord["access"], empty = false): BusinessRecord {
  if (empty) return { workspaceId: WS, access, revision: 1, lastSequence: 1, updatedAt: "2026-10-15T13:00:00Z", contactCount: 0, services: [], people: [],
    facts: { display_name: fact("Harbor Dental", "owner", "2026-10-15T13:00:00Z") } };
  return {
    workspaceId: WS, access, revision: 14, lastSequence: 14, updatedAt: "2026-10-13T14:00:00Z", contactCount: 1284,
    facts: {
      display_name: fact("Harbor Dental", "owner", "2026-10-02T14:00:00Z"),
      hours: fact({ timezone: "America/New_York", weekly: [1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })).concat([{ day: 6, opens: "09:00", closes: "13:00" }]), overrides: [{ date: "2026-12-24", closed: false, opens: "08:00", closes: "12:00" }] }, "owner", "2026-10-13T14:00:00Z"),
      phone: fact("(716) 555-0142", "tenant_import", "2026-10-01T14:00:00Z", false),
      address: fact({ formatted: "1180 Elmwood Ave, Buffalo, NY 14222" }, "owner", "2026-10-02T14:00:00Z"),
      email: fact("hello@harbordental.com", "tenant_import", "2026-10-01T14:00:00Z", false),
      owner_recipient: fact({ email: "dr.lin@harbordental.com", name: "Amy Lin" }, "owner", "2026-10-02T14:00:00Z"),
      insurance_accepted: fact({ carriers: ["Delta Dental", "Cigna", "MetLife"] }, "agency", "2026-10-09T14:00:00Z", false),
      description: fact("Family dentistry on Elmwood since 2009.", "agency", "2026-10-09T14:00:00Z", false),
    },
    services: ["Cleanings", "Fillings", "Crowns", "Children's visits"].map((name, position) => ({ id: `5555555${position}-5555-4555-8555-555555555555`, name, description: null, durationMinutes: null, priceText: null, active: true, position, externalRef: null, source: "agency" as const, verified: true, updatedAt: "2026-10-09T14:00:00Z" })),
    people: [],
  };
}

/** A fictional System graph, read through the same `readersFromSystems` the real page uses. */
const sys = (id: string, name: string, kind: string) => ({ system: { id, name, kind, lifecycle: "live" } });
const reads = (systemId: string, resource: string) => ({ connection: { source: { systemId }, kind: "read", state: "connected", target: { type: "business_resource", resource } } });
const READERS: RecordReaders | undefined = readersFromSystems({
  systems: [sys("web", "harbordental.com", "website"), sys("gbp", "Harbor Dental on Google", "listing"), sys("book", "Bookings", "booking"), sys("form", "New-patient form", "internal_app")],
  connections: [
    reads("web", "business_record:facts"),
    ...["hours", "phone", "links", "description"].map(slice => reads("gbp", `business_record:${slice}`)),
    reads("book", "business_record:hours"), reads("book", "business_record:services"),
    reads("form", "business_record:insurance_accepted"), reads("form", "business_record:phone"),
  ],
});

const snapshot: WorkspaceSnapshot = {
  actor: { email: "dr.lin@harbordental.com", localPreview: true }, workspaceId: WS,
  workspaces: [{ id: WS, kind: "customer", name: "Harbor Dental", role: "owner" }] as WorkspaceSnapshot["workspaces"],
  work: [], handoffs: [], products: [], delegations: [],
} as WorkspaceSnapshot;

function review(state: Xa8State) {
  const entry = (id: string, kind: string, label: string, status: string, canRevoke: boolean) => ({ id: `${id}-1111-4111-8111-111111111111`, kind, label, status, lastUsedAt: null, canRevoke });
  const entries = state === "empty"
    ? [entry("a0000000", "member", "dr.lin@harbordental.com", "owner", false)]
    : [
      entry("a0000000", "member", "dr.lin@harbordental.com", "owner", false),
      entry("a1000000", "member", "ana.ruiz@harbordental.com", "member", state !== "readonly"),
      { ...entry("b0000000", "provider", "North Studio", "active", state !== "handoff"), since: "2026-10-09T14:00:00Z" },
      entry("c0000000", "agency_assignment", "maya.okafor@northstudio.co · North Studio", "active", false),
      entry("c1000000", "agency_assignment", "jon.reyes@northstudio.co · North Studio", "active", false),
      entry("c2000000", "agency_assignment", "priya.shah@northstudio.co · North Studio", "active", false),
    ];
  return { workspaceId: WS, actorUserId: AMY, organization: false, inaccessibleUnits: 0, units: [{ workspaceId: WS, name: "Harbor Dental", role: state === "readonly" ? "member" : "owner", entries }] };
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function stubFetch(screen: Xa8Screen, state: Xa8State): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (state === "loading" && method === "GET") return new Promise<Response>(() => undefined);
    if (url.startsWith("/api/workspace/access-review")) {
      if (state === "error") return json({ error: "Unavailable" }, 503);
      if (method === "POST") return json({ ok: true, changed: true });
      return json(review(state));
    }
    if (url.startsWith("/api/workspace-invitations/revoke")) return json({ status: "revoked" });
    if (url.startsWith("/api/workspace-invitations")) {
      if (method === "POST") { const body = JSON.parse(String(init?.body)); return json({ token: "preview-token-not-real", invitation: { id: "d0000000-1111-4111-8111-111111111111", recipientEmail: body.recipientEmail, role: "member", status: "pending", expiresAt: "2026-10-22T15:00:00Z", createdAt: NOW.toISOString() } }); }
      return json({ invitations: state === "waiting" ? [{ id: "d1000000-1111-4111-8111-111111111111", recipientEmail: "front.desk@harbordental.com", role: "member", status: "pending", expiresAt: "2026-10-21T15:00:00Z", createdAt: "2026-10-14T15:00:00Z" }] : [] });
    }
    if (url.startsWith("/api/workspace/publishing/record")) {
      if (state === "error") return json({ error: "The record changed while you were editing. Nothing was saved; reload to see the latest." }, 409);
      return json({ result: { record: { revision: 15, changeCount: 1 }, google: [{ tenantId: "t", locationId: "l", kind: "hours", status: state === "done" ? "posted" : "needs_approval" }] } });
    }
    if (url.startsWith("/api/workspace-export/v3/history")) {
      if (state === "error") return json({ error: "Only the current owner can see exports. Ask Dr. Lin." }, 403);
      const ready = { buildId: "e0000000-1111-4111-8111-111111111111", workspaceId: WS, status: "ready", createdAt: "2026-10-14T19:12:00Z", expiresAt: "2026-10-21T19:12:00Z" };
      const building = { buildId: "e1000000-1111-4111-8111-111111111111", workspaceId: WS, status: "building", createdAt: "2026-10-15T18:58:00Z", expiresAt: null };
      return json({ exports: state === "empty" ? [] : state === "waiting" ? [building, ready] : [ready] });
    }
    if (url.startsWith("/api/workspace-export")) return json({ buildId: "e2000000-1111-4111-8111-111111111111", message: "Your export is being prepared. You can leave and come back." }, 202);
    if (url.startsWith("/api/workspace-exit")) {
      if (state === "error") return json({ error: "Leaving can't be read right now." }, 503);
      if (state === "done") return json({ state: { id: "f0000000-1111-4111-8111-111111111111", workspaceId: WS, status: "completed", requestedAt: "2026-10-15T18:00:00Z", completedAt: "2026-10-15T18:00:01Z", requestedBy: AMY, futureWork: "paused", providerParticipation: "kept", maintainedResources: { kind: "stopped" }, summary: { standingPaused: 0, standingRevoked: 0, scheduledPaused: 2, scheduledCancelled: 0, assignmentsRevoked: 3, providerDeliveriesRevoked: 0, investigationsPaused: 2, retainedAccepted: 1, retainedUnknown: 0 }, retainedObligations: [{ workId: "w", title: "Thanksgiving hours", status: "waiting", effect: "none" }], resources: [] }, successors: [] });
      return json({ state: null, successors: [{ userId: "a1000000-1111-4111-8111-111111111111", email: "ana.ruiz@harbordental.com" }],
        handoff: { businessRecordRetained: true, dataDeleted: false, systems: [], sites: [{ tenantId: "harbor", tenantStableId: "99999999-1111-4111-8111-111111111111", siteName: "harbordental.com", steps: [{ kind: "domain", status: "pending", detail: "Arrange the domain move with the owner; no DNS or provider change has been made." }] }] } });
    }
    return json({ error: "Not part of this preview" }, 404);
  }) as typeof fetch;
}

const PLACE: Record<Xa8Screen, { title: string; active: StrelvaSection; details: StrelvaDetailsPlace }> = {
  record: { title: "Business record", active: "settings", details: "record" },
  hours: { title: "Hours", active: "settings", details: "record" },
  people: { title: "People & access", active: "access", details: "access" },
  agency: { title: "North Studio", active: "access", details: "access" },
  remove: { title: "North Studio", active: "access", details: "access" },
  take: { title: "Take it with you", active: "settings", details: "export" },
  leave: { title: "Leaving Strelva", active: "settings", details: "export" },
};

export function Xa8RecordPreview({ screen, state, mode }: { screen: Xa8Screen; state: Xa8State; mode: "light" | "dark" }) {
  const request = useMemo(() => stubFetch(screen, state), [screen, state]);
  const router = useRouter();
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: BASE, detail: "Live" },
    { id: "bookings", kind: "bookings", title: "Bookings", href: BASE, detail: "31 this week" },
    { id: "inbox", kind: "inquiries", title: "Inbox", href: BASE, detail: "3 new" },
    { id: "listing", kind: "listing", title: "Google listing", href: BASE, state: "draft" },
  ];
  const navigate = (section: StrelvaSection) => {
    const to = section === "access" ? "people" : section === "settings" ? "record" : null;
    if (to) router.push(`${BASE}/${to}${mode === "dark" ? "?mode=dark" : ""}`);
  };
  const place = PLACE[screen];
  const owner = state !== "readonly";
  const body = (() => {
    if (screen === "record" || screen === "hours") {
      if (state === "loading") return <RecordLoading title="Said once, here." label="Loading your business record" />;
      const record = harborRecord(owner ? "owner" : "member", state === "empty");
      return <WorkspaceBusinessDetails workspaceId={WS} now={NOW} agencyName="North Studio" readers={state === "empty" || state === "plain" ? undefined : READERS} showInsurance
        edit={screen === "hours" ? "hours" : null} hours={{ request, initialMode: state === "week" ? "week" : "day", now: NOW }}
        action={owner ? async () => undefined : undefined}
        result={screen === "record" && (state === "done" || state === "waiting") ? "saved" : null}
        googleResult={screen === "record" && state === "waiting" ? "needs_approval" : null}
        savedSequence={screen === "record" && state === "done" ? 15 : null} undoAction={owner ? async () => undefined : undefined}
        state={state === "error" && screen === "record" ? { kind: "error" } : { kind: "ready", data: { record, operator: false, publishing: true, listings: false, googleApprovalCopy: screen === "hours" && owner ? recordGoogleApprovalCopy(record, true) : null, sites: [{ tenantId: "harbor", siteName: "harbordental.com" } as never], denied: [] } }} />;
    }
    if (screen === "take") return <WorkspaceExport workspaceId={WS} schema3 request={request} businessName="Harbor Dental" />;
    if (screen === "leave") return <WorkspaceExit workspaceId={WS} request={request} businessBillingReleased />;
    return <PeopleAndAccess snapshot={snapshot} currentRole={owner ? "owner" : "member"} request={request} postAction={async () => ({}) as never}
      initialAgency={screen === "agency" || screen === "remove" ? "b0000000-1111-4111-8111-111111111111" : undefined} initialRemoving={screen === "remove"} />;
  })();
  return <StrelvaShell appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceName="Harbor Dental" accountName="Dr. Amy Lin" pinned={pinned}
    onNavigate={navigate} agency={{ name: "North Studio", person: "Maya", color: "#2f5236" }} title={place.title} active={place.active} detailsPlace={place.details}>
    {body}
  </StrelvaShell>;
}

