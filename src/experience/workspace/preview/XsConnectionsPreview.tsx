"use client";
/**
 * XS · Connections preview: the real Google listing, agency Google picker,
 * assistants, consent, website domain and forwarding components with
 * fictional fixtures (Harbor Dental, Dr. Amy Lin, 1180 Elmwood Ave; North
 * Studio, Maya Okafor). Every command ends in memory. Nothing reaches Google,
 * an assistant, a domain provider or an inbox.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { XaSystemTile } from "@/components/ui/strelva/Xa";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";
import { GoogleConnect, type GoogleConnectProps } from "@/experience/places/GoogleConnect";
import { GoogleReadGrant } from "@/experience/places/GoogleReadGrant";
import { AgencyGooglePicker, type AgencyGoogleResult } from "@/experience/places/AgencyGooglePicker";
import { AgencyGoogleFrame } from "@/experience/places/AgencyGoogleFrame";
import { ForwardInquiries, type Load } from "@/experience/places/ForwardInquiries";
import { AssistantsPlace } from "@/experience/connections/AssistantsPlace";
import { AuthorizeAssistantView, AuthorizeStopped } from "@/experience/connections/AuthorizeAssistantView";
import { AssistantConnections } from "@/experience/workspace/AssistantConnections";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WebsiteDomainForm, WebsiteDomainPanel, type WebsiteDomainState } from "@/experience/websites/WebsiteDomain";
import { WebsiteDomainRequest } from "@/experience/websites/WebsiteRecoveryControls";
import type { SiteReviews, readWorkspaceGoogle } from "@/products/google-listing/server";

type Receipt = Awaited<ReturnType<typeof readWorkspaceGoogle>>[number]["receipts"][number];
import xs from "@/experience/connections/xa-connections.module.css";

import type { XsScreen } from "./xs-connections-screens";
import { xaOwnerPinned, xaSearchItems, XA_HARBOR, XA_NORTH } from "./xa-day";

const WS = "5e000000-0000-4000-8000-000000000010";
const NOW = "2026-10-15T12:11:00Z";
const HARBOR = XA_HARBOR.name;
const CLIENT_COLOR = "#2f5236";

function OwnerShell({ children, mode, active = "system", title, details, account = XA_HARBOR.owner, current }: { children: ReactNode; mode: "light" | "dark"; active?: "system" | "connections"; title: string; details?: boolean; account?: string; current?: string }) {
  // The same four Systems as every preview; the website and inbox open this lane's own screens.
  const pinned: StrelvaPinnedItem[] = xaOwnerPinned({ current: current === "website" ? "website" : current === "inbox" ? "inquiries" : undefined,
    overrides: { website: { href: "/preview/strelva/xa/xs-connections/domain" }, inquiries: { href: "/preview/strelva/xa/xs-connections/forwarding" } } });
  return <StrelvaShell searchItems={xaSearchItems("owner")} appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceName={HARBOR} accountName={account} title={title} active={active}
    pinned={details ? undefined : pinned} connectionsAvailable={details} detailsPlace={details ? "connections" : undefined}
    agency={{ name: XA_NORTH.name, person: XA_NORTH.first, color: CLIENT_COLOR }}
    notice={<p className={xs.previewNotice}>Fictional preview. Nothing here reaches a real business.</p>}>{children}</StrelvaShell>;
}

export function XsConnectionsPreview({ screen, state, mode }: { screen: XsScreen; state: string; mode: "light" | "dark" }) {
  if (screen === "google") return <GooglePreview state={state} mode={mode} />;
  if (screen === "google-agency") return <AgencyGoogleFrame mode={mode}><AgencyGooglePicker workspaceId={WS} choices={state === "ready" ? { googleEmail: "maya@northstudio.co", more: false, listings: [
    { accountId: "accounts/north", locationId: "harbor", title: HARBOR, address: `${XA_HARBOR.address}, ${XA_HARBOR.city}` },
    { accountId: "accounts/north", locationId: "fieldwork", title: "Fieldwork Studio", address: "77 Allen St, Buffalo, NY 14202" },
    { accountId: "accounts/north", locationId: "lakeview", title: "Lakeview Mediation", address: "500 Seneca St, Buffalo, NY 14204" },
  ] } : null} result={state === "ready" ? undefined : state as AgencyGoogleResult} request={async () => Response.json({ code: "discovery_expired" }, { status: 409 })} navigate={() => undefined} /></AgencyGoogleFrame>;
  if (screen === "assistants") return <AssistantsPreview state={state} mode={mode} />;
  if (screen === "authorize") return <AuthorizePreview state={state} mode={mode} />;
  if (screen === "domain") return <DomainPreview state={state} mode={mode} />;
  return <ForwardingPreview state={state} mode={mode} />;
}

/* ---------- Google listing ---------- */

const REVIEWS: SiteReviews = {
  tenantId: `workspace:${WS}`, siteName: HARBOR, googleConnected: true, googlePlaceId: null, replyMode: "approve", autoPostHeld: null, unavailable: false,
  reviews: [
    { id: "fictional-ana", author: "Ana R.", source: "google", rating: 5, text: "Dr. Lin got my daughter in the same week and made her first cleaning easy.", date: "2026-10-13T15:00:00Z", reply: null, repliedAt: null, draft: { reply: "Thank you, Ana. We're glad her first visit felt easy. See you both in the spring.", autoPostAt: null } },
    { id: "fictional-tom", externalId: "fictional-external-tom", author: "Tom B.", source: "google", rating: 5, text: "Quick, kind and on time.", date: "2026-10-02T15:00:00Z", reply: "Thank you, Tom. We appreciate you.", repliedAt: "2026-10-02T17:00:00Z", draft: null },
  ],
};
const PREVIEW_FACTS: NonNullable<GoogleConnectProps["foundFacts"]> = [
  { id: "f-hours", key: "hours", value: { weekly: [{ day: 1, opens: "08:00", closes: "17:00" }, { day: 2, opens: "08:00", closes: "17:00" }, { day: 6, opens: "09:00", closes: "13:00" }] }, foundAt: "2026-10-15T08:02:00Z" },
  { id: "f-phone", key: "phone", value: "(716) 555-0142", foundAt: "2026-10-15T08:02:00Z" },
  { id: "f-cat", key: "categories", value: ["Dentist", "Pediatric dentist"], foundAt: "2026-10-15T08:02:00Z" },
];

/** Google's regularHours shape: Mon to Fri from `opens` to 5, Sat 9 to 1. */
const HOURS = (opens: number) => ({ regularHours: { periods: [
  ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({ openDay: day, openTime: { hours: opens }, closeDay: day, closeTime: { hours: 17 } })),
  { openDay: "SATURDAY", openTime: { hours: 9 }, closeDay: "SATURDAY", closeTime: { hours: 13 } },
] } });

function GooglePreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  const [drafts, setDrafts] = useState(state === "waiting" || state === "pending" || state === "disconnected" ? [
    { id: "draft-thanksgiving", title: "Thanksgiving hours", body: "Closed Thursday and Friday, Nov 26 and 27. Back Saturday, Nov 28, 9 to 1." },
    // The real projection's shape: the event title and Google's own JSON body.
    { id: "draft-info", title: "Review your Google info", body: JSON.stringify({ phoneNumbers: { primaryPhone: "(716) 555-0142" }, websiteUri: "https://harbordental.com", profile: { description: "Family dentistry on Elmwood, cleanings to crowns." } }, null, 2) },
  ] : []);
  const [receipts, setReceipts] = useState<Receipt[]>([
    { id: "r-halloween", headline: "Strelva updated your hours on Google.", before: HOURS(9), after: HOURS(8), authority: { kind: "owner_approval", actor: "owner" }, readback: "matched", status: "posted", undo: true },
    { id: "r-tom", headline: "Strelva replied to Tom B.'s review on Google.", before: { reply: null }, after: { reply: "Thank you, Tom. We appreciate you." }, authority: { kind: "auto_reply_policy", rating: 5 }, readback: "matched", status: "posted", undo: false },
  ]);
  const [result, setResult] = useState("");
  const action = useCallback(async (form: FormData) => {
    const kind = String(form.get("action"));
    await new Promise(resolve => setTimeout(resolve, kind === "approve" ? 1400 : 300));
    if (kind === "approve" || kind === "decline") {
      const id = String(form.get("eventId"));
      const draft = drafts.find(item => item.id === id);
      setDrafts(list => list.filter(item => item.id !== id));
      if (kind === "approve" && draft) setReceipts(list => [{ id: `r-${id}`, headline: "Strelva updated your listing on Google.", before: null, after: draft.body.startsWith("{") ? JSON.parse(draft.body) as Record<string, unknown> : { summary: draft.body }, authority: { kind: "owner_approval", actor: "owner" }, readback: "matched", status: "posted", undo: true } satisfies Receipt, ...list]);
      setResult(kind === "approve" ? "Google accepted the change. It's under What changed." : "Declined. Nothing was sent.");
    } else if (kind === "undo") { setReceipts(list => list.map(item => item.id === form.get("receiptId") ? { ...item, status: "undone", undo: false, headline: `${item.headline}, then undone` } : item)); setResult("Undone on Google. Your listing shows what it had before."); }
    else setResult(kind === "hours" || kind === "info" || kind === "post" ? "Draft kept. Review the exact change before approving." : "Preview: recorded locally. Nothing changed on Google.");
  }, [drafts]);
  const noop = async () => undefined;
  const viewer = state === "member" ? "member" : state === "agency" ? "agency" : "owner";
  const listingState = state === "loading" ? { kind: "loading" as const } : state === "error" ? { kind: "error" as const }
    : { kind: "ready" as const, data: ["connect", "choose", "member", "agency", "soon"].includes(state) ? [] : [{ tenantId: `workspace:${WS}`, locationId: "harbor-elmwood", name: HARBOR,
      control: { workspaceId: WS, locationId: "harbor-elmwood", paused: state === "paused", accessPending: state === "pending", updatedAt: null }, canManage: true, connected: state !== "disconnected", drafts, receipts }] };
  const connect = <><GoogleConnect workspaceId={WS} viewer={viewer} enabled={state !== "soon"} hasListing={listingState.kind === "ready" && listingState.data.length > 0}
    params={state === "choose" ? { connect: "choose" } : state === "facts" ? { read: "found" } : {}} returnTo={null}
    choices={state === "choose" ? { googleEmail: "amy.lin@harbordental.com", more: false, listings: [{ accountId: "accounts/1", locationId: "harbor", title: HARBOR, address: `${XA_HARBOR.address}, ${XA_HARBOR.city}` }, { accountId: "accounts/1", locationId: "harbor-kids", title: "Harbor Dental Kids", address: "1182 Elmwood Ave, Buffalo, NY 14222" }] } : null}
    foundFacts={state === "facts" ? PREVIEW_FACTS : []} actions={{ start: noop, choose: noop, reread: noop, decide: noop }}
    agencyRequest={async () => Response.json({ kind: "agency_connect", link: `${window.location.origin}/api/oauth/google/agency?workspaceId=${WS}`, message: "North Studio holds Harbor Dental's Google area. Connect your agency's Google account to choose the listing." })} />
    {state === "connected" || state === "facts" ? <GoogleReadGrant workspaceId={WS} owner view={{ connected: true, googleEmail: "amy.lin@harbordental.com", gsc: { granted: true, property: "sc-domain:harbordental.com" }, ga4: { granted: true, property: "properties/42" } }}
      summary={{ gsc: { status: "ok", totals: { clicks: 318, impressions: 9420, position: 7.4 } }, ga4: { status: "ok", report: { users: 1204, sessions: 1530, pageviews: 4012 } } }} actions={{ start: noop, choose: noop, disconnect: noop }} /> : null}</>;
  return <OwnerShell mode={mode} title="Google listing" current="listing" account={state === "agency" ? "Maya Okafor" : XA_HARBOR.owner}>
    <WorkspaceGoogle workspaceId={WS} state={listingState} action={action} result={result} connect={connect} reviews={state === "connected" || state === "waiting" ? { kind: "ready", data: [REVIEWS] } : undefined}
      reviewRequest={async () => Response.json({ published: false })} />
  </OwnerShell>;
}

/* ---------- Assistants ---------- */

function AssistantsPreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  const removed = useRef(new Set<string>());
  const request = useCallback<typeof fetch>(async (input, init) => {
    await new Promise(resolve => setTimeout(resolve, state === "loading" ? 120000 : 250));
    if (state === "error") return Response.json({ error: "Fixture failure" }, { status: 503 });
    if (init?.method === "DELETE") { removed.current.add(String(input).split("/").pop()!); return Response.json({ disconnected: true }); }
    const rows = state === "empty" ? [] : [
      { id: "00000000-0000-4000-8000-000000000011", clientId: "https://claude.ai/oauth/claude-client-metadata", clientName: "Claude", scopes: ["business:read", "website:read", "website:propose", "offline_access"], createdAt: "2026-10-09T14:00:00Z", expiresAt: "2026-11-08T14:00:00Z", lastUsedAt: "2026-10-15T07:40:00Z", revokedAt: null, agencyId: null, status: "active" as const },
      { id: "00000000-0000-4000-8000-000000000012", clientId: "https://chatgpt.com/codex/client-metadata", clientName: "Codex", scopes: ["business:read", "website:code"], createdAt: "2026-09-22T14:00:00Z", expiresAt: "2026-10-22T14:00:00Z", lastUsedAt: null, revokedAt: null, agencyId: null, status: state === "expired" ? "expired" as const : "active" as const },
    ];
    return Response.json({ connections: rows.map(row => removed.current.has(row.id) ? { ...row, status: "revoked", revokedAt: NOW } : row) });
  }, [state]);
  const choices = [{ workspaceId: WS, name: HARBOR }, { workspaceId: "5e000000-0000-4000-8000-000000000011", name: "Harbor Dental Kids" }];
  return <OwnerShell mode={mode} title="Assistants" active="connections" details>
    <WorkspaceRequestContext.Provider value={request}>
      <AssistantsPlace basePath="/preview/strelva/xa/xs-connections/assistants" choices={choices} selected={choices[0]} resourceUrl="https://app.strelva.com/api/mcp">
        <AssistantConnections workspaceId={WS} businessName={HARBOR} canManage={state !== "member"} />
      </AssistantsPlace>
    </WorkspaceRequestContext.Provider>
  </OwnerShell>;
}

function AuthorizePreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  if (state === "invalid") return <AuthorizeStopped mode={mode} title="This connection can’t continue.">Start again from your assistant. Strelva couldn’t verify its identity, where it returns you or what it asks to do.</AuthorizeStopped>;
  if (state === "error") return <AuthorizeStopped mode={mode} title="Your businesses couldn’t load.">Reload to try again.</AuthorizeStopped>;
  const choices = state === "none" ? [] : state === "one" ? [{ workspaceId: WS, name: HARBOR, agencyId: null, agencyName: null }] : [
    { workspaceId: WS, name: HARBOR, agencyId: null, agencyName: null },
    { workspaceId: "5e000000-0000-4000-8000-000000000011", name: "Harbor Dental Kids", agencyId: null, agencyName: null },
  ];
  return <AuthorizeAssistantView mode={mode} clientName="Claude" clientHost="claude.ai" returnHost="claude.ai" params={{}} scopes={state === "none" ? ["inquiries:read", "quotes:approve"] : ["business:read", "website:read", "website:propose", "offline_access"]} choices={choices}
    request={async () => { await new Promise(resolve => setTimeout(resolve, 900)); return Response.json({ error: "Preview" }, { status: 400 }); }} navigate={() => undefined} />;
}

/* ---------- Website domain ---------- */

const DOMAIN_PENDING: WebsiteDomainState = { hostname: XA_HARBOR.domain, status: "pending", checkedAt: "2026-10-15T12:09:00Z", records: [
  { type: "A", name: "@", value: "76.76.21.21" },
  { type: "CNAME", name: "www", value: "cname.strelva-dns.com" },
  { type: "TXT", name: "_strelva", value: "strelva-verify=hd-8f2k3m9q" },
] };

function DomainPreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  const [value, setValue] = useState("");
  const [domain, setDomain] = useState<WebsiteDomainState | null>(state === "none" ? null : state === "verified" ? { ...DOMAIN_PENDING, status: "verified" } : state === "error" ? { ...DOMAIN_PENDING, error: "harbordental.com points somewhere else right now. Remove the old A record at your provider, then check again." } : DOMAIN_PENDING);
  const [busy, setBusy] = useState(false);
  const requestFixture = useMemo<typeof fetch>(() => async (_input, init) => {
    await new Promise(resolve => setTimeout(resolve, 700));
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Response.json({ id: body.requestId, workspaceId: WS, workId: "5e000000-0000-4000-8000-0000000000aa", tenantId: "harbor", publishedRevision: 12, publishedHash: "a".repeat(64), hostname: XA_HARBOR.domain, records: DOMAIN_PENDING.records, revisionHash: "b".repeat(64), createdAt: NOW, expiresAt: "2026-10-29T12:11:00Z", current: true, decisionId: null, result: null, receiptEmail: null });
  }, []);
  return <OwnerShell mode={mode} title="Website" current="website" account={state === "request" ? "Maya Okafor" : XA_HARBOR.owner}>
    <div className={xs.place} data-single>
      <div className={xs.main}>
        <header className={xs.head}><XaSystemTile kind="website" size={56} /><div className={xs.headText}><h1 className={xs.headTitle}>harbordental.com</h1><p className={xs.headMeta}>Your website · Release 12</p></div></header>
        {state === "request" ? <section className={xs.section} aria-labelledby="request-heading"><h2 id="request-heading" className={xs.sectionTitle}>A domain for Harbor Dental</h2>
          <WebsiteDomainRequest workId="5e000000-0000-4000-8000-0000000000aa" workspaceId={WS} request={requestFixture} /></section>
          : <WebsiteDomainPanel publishedUrl="https://harbor-dental.strelva.site/" readBack="verified" domain={domain}
            manage={domain ? { busy, disabled: busy, onCheck: () => { setBusy(true); window.setTimeout(() => { setBusy(false); setDomain(current => current ? { ...current, checkedAt: new Date().toISOString() } : current); }, 800); } } : undefined}
            form={<WebsiteDomainForm value={value} onChange={setValue} hasDomain={Boolean(domain)} busy={busy} disabled={busy} onSubmit={() => { setBusy(true); window.setTimeout(() => { setBusy(false); setDomain({ ...DOMAIN_PENDING, hostname: value.trim() || "harbordental.com", checkedAt: null }); setValue(""); }, 800); }} />}>
          </WebsiteDomainPanel>}
      </div>
    </div>
  </OwnerShell>;
}

/* ---------- Forwarding ---------- */

function ForwardingPreview({ state, mode }: { state: string; mode: "light" | "dark" }) {
  const address = { id: "6a000000-0000-4000-8000-000000000001", localPart: "fwd-h4rb0rd3nt4l7k2m9q8x5w1", status: "active" as const, issuedAs: "owner" as const, issuedAt: "2026-10-14T15:00:00Z", revokedAt: null, revokedReason: null,
    firstReceivedAt: state === "arrived" ? "2026-10-15T09:02:00Z" : null, lastReceivedAt: state === "arrived" ? "2026-10-15T11:48:00Z" : null, receivedCount: state === "arrived" ? 6 : 0,
    providerConfirmation: state === "gmail" ? { provider: "gmail" as const, code: "418903271", url: "https://mail.google.com/", requestedBy: "amy.lin@harbordental.com", at: NOW } : null,
    email: "fwd-h4rb0rd3nt4l7k2m9q8x5w1@in.strelva.com" };
  const fixture: Load = state === "loading" ? { kind: "loading" } : state === "error" ? { kind: "error", message: "The forwarding address couldn't load. Reload to try again." }
    : { kind: "ready", view: { canManage: state !== "member", address: state === "none" || state === "member" ? null : address, revoked: [],
      latest: state === "arrived" ? { id: "6a000000-0000-4000-8000-000000000002", name: "Jordan Pierce", subject: "New patient cleaning, any Saturday?", capturedAt: "2026-10-15T11:48:00Z", intakeState: "kept", format: "gmail" } : null } };
  return <OwnerShell mode={mode} title="Inbox" current="inbox">
    <div className={xs.place} data-single>
      <div className={xs.main}>
        <header className={xs.head}><XaSystemTile kind="inbox" size={56} /><div className={xs.headText}><h1 className={xs.headTitle}>Inbox</h1><p className={xs.headMeta}>3 new this week · from your website and forwarded email</p></div></header>
        <ForwardInquiries key={state} workspaceId={WS} fixture={fixture} />
      </div>
    </div>
  </OwnerShell>;
}
