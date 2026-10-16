"use client";
/**
 * Preview harness for lane xs-apps-care: the REAL components for Apps, Care
 * plan reports and hired-work delivery, fed by fictional fixtures through
 * their own `request`/transport seams. No server calls, no sends, no writes.
 * Enabled only by NODE_ENV=development + STRELVA_UI_PREVIEW=1.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink, StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { ApplicationUseExperience } from "@/experience/applications/ApplicationUseExperience";
import { AgencyApplicationDraftExperience } from "@/experience/applications/AgencyApplicationDraftExperience";
import { StandaloneApplicationModeContext } from "@/experience/applications/StandaloneApplicationShell";
import { CustomApplicationCreateExperience } from "@/experience/custom-applications/CustomApplicationCreateExperience";
import { CustomApplicationUseExperience } from "@/experience/custom-applications/CustomApplicationUseExperience";
import { CustomToolRequest } from "@/experience/custom-applications/CustomToolRequest";
import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";
import { CareReportColumn, CareReportDocument } from "@/experience/care-reports/CareReportDocument";
import { CareReportEditor } from "@/experience/care-reports/CareReportEditor";
import { PREVIEW_BRAND, PREVIEW_EMPTY_FACTS, PREVIEW_FACTS, PREVIEW_NOTE, PREVIEW_RELEASES, PREVIEW_SNAPSHOT, previewAgencyView } from "@/experience/care-reports/preview-fixture";
import { HomeFinder } from "@/experience/enterprise/HomeFinder";
import { HomeFinderBuyer } from "@/experience/enterprise/HomeFinderBuyer";
import { Units } from "@/experience/enterprise/Units";
import { ContributionClosed, ContributionPage } from "@/experience/operations/ContributionPage";
import { DeliveryCommitmentPanel } from "@/experience/operations/DeliveryCommitmentPanel";
import { ServiceDeliveryQueue } from "@/experience/operations/ServiceDeliveryQueue";
import { SiteDeliveryStatus } from "@/experience/operations/SiteDeliveryStatus";
import { WorkAuthorityPanel } from "@/experience/operations/WorkAuthorityPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { XaWorking, XaEmpty } from "@/components/ui/strelva/Xa";
import { XaCrumbs, XaOutside } from "@/components/ui/strelva/Xa";
import { applicationSchema } from "@/products/applications/contracts";
import type { DeliveryStatus } from "@/platform/infra/delivery-contracts";
import {
  AGENCY_CLIENTS, AMY_ID, BINDING_ID, CUSTOM_TOOL_HTML, HARBOR_ID, HOME_FINDER_BINDING, HOME_SEARCH, MAYA_ID, NORTH_ID, REQUEST_ID,
  INTAKE_RECORDS, UNIT_BUSINESSES, UNITS, WEBSITE_GRANT, WEBSITE_STATE, WORK_ID, deliveryPeople, deliveryRequest, intakeSnapshot,
} from "./xs-apps-care-fixture";

import type { XsScreen } from "./xs-apps-care-fixture";

const BASE = "/preview/strelva/xa/xs-apps-care";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const never = () => new Promise<Response>(() => undefined);

function ownerShell(mode: "light" | "dark", title: string, children: ReactNode, current?: string) {
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: "/preview/strelva/website", detail: "Live", current: current === "website" },
    { id: "bookings", kind: "bookings", title: "Bookings", href: `${BASE}/app-use`, detail: "31 this week" },
    { id: "intake", kind: "app", title: "New-patient intake", href: `${BASE}/app-use`, detail: "3 new", current: current === "intake" },
    { id: "reports", kind: "document", title: "Care reports", href: `${BASE}/care-report-owner`, detail: "September", current: current === "reports" },
  ];
  return <StrelvaShell appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} title={title} workspaceName="Harbor Dental" accountName="Dr. Amy Lin" active="system"
    pinned={pinned} agency={{ name: "North Studio", person: "Maya", color: "#2f5236" }}>{children}</StrelvaShell>;
}

function agencyShell(mode: "light" | "dark", title: string, children: ReactNode) {
  const clients: StrelvaClientLink[] = AGENCY_CLIENTS.map(client => ({ id: client.id, name: client.name, href: `${BASE}/care-report-agency`, detail: client.detail, color: client.color, waits: client.id === "north-coast" }));
  return <StrelvaShell appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} title={title} workspaceName="North Studio" accountName="Maya Okafor" active="home"
    agencyNavigation={{ active: "clients", queueCount: 3, clients, hrefs: { home: BASE, queue: `${BASE}/delivery-queue`, library: BASE, minutes: BASE } }}>{children}</StrelvaShell>;
}

/** Preview-only: answers /api/agent-access so the manager's AI access control has a fixture to read. */
function useAgentAccessShim() {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = (input, init) => String(input).startsWith("/api/agent-access") ? Promise.resolve(json([])) : original(input, init);
    return () => { window.fetch = original; };
  }, []);
}

export function XsAppsCarePreview({ screen, state, mode }: { screen: XsScreen; state: string; mode: "light" | "dark" }) {
  const request = useMemo<typeof fetch>(() => async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (state === "loading") return never();
    if (state === "error" && method === "GET") return json({ error: "The fictional read failed. Nothing changed." }, 503);
    if (state === "denied") return json({ error: "This internal tool link is no longer available to your account." }, 403);
    // Internal tools
    if (url.startsWith("/api/apps/")) return method === "GET" ? json(intakeSnapshot(state)) : json({ error: "This preview does not save records. Your draft is still here." }, 409);
    if (url.startsWith("/api/custom-applications/")) return json({ workId: WORK_ID, title: "Chair schedule", releaseVersion: 2, artifactDigest: "fixture-digest", html: CUSTOM_TOOL_HTML, grant: { expiresAt: "2027-01-31T00:00:00Z" }, businessName: "Harbor Dental" });
    if (url === "/api/custom-applications") return json({ error: "This preview does not build anything." }, 400);
    if (url.startsWith("/api/agency-application-draft-access")) return json({ grant: state === "read-only" ? null : { id: AMY_ID, applicationWorkId: WORK_ID, businessWorkspaceId: HARBOR_ID, installationId: AMY_ID, deliveryId: AMY_ID, assignmentId: AMY_ID, agencyWorkspaceId: NORTH_ID, operatorUserId: MAYA_ID, grantedBy: AMY_ID, status: "active", expiresAt: "2027-01-31T00:00:00Z", createdAt: "2026-10-09T12:00:00Z", updatedAt: "2026-10-09T12:00:00Z", revokedAt: null, revokedBy: null } });
    if (url.startsWith("/api/bounded-work")) {
      const base = [{ id: "name", label: "Patient name", type: "text" as const, required: true }, { id: "reason", label: "Reason for the visit", type: "text" as const, required: true }];
      const added = [{ id: "insurance", label: "Insurance", type: "select" as const, required: true, options: ["Delta Dental", "Cigna", "MetLife", "No insurance"] }, { id: "member", label: "Insurance member ID", type: "text" as const, required: false }];
      const released = { title: "New-patient intake", maintenanceOwner: MAYA_ID, fields: base, components: [{ kind: "form" as const, fields: ["name", "reason"] }, { kind: "list" as const, fields: ["name", "reason"] }] };
      const draft = state === "no-changes" ? released : { ...released, fields: [...base, ...added], components: [{ kind: "form" as const, fields: ["name", "reason", "insurance", "member"] }, { kind: "list" as const, fields: ["name", "reason", "insurance"] }] };
      const rehearsal = state === "sent" ? { specVersion: 2, checks: [{ name: "Every question has words", passed: true }, { name: "The 3 records Harbor Dental has still fit", passed: true }] } : null;
      return json({ id: WORK_ID, payload: applicationSchema.parse({ version: 1, revision: 4, title: released.title, createdBy: MAYA_ID, createdAt: "2026-10-09T12:00:00Z", history: [], spec: draft, specVersion: 2, status: "draft",
        versions: [{ version: 1, spec: released }, { version: 2, spec: draft }], rehearsal, records: INTAKE_RECORDS.map(record => ({ id: record.id, values: record.values })), designRevision: 3, recordsRevision: 3,
        candidate: { designRevision: 3, specVersion: 2, spec: draft, rehearsal },
        release: { version: 1, spec: released, publishedAt: "2026-10-02T12:00:00Z", publishedBy: AMY_ID, provenance: "published" } }) });
    }
    // Agency website
    if (url.startsWith("/api/agency-website-draft-access")) return method === "GET" ? json({ grant: state === "revoked" ? { ...WEBSITE_GRANT, status: "revoked", revokedAt: "2026-10-15T12:00:00.000Z", revokedBy: AMY_ID } : state === "no-grant" ? null : WEBSITE_GRANT, state: WEBSITE_STATE, customerWebsiteHref: `${BASE}/delivery-request` }) : json({ preparation: { id: AMY_ID } }, 201);
    if (url.startsWith("/api/operational-assignments")) return json({ responsibility: { payload: { steps: [{ result: { websiteDraft: { section: "hero", revision: 5 } } }] } } });
    // Home Finder
    if (url.startsWith("/api/workspace/home-finder")) return method === "GET" ? json({ bindings: state === "empty" ? [] : [{ ...HOME_FINDER_BINDING, ...(state === "live" ? { lifecycle: "live", runtimeAllowed: true, qualifiedAt: "2026-10-15T12:00:00.000Z", readiness: HOME_FINDER_BINDING.readiness.map(item => ({ ...item, state: "confirmed" })) } : {}) }], catalog: { name: "Home Finder", requirements: [] } }) : json({ error: "This preview does not change installations." }, 400);
    if (url.startsWith(`/api/home-finder/`)) {
      if (url.includes("renew=1")) return json({ token: "fixture-entry" });
      if (method === "POST") return json({ status: "pending", requestId: JSON.parse(String(init?.body)).submissionId, reference: "LH-4821", message: "Inquiry queued for Lakeshore Homes" });
      return json(state === "empty" ? { ...HOME_SEARCH, count: 0, listings: [] } : HOME_SEARCH);
    }
    // Locations
    if (url.startsWith("/api/workspace/units")) {
      if (method !== "GET") return json({ error: "This preview does not change locations." }, 400);
      if (url.includes("unitId=")) return json({ unitId: UNITS[2]!.id, businessId: HARBOR_ID, versions: [{ id: "5c000000-0000-4000-8000-000000000321", name: "New-patient intake", context: "Hertel", baselineRevision: 3, assigned: false }] });
      return json({ organizationId: HARBOR_ID, inaccessibleUnits: state === "ready" ? 1 : 0, units: state === "empty" ? [] : UNITS });
    }
    // Delivery
    if (url.startsWith("/api/service-requests/delivery?requestId=")) {
      const stage = (["proposed", "accepted", "running", "submitted", "done", "blocked"] as const).find(value => value === state) ?? "proposed";
      // Maya (North Studio) sees the agency's states; Dr. Lin sees hers. The owner never has canOperate.
      const operator = state === "accepted" || state === "running" || state === "blocked" || state === "agency-submitted";
      const request = deliveryRequest(state === "agency-submitted" ? "submitted" : stage);
      return json({ actorId: operator ? MAYA_ID : AMY_ID, request, people: deliveryPeople(operator), permissions: { canManage: !operator, canOperate: operator, stopped: false, websiteBindings: state === "running" ? [{ id: BINDING_ID, name: "harbordental.com", tenantId: "harbor-dental" }] : [] } });
    }
    if (url.startsWith("/api/service-requests")) {
      if (method !== "GET") return json({ error: { message: "This preview does not save decisions." } }, 400);
      const requests = state === "empty" ? [] : [deliveryRequest("submitted", "2026-10-16T21:00:00Z"),
        { ...deliveryRequest("blocked", "2026-10-17T16:00:00Z"), id: "5c000000-0000-4000-8000-0000000000f4", outcome: "Insurance list on the booking page", request: "Show accepted insurance on the booking page." },
        { ...deliveryRequest("running", "2026-10-18T20:30:00Z"), id: "5c000000-0000-4000-8000-0000000000f2", outcome: "Thanksgiving hours", request: "Close online booking Nov 26 and 27." },
        { ...deliveryRequest("done", "2026-10-14T19:00:00Z"), id: "5c000000-0000-4000-8000-0000000000f3", outcome: "Insurance page fix", request: "Fix the broken Cigna link on the insurance page." }];
      return json({ requests, askedBy: Object.fromEntries(requests.map(item => [item.id, "Dr. Amy Lin"])) });
    }
    // Contribution
    if (url.startsWith("/api/work-context")) return json({ version: 1, revision: 2, grants: [{ id: "g1", sourceWorkId: "s1", title: "Business record: hours and insurance", sourceRevision: "7", scope: ["read", "use_in_work"], purpose: "Use this source to complete the selected work", expiresAt: "2026-10-22T12:00:00Z", status: "active", grantedBy: AMY_ID, createdAt: "2026-10-15T12:00:00Z" }], facts: [], preferences: [], history: [] });
    if (url.startsWith("/api/work-participation")) return method === "GET" ? json({ version: 1, revision: 3, currentActorEmail: state === "manager" ? "amy@harbordental.com" : "maya@northstudio.com", workRevision: "12", canManage: state === "manager",
      grants: [{ id: "pg1", participantEmail: "maya@northstudio.com", participantKind: "person", scope: ["read", "propose"], purpose: "Tighten the new-patient letter before it goes out", expiresAt: "2026-10-22T12:00:00Z", budgetMinor: 5000, currency: "USD", sponsorId: AMY_ID, createdAt: "2026-10-15T12:00:00Z", status: "active" }],
      contributions: state === "contributor-empty" ? [] : [{ id: "c1", grantId: "pg1", actorId: MAYA_ID, actorEmail: "maya@northstudio.com", sponsorId: AMY_ID, baseWorkRevision: "12", summary: "Shorter opening and the insurance list up front", content: "Welcome to Harbor Dental. We take Delta Dental, Cigna and MetLife. Bring your card and a list of medications, and come ten minutes early.", costMinor: 0, currency: "USD", idempotencyKey: "k1", status: "pending", createdAt: "2026-10-15T15:00:00Z" }], history: [] })
      : json({ error: "This preview does not send proposals." }, 400);
    return json({ error: "Outside this fictional preview." }, 404);
  }, [state]);

  const wrap = (node: ReactNode) => <StandaloneApplicationModeContext.Provider value={mode}><WorkspaceRequestContext.Provider value={request}>{node}</WorkspaceRequestContext.Provider></StandaloneApplicationModeContext.Provider>;

  switch (screen) {
    case "app-use": return wrap(<ApplicationUseExperience key={state} workId={WORK_ID} />);
    case "custom-app-use": return wrap(<CustomApplicationUseExperience key={state} workId={WORK_ID} />);
    case "agency-app-draft": return wrap(agencyShell(mode, "", <AgencyApplicationDraftExperience key={state} workId={WORK_ID} context={state === "outside" ? null : {
      businessName: "Harbor Dental", businessHref: `${BASE}/care-report-agency`, ownerName: "Dr. Amy Lin", agencyName: "North Studio", personName: "Maya Okafor", clientsHref: `${BASE}/delivery-queue` }} />));
    case "custom-app-new": return state === "builder"
      ? wrap(agencyShell(mode, "New internal tool", <CustomApplicationCreateExperience workspaceId={HARBOR_ID} businessName="Harbor Dental" request={request} />))
      : wrap(ownerShell(mode, "New internal tool", <CustomToolRequest workspaceId={HARBOR_ID} businessName="Harbor Dental" agency={state === "no-agency" ? null : { id: NORTH_ID, name: "North Studio" }} requestsHref={BASE} request={async () => json({ error: { message: "This preview doesn't send Requests." } }, 400)} />));
    case "agency-website": return agencyShell(mode, "Prepare a website update", <>
      <AgencyManagedWebsiteDraftExperience key={state} bindingId={BINDING_ID} businessName="Harbor Dental" websiteAddress="harbordental.com" request={request}
        crumbs={<XaCrumbs items={[{ label: "Harbor Dental", href: `${BASE}/care-report-agency` }, { label: "Website" }, { label: "Prepare an update" }]} />} />
    </>);
    case "care-report-agency": return agencyShell(mode, "Care plan report", <CareReportEditor key={state}
      initial={previewAgencyView({ canWrite: state !== "staff", shared: state !== "never-shared", shareLink: state === "email-on" })} brand={PREVIEW_BRAND}
      emailOn={state === "email-on"} shareLinksOn={state !== "staff"} origin="https://app.example.test" request={async () => json({ error: "This preview does not change anything." }, 400)} />);
    case "care-report-owner": return ownerShell(mode, "Care plan report", <CareReportColumn>
      <CareReportDocument snapshot={state === "empty-month" ? { ...PREVIEW_EMPTY_FACTS, agencyNote: null } : PREVIEW_SNAPSHOT} brand={PREVIEW_BRAND} releaseNumber={2} audience="owner"
        releases={PREVIEW_RELEASES} releaseHref={n => `${BASE}/care-report-owner?release=${n}`} back={{ label: "Recaps", href: BASE }} />
    </CareReportColumn>, "reports");
    case "care-report-shared": return <XaOutside from={PREVIEW_BRAND.name} color={PREVIEW_BRAND.accentColor} credit meta="Shared with you by link" mode={mode}>
      <CareReportDocument snapshot={state === "draft" ? { ...PREVIEW_FACTS, agencyNote: PREVIEW_NOTE } : PREVIEW_SNAPSHOT} brand={PREVIEW_BRAND} releaseNumber={state === "draft" ? null : 2} audience="shared"
        releases={PREVIEW_RELEASES} releaseHref={n => `${BASE}/care-report-shared?release=${n}`} />
    </XaOutside>;
    case "home-finder-setup": return agencyShell(mode, "Home Finder", <HomeFinder key={state} workspaceId={HOME_FINDER_BINDING.workspaceId} agencies={[{ id: NORTH_ID, name: "North Studio" }]} request={request} />);
    case "home-finder-buyer": return <BuyerPreview state={state} mode={mode} request={request} />;
    case "home-finder-loading": return <XaOutside from={null} meta="Home search" mode={mode}><XaWorking title="Opening Home Finder" steps={[{ id: "entry", label: "Checking access from the brokerage website", state: "active" }]} /></XaOutside>;
    case "home-finder-unavailable": return <XaOutside from={null} meta="Home search" mode={mode}><div role="alert"><XaEmpty pose="alone" title="Open Home Finder on the brokerage website" job="New inquiries stay closed here until the brokerage link is used.">Home search only opens from the brokerage&apos;s own website, while its installation and listings provider are current.</XaEmpty></div></XaOutside>;
    case "units": return ownerShell(mode, "Businesses and locations", <Units key={state} organizationId={HARBOR_ID} businesses={UNIT_BUSINESSES} canManage={state !== "member"} request={request} />);
    case "delivery-status": {
      const status = (["received", "reviewing", "drafting", "owner_review", "launch_ready", "launched", "paused"] as const).find(value => value === state) ?? "drafting";
      return <SiteDeliveryStatus businessName="Harbor Dental" status={status as DeliveryStatus} submittedAt="2026-10-09T15:00:00Z" maskedEmail="am**@harbordental.com" agencyName={state === "no-agency" ? null : "North Studio"} mode={mode} />;
    }
    case "delivery-queue": return wrap(agencyShell(mode, "Delivery work", <ServiceDeliveryQueue key={state} scope={{ providerWorkspaceId: NORTH_ID }} />));
    case "delivery-request": {
      const operator = state === "accepted" || state === "running" || state === "blocked";
      const panel = <DeliveryCommitmentPanel key={state} requestId={REQUEST_ID} />;
      return wrap(operator ? agencyShell(mode, "Request", panel) : ownerShell(mode, "Request", panel, "website"));
    }
    case "contribute": return <ContributeShim>{agencyShell(mode, "Work contribution", state === "denied" ? <ContributionClosed kind="denied" />
      : <ContributionPage title="New-patient welcome letter" text={"Dear new patient,\n\nThank you for choosing Harbor Dental at 1180 Elmwood Ave. Before your first visit, please bring your insurance card and a list of any medications you take. Plan to arrive ten minutes early so we can say hello properly.\n\nDr. Amy Lin"}>
        <WorkAuthorityPanel workId={WORK_ID} canManage={state === "manager"} sources={[{ id: "s1", title: "Business record" }, { id: WORK_ID, title: "New-patient welcome letter" }]} initiallyOpen transport={request} />
      </ContributionPage>)}</ContributeShim>;
  }
}

function ContributeShim({ children }: { children: ReactNode }) { useAgentAccessShim(); return <>{children}</>; }

/** Runs the buyer's search once so the screenshot shows homes; the search itself is the real component's. */
function BuyerPreview({ state, mode, request }: { state: string; mode: "light" | "dark"; request: typeof fetch }) {
  useEffect(() => {
    if (state !== "results" && state !== "asking" && state !== "empty") return;
    const timer = window.setTimeout(() => {
      const button = [...document.querySelectorAll("button")].find(item => item.textContent === "Search homes");
      button?.click();
      if (state === "asking") window.setTimeout(() => document.querySelector<HTMLButtonElement>("ul[aria-label='Search results'] button")?.click(), 400);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state]);
  return <HomeFinderBuyer bindingId={BINDING_ID} entryToken="fixture-entry" brokerageName="Lakeshore Homes" request={request} mode={mode} />;
}

