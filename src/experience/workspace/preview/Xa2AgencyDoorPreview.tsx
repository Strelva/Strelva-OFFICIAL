"use client";
/**
 * XA-2 preview: the agency door and the claim, rendered by the real
 * components with fictional fixtures (North Studio, Maya Okafor; Harbor
 * Dental, Dr. Amy Lin, 1180 Elmwood Ave). No sign-in, client, claim, email or
 * connection is created. The add-client screen runs against a fetch stand-in
 * that answers only its own two routes and only inside this preview.
 */
import { useState } from "react";
import { AgencyAskDock } from "@/experience/workspace/agency/xa/AgencyAskDock";
import { clientColor } from "@/platform/presentation/client-color";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
import doorStyles from "@/experience/workspace/agency/agency-door.module.css";
import { SignUpDoor } from "@/experience/getting-started/SignUpDoor";
import { AgencyOnboardingView, type AgencyOnboardingState } from "@/experience/workspace/agency/AgencyOnboarding";
import { AddedClient, AgencyAddClient } from "@/experience/workspace/agency/AgencyAddClient";
import { AgencyEveryClient, AgencyEveryClientError, AgencyEveryClientLoading } from "@/experience/workspace/agency/AgencyEveryClient";
import { AgencyFrame } from "@/experience/workspace/agency/AgencyFrame";
import { OwnerClaimPresentation, OwnerClaimReviewPresentation } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { initialClaimReviewChoices } from "@/experience/workspace/agency/OwnerClaimReview";
import type { AgencyClientRow } from "@/experience/workspace/agency-clients";
import type { AgencyOnboarding } from "@/platform/workspaces/agency-onboarding";
import type { AddAgencyClientResult, AgencyClientListItem, ClaimReview, ClaimReviewAccepted, OwnerClaimPreview } from "@/products/agency-clients/contracts";

import type { Xa2Screen } from "./xa2-screens";
import { XA_CLIENTS, XA_DAY, xaHoursAgo } from "./xa-day";
import { XA_CLIENT } from "./xa-agency-fixture";
import xaStyles from "@/experience/workspace/agency/xa/agency-xa.module.css";

const BASE = "/preview/strelva/xa/xa2-agency-door";
const AGENCY = "00000000-0000-4000-8000-0000000000a2";
/** The shared fixture's client ids, so each client keeps its colour on every agency screen. */
const HARBOR = XA_CLIENT.harbor;
const notice = <p className={doorStyles.previewNotice}>Fictional preview. Nothing here reaches a real business.</p>;
const in14 = () => new Date(XA_DAY.now + 14 * 86_400_000).toISOString();
const ago = (hours: number) => xaHoursAgo(hours);

function hrefs(mode: "light" | "dark") {
  const m = mode === "dark" ? "&mode=dark" : "";
  return { home: `${BASE}/a6-every-client?state=ready${m}`, clients: `${BASE}/a6-every-client?state=ready${m}`, queue: `${BASE}/a6-every-client?state=ready${m}`, library: `${BASE}/a6-every-client?state=ready${m}`, minutes: `${BASE}/a6-every-client?state=ready${m}`, verification: `${BASE}/a3-day-one?state=ready${m}` };
}

const onboarding = (clients: number, role: "owner" | "admin" | "member" = "owner"): AgencyOnboarding => ({
  agency: { id: AGENCY, name: "North Studio", role }, members: 1, pendingInvitations: 0, clients,
  effects: [{ effect: "publish", verified: false }, { effect: "google", verified: false }, { effect: "email", verified: false }, { effect: "payments", verified: false }],
  steps: [], next: "first_client", verifiedEffects: 0, viewer: { firstName: "Maya" },
} as unknown as AgencyOnboarding);

const sidebarClients = (mode: "light" | "dark") => [
  { id: XA_CLIENT.harbor, name: "Harbor Dental", href: `${BASE}/a5-client-added?state=ready${mode === "dark" ? "&mode=dark" : ""}`, detail: "New" },
  { id: XA_CLIENT.north, name: "North Coast Realty", href: "#" },
  { id: XA_CLIENT.lakeview, name: "Lakeview Mediation", href: "#", waits: true },
  { id: XA_CLIENT.fieldwork, name: "Fieldwork Studio", href: "#" },
].map(link => ({ ...link, color: clientColor(link.id) }));

const delivery = { status: "not_sent" as const, reason: "gated", decision: "gate-08", agencyEmailVerified: false };
const addition = { additionId: "00000000-0000-4000-8000-0000000000c1", agencyWorkspaceId: AGENCY, customerWorkspaceId: HARBOR, name: "Harbor Dental", sourceKind: "url" as const, sourceUrl: "https://harbordental.com", prospectId: null, factsSeeded: 4, seatId: "00000000-0000-4000-8000-0000000000d1", addedBy: "00000000-0000-4000-8000-0000000000e1", addedAt: ago(0.1), replayed: false };
function addResult(over: Partial<AddAgencyClientResult> = {}): AddAgencyClientResult {
  return {
    client: addition,
    scan: { status: "scanned", seeded: ["phone", "email", "address"], name: "Harbor Dental", message: null },
    ownerClaim: { claimId: "00000000-0000-4000-8000-0000000000f9", customerWorkspaceId: HARBOR, workspaceName: "Harbor Dental", recipientEmail: "dr.lin@harbordental.com", delivery, expiresAt: in14(), createdAt: ago(0.1), replacedPending: false, claimPath: "/workspace/claim/hd-7f2k9q-preview" },
    ownerClaimError: null,
    website: { connect: "#connect", rebuild: "#rebuild", rebuildOpenToAgency: true },
    aiCheck: { status: "pending", message: "The AI Visibility check for harbordental.com is still running. It saves in North Studio.", href: "#" },
    ...over,
  };
}
const listItem = (over: Partial<AgencyClientListItem> = {}): AgencyClientListItem => ({ ...addition, ownerClaimed: false, seatActive: true, pendingClaim: { claimId: "00000000-0000-4000-8000-0000000000f9", recipientEmail: "dr.lin@harbordental.com", expiresAt: in14(), delivery }, ...over });

/** Answers the two add-client routes with fixtures, only in this preview. */
function installAddClientFetch(mode: "ready" | "submitting" | "loading" | "error" | "signed-out" | "prospect") {
  if (typeof window === "undefined") return;
  const real = (window as unknown as { __xa2RealFetch?: typeof fetch }).__xa2RealFetch ?? window.fetch.bind(window);
  (window as unknown as { __xa2RealFetch?: typeof fetch }).__xa2RealFetch = real;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/workspace/agency-clients/added")) {
      if (mode === "loading") return new Promise<Response>(() => undefined);
      if (mode === "error") return Response.json({ error: "Your clients couldn’t be loaded." }, { status: 503 });
      if (mode === "signed-out") return Response.json({ error: "Sign in." }, { status: 401 });
      return Response.json({ clients: [listItem({ additionId: "00000000-0000-4000-8000-0000000000c2", customerWorkspaceId: XA_CLIENT.fieldwork, name: "Fieldwork Studio", sourceUrl: "https://fieldwork.studio", ownerClaimed: true, pendingClaim: null, addedAt: ago(24 * 9) })] });
    }
    if (url.startsWith("/api/workspace/prospects")) return Response.json({ prospects: [
      { id: "00000000-0000-4000-8000-0000000000a8", business: "Harbor Dental", url: "harbordental.com", name: "Dr. Amy Lin", email: "dr.lin@harbordental.com", grade: "C", score: 64 },
      { id: "00000000-0000-4000-8000-0000000000a9", business: "Elmwood Hardware", url: "elmwoodhardware.com", name: "Sam Ortiz", email: "sam@elmwoodhardware.com", grade: "B", score: 78 },
    ] });
    if (url === "/api/workspace/agency-clients" && init?.method === "POST") {
      if (mode === "submitting") return new Promise<Response>(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 1400));
      return Response.json(addResult());
    }
    return real(input, init);
  }) as typeof fetch;
}

const ROW_IDS = [XA_CLIENT.harbor, XA_CLIENT.north, XA_CLIENT.lakeview, XA_CLIENT.fieldwork] as const;
function row(index: number, name: string, over: Partial<AgencyClientRow> = {}): AgencyClientRow & { pageIndex: number } {
  return {
    workspaceId: ROW_IDS[index - 1]!, name, reach: "agency", role: "agency", provider: true, status: "ready", pageIndex: 0,
    systems: [{ id: `00000000-0000-4000-8000-00000000020${index}`, name: `${name.split(" ")[0]!.toLowerCase()}.com`, kind: "website", lifecycle: "live", versionContext: null, health: { status: "healthy", summary: "Passed", lastVerifiedAt: ago(1.5) } }],
    needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: ago(30), ...over,
  };
}
function everyClientRows(state: string): (AgencyClientRow & { pageIndex: number })[] {
  const harbor = row(1, "Harbor Dental", { ownerClaimWaiting: true, lastReceiptAt: null, systems: [{ id: "00000000-0000-4000-8000-000000000201", name: "harbordental.com", kind: "website", lifecycle: "draft", versionContext: null }] });
  const north = row(2, "North Coast Realty", { ownerClaimed: true, needsYou: { count: 1, oldestAt: ago(26) }, systems: [
    { id: "00000000-0000-4000-8000-000000000202", name: "northcoastrealty.com", kind: "website", lifecycle: "live", versionContext: null, health: { status: "healthy", summary: "Passed", lastVerifiedAt: ago(1.2) } },
    { id: "00000000-0000-4000-8000-000000000212", name: "Showings", kind: "bookings", lifecycle: "live", versionContext: null, health: state === "down" ? { status: "blocked", summary: "Calendar sync stopped", lastVerifiedAt: ago(0.3) } : { status: "healthy", summary: "Passed", lastVerifiedAt: ago(1.2) } }] });
  const lakeview = row(3, "Lakeview Mediation", { openRequests: 1, ownerClaimed: true });
  const fieldwork = row(4, "Fieldwork Studio", { lastReceiptAt: ago(80), ownerClaimed: true });
  const rows = [harbor, north, lakeview, fieldwork];
  if (state === "stale") rows[3] = { ...fieldwork, status: "unavailable", systems: [] };
  return rows;
}

const claimPreview: OwnerClaimPreview = { workspaceName: "Harbor Dental", agencyName: "North Studio", recipientEmail: "dr.lin@harbordental.com", status: "pending", expiresAt: in14() };
const review: ClaimReview = { status: "pending", workspaceId: HARBOR, workspaceName: "Harbor Dental", agencyWorkspaceId: AGENCY, agencyName: "North Studio",
  found: [
    { id: "00000000-0000-4000-8000-0000000000f1", entity: "fact", key: "phone", value: "(716) 555-0142", sourceUrl: "https://harbordental.com/contact", quote: "Call (716) 555-0142", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://harbordental.com/contact", foundBy: "agency", foundAt: ago(2) },
    { id: "00000000-0000-4000-8000-0000000000f2", entity: "fact", key: "address", value: { formatted: "1180 Elmwood Ave, Buffalo, NY 14222" }, sourceUrl: "https://harbordental.com/contact", quote: "1180 Elmwood Ave", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://harbordental.com/contact", foundBy: "agency", foundAt: ago(2) },
    { id: "00000000-0000-4000-8000-0000000000f3", entity: "fact", key: "hours", value: { weekly: [1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })) }, sourceUrl: "https://harbordental.com/hours", quote: "Mon–Fri 8–5", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://harbordental.com/hours", foundBy: "agency", foundAt: ago(2) },
    { id: "00000000-0000-4000-8000-0000000000f6", entity: "service", key: null, value: { name: "Cleanings, fillings, crowns" }, sourceUrl: "https://harbordental.com/services", quote: "Cleanings, fillings and crowns", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://harbordental.com/services", foundBy: "agency", foundAt: ago(2) },
  ],
  prepared: [{ id: "00000000-0000-4000-8000-0000000000e2", name: "Website", kind: "website" }],
  fullControlTaken: ["google"] } as ClaimReview;

export function Xa2AgencyDoorPreview({ screen, state, mode }: { screen: Xa2Screen; state: string; mode: "light" | "dark" }) {
  const [installed] = useState(() => { if (screen === "a4-add-client") installAddClientFetch(state as "ready"); return true; });
  const [choices, setChoices] = useState(() => initialClaimReviewChoices(review, "America/New_York"));
  const [accepted, setAccepted] = useState<ClaimReviewAccepted | null>(null);
  const [plainAccepted, setPlainAccepted] = useState(false);
  const [now] = useState<number>(() => XA_DAY.now);
  void installed;
  const [ask, setAsk] = useState("");
  const frame = { appBase: "/preview/strelva", hrefs: hrefs(mode), mode, notice, accountName: "Maya Okafor" };

  if (screen === "a1-sign-up") return <SignUpDoor asAgency={state !== "business"} doors={state !== "single-door"} next={state === "business" ? "/workspace/business/new" : "/workspace/agency/start"} requestedNext={null}
    emailReady mode={mode} prefillEmail={state === "sent" ? "maya@northstudio.co" : undefined} initial={state === "sent" ? { status: "sent" } : undefined} />;

  if (screen === "a2-name-it" || screen === "a3-day-one") {
    const s: AgencyOnboardingState = screen === "a3-day-one" ? { kind: "ready", onboarding: onboarding(state === "later" ? 4 : 0, state === "member" ? "member" : "owner") }
      : state === "loading" ? { kind: "loading" } : state === "error" ? { kind: "error", message: "The agency service did not answer. Try again in a moment." }
        : state === "signed-out" ? { kind: "signed_out" } : state === "unavailable" ? { kind: "unavailable" }
          : state === "choose" ? { kind: "choose", agencies: [{ id: AGENCY, name: "North Studio", role: "owner" }, { id: "00000000-0000-4000-8000-0000000000a3", name: "Elmwood Collective", role: "member" }] } : { kind: "create" };
    return <AgencyOnboardingView state={s} addClient workspaceId={screen === "a3-day-one" ? AGENCY : null} onOpen={() => undefined} onRetry={() => undefined} onCreateAnother={() => undefined} onClearAgency={() => undefined}
      create={async () => { await new Promise(resolve => setTimeout(resolve, 900)); return AGENCY; }} onSignedOut={() => undefined}
      preview={{ ...frame, addClientHref: `${BASE}/a4-add-client?state=ready${mode === "dark" ? "&mode=dark" : ""}` }} />;
  }

  // The sidebar lists what the page reads (Fieldwork Studio, added earlier), then the client just added.
  if (screen === "a4-add-client") return <AgencyFrame agencyName="North Studio" title="Add a client" {...frame} signOut={null} active="clients">
    <AgencyAddClient agencyWorkspaceId={AGENCY} agencyName="North Studio" prospecting={state === "prospect"} initialProspectId={null} />
  </AgencyFrame>;

  if (screen === "a5-client-added") {
    const result = state === "no-link" ? addResult({ ownerClaim: null }) : state === "rebuild-later" ? addResult({ website: { connect: "#connect", rebuild: "#rebuild", rebuildOpenToAgency: false } })
      : state === "nothing-read" ? addResult({ scan: { status: "unreachable", seeded: [], name: null, message: "harbordental.com did not answer when Strelva tried to read it." }, client: { ...addition, factsSeeded: 1 } }) : addResult();
    const current = state === "claimed" ? listItem({ ownerClaimed: true, pendingClaim: null }) : state === "no-link" ? listItem({ pendingClaim: null }) : listItem();
    return <AgencyFrame agencyName="North Studio" title="Harbor Dental" {...frame} clients={[{ ...sidebarClients(mode)[0]!, current: true }]} signOut={null} active="clients">
      <section style={{ boxSizing: "border-box", maxWidth: 1160, margin: "0 auto", padding: "clamp(24px, 6vw, 96px) clamp(16px, 3vw, 40px) 120px" }}>
        <AddedClient result={result} agencyWorkspaceId={AGENCY} agencyName="North Studio" agencyHref={`${BASE}/a6-every-client?state=ready`} currentClient={current} onAnother={() => undefined} onClaim={() => undefined} linkOrigin={CONTROL_PLANE_URL} />
      </section>
    </AgencyFrame>;
  }

  if (screen === "a6-every-client") {
    const rows = state === "empty" ? [] : everyClientRows(state);
    const body = state === "loading" ? <AgencyEveryClientLoading /> : state === "error" ? <AgencyEveryClientError onRetry={() => undefined} />
      // Harbor Dental was just added and nobody has claimed it, so no time is logged for it yet.
      : <AgencyEveryClient clients={rows} total={rows.length} agencyName="North Studio" minutes={new Map(rows.filter(item => item.workspaceId !== HARBOR).map(item => [item.workspaceId, XA_CLIENTS.find(entry => XA_CLIENT[entry.key] === item.workspaceId)!.minutes]))} hasMore={false} loadingMore={false} moreError={false} retrying={new Set()} now={now}
        onOpen={() => undefined} onRetryPage={() => undefined} onMore={() => undefined} addClientHref={`${BASE}/a4-add-client?state=ready`} agencyWorkspaceId={AGENCY}
        lastGoodReads={state === "stale" ? new Map([[rows[3]!.workspaceId, { client: everyClientRows("ready")[3]!, readAt: ago(0.5) }]]) : undefined} />;
    return <AgencyFrame agencyName="North Studio" title="Clients" {...frame} clients={state === "empty" ? [] : sidebarClients(mode)} signOut={null} active="clients">
      {/* The same column AgencyHome gives the client table. */}
      <section aria-label="Clients" className={xaStyles.every}>{body}</section>
      {/* The agency's one composer, docked exactly as AgencyHome docks it under the client table. */}
      {state !== "empty" ? <AgencyAskDock column="every" agencyName="North Studio" value={ask} onChange={setAsk} onSubmit={() => setAsk("")} /> : null}
    </AgencyFrame>;
  }

  const target = `${BASE}/c1-claim`;
  if (screen === "c2-owner") {
    if (state === "plain") return <OwnerClaimPresentation preview={claimPreview} accepted={{ workspaceId: HARBOR, workspaceName: "Harbor Dental", status: "accepted", alreadyAccepted: false }} loading={false} submitting={false} error="" target={target} onAccept={() => undefined} mode={mode} />;
    return <OwnerClaimReviewPresentation preview={claimPreview} load={{ kind: "ready", review }} choices={choices} onChange={setChoices} submitting={false} error="" target={target} onAccept={() => undefined} navigate={() => undefined} mode={mode}
      accepted={{ workspaceId: HARBOR, workspaceName: "Harbor Dental", status: "accepted", alreadyAccepted: state === "already",
        areas: { website: "prepare", inquiries: "prepare", bookings: "prepare", google: "prepare", internal_tools: "prepare" },
        facts: state === "all-confirmed" ? { confirmed: 4, changed: 0, removed: 0, later: 0, waiting: 0 } : { confirmed: 1, changed: 0, removed: 0, later: 3, waiting: 3 } }} />;
  }

  // c1-claim
  if (state === "plain" || state === "expired" || state === "replaced" || state === "broken") {
    const p = state === "broken" ? null : { ...claimPreview, status: state === "expired" ? "expired" as const : state === "replaced" ? "revoked" as const : "pending" as const };
    return <OwnerClaimPresentation preview={p} accepted={plainAccepted ? { workspaceId: HARBOR, workspaceName: "Harbor Dental", status: "accepted", alreadyAccepted: false } : null} loading={false} submitting={false} error="" target={target} onAccept={() => setPlainAccepted(true)} mode={mode} />;
  }
  return <OwnerClaimReviewPresentation preview={claimPreview} load={state === "loading" ? { kind: "loading" } : state === "review" ? { kind: "ready", review } : { kind: "signed_out" }} choices={choices} onChange={setChoices}
    accepted={accepted} submitting={false} error="" target={target} onAccept={() => setAccepted({ workspaceId: HARBOR, workspaceName: "Harbor Dental", status: "accepted", alreadyAccepted: false })} navigate={() => undefined} mode={mode} />;
}
