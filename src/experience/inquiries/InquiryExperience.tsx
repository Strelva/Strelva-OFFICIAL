"use client";

import { LockKeyhole } from "lucide-react";
import { useRef, useState } from "react";
import { useViewportMatch } from "@/experience/app-frame/AppFrame";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { InquiryProvider, type InquiryExperienceProps, useInquiry } from "./context";
import type { InquiryView } from "./contracts";
import { ViewRouter } from "./views";
import styles from "./inquiry.module.css";
import { StPill, StTextButton } from "@/components/ui/strelva/Kit";
import { XaLines, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaNote, XaPlace, XaPlaceTrouble } from "@/experience/places/XaPlace";
import { inquiryActorLabel } from "./recorded-actors";

export type { InquiryExperienceProps } from "./context";

export function InquiryExperience({
  initialView = "home",
  initialRequestId,
  initialInquiryId,
  initialRequestText,
  basePath = "/preview/strelva/inquiries",
  routePrefix,
  adapter,
  initialSnapshot,
  systemsReleased = false,
}: InquiryExperienceProps) {
  if (!adapter) {
    return <MissingAdapter />;
  }
  return (
    <InquiryProvider
      adapter={adapter}
      initialSnapshot={initialSnapshot}
      initialView={initialView}
      initialRequestId={initialRequestId}
      initialInquiryId={initialInquiryId}
      initialRequestText={initialRequestText}
      basePath={basePath}
      routePrefix={routePrefix}
    >
      <InquiryFrame systemsReleased={systemsReleased} />
    </InquiryProvider>
  );
}

/**
 * The inquiry product can live inside the shared workspace frame. It keeps
 * the same provider, commands, and views while omitting its product-owned
 * navigation frame. The workspace remains the owner of top-level navigation.
 */
export function InquiryWorkspaceExperience({
  initialView = "home",
  initialRequestId,
  initialInquiryId,
  initialRequestText,
  basePath = "/workspace",
  routePrefix = "inquiry",
  adapter,
  initialSnapshot,
}: InquiryExperienceProps) {
  if (!adapter) return <MissingAdapter />;
  return (
    <InquiryProvider
      adapter={adapter}
      initialSnapshot={initialSnapshot}
      initialView={initialView}
      initialRequestId={initialRequestId}
      initialInquiryId={initialInquiryId}
      initialRequestText={initialRequestText}
      basePath={basePath}
      routePrefix={routePrefix}
    >
      <div className={styles.embedded} data-inquiry-embedded>
        <InquiryEmbeddedNavigation />
        <InquiryEmbeddedContent />
      </div>
    </InquiryProvider>
  );
}

function MissingAdapter() {
  return <main className={styles.unavailablePage} data-workspace-theme="linen"><XaPlace width="read" label="Your business"><XaPlaceTrouble title="Your inquiries didn't load." quiet="Nothing changed. Refresh the page to try again." action={<XaTextLink href="/business">Choose another business</XaTextLink>} /></XaPlace></main>;
}

function titleForView(view: InquiryView, audience: "business" | "agency"): string {
  if (view === "home") return audience === "agency" ? "Attention" : "Inquiries";
  return {
    new: "New", shape: "Shape", work: "Recent changes", plan: "Plan", preview: "Preview", rehearsal: "Rehearsal", receipt: "Receipt", search: "Search", record: "Records", why: "Why", responsibility: "Running", connections: "Connections", onboarding: "Check my website", account: "Account", attention: "Attention", patterns: "Patterns", home: "Inquiries",
  }[view];
}

function InquiryFrame({ systemsReleased }: { systemsReleased: boolean }) {
  const { snapshot, view, selectedRecord, basePath, navigate } = useInquiry();
  const wideInspector = useViewportMatch("(min-width: 768px)");
  const [openedRecordId, setOpenedRecordId] = useState<string | null>(null);
  const [closedRecordId, setClosedRecordId] = useState<string | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const historyOpen = Boolean(selectedRecord && view === "record" && (openedRecordId === selectedRecord.id || (wideInspector && closedRecordId !== selectedRecord.id)));
  const audience = snapshot.audience;
  const servingAgency = snapshot.servingAgency;
  const workspaceName = audience === "agency" ? `${servingAgency?.agencyId ? servingAgency.name : "Agency identity unavailable"} / ${snapshot.business.name}` : snapshot.business.name;
  const appBase = basePath.startsWith("/preview/strelva") ? "/preview/strelva" : "";
  return (
    <div data-audience={audience} data-rehearsal={snapshot.rehearsal || view === "rehearsal" || undefined}>
      <StrelvaShell
        title={titleForView(view, audience)}
        workspaceName={workspaceName}
        workspaceId={snapshot.business.workspaceId}
        ownerBrand={servingAgency || undefined}
        systemsReleased={snapshot.releases?.systems ?? systemsReleased}
        appBase={appBase}
        active="system"
        accountName={snapshot.account?.name || "Your account"}
        accountDetail={snapshot.account?.email || undefined}
        signedIn
        signOut={snapshot.rehearsal ? null : undefined}
        contentId="inquiry-main"
        pinned={[{ id: "inquiries", title: "Inquiries", kind: "inquiries", href: basePath, current: true, onOpen: () => navigate("home", { requestId: null, inquiryId: null }) }]}
        context={snapshot.readOnly ? <span className={styles.readOnlyTag}><LockKeyhole size={13} aria-hidden="true" />Read only</span> : undefined}
        actions={selectedRecord && view === "record" ? <StPill ref={historyTrigger} type="button" variant="soft" aria-expanded={historyOpen} aria-controls="inquiry-record-timeline" onClick={() => { setOpenedRecordId(selectedRecord.id); setClosedRecordId(null); }}>Record history</StPill> : undefined}
        notice={<InquiryNotice />}
        rightRail={selectedRecord ? <RecordTimelineRail /> : null}
        rightRailId="inquiry-record-timeline"
        rightRailTitle="Record timeline"
        rightRailOpen={historyOpen}
        rightRailTriggerRef={historyTrigger}
        onCloseRightRail={() => { setOpenedRecordId(null); setClosedRecordId(selectedRecord?.id || null); }}
      >
        <div className={styles.embedded} data-inquiry-embedded>
          <InquiryEmbeddedNavigation />
          <InquirySurfaceContent />
        </div>
      </StrelvaShell>
    </div>
  );
}

export function InquiryEmbeddedContent() {
  return <><InquiryNotice /><InquirySurfaceContent /></>;
}

function InquiryEmbeddedNavigation() {
  const { view, navigate, snapshot } = useInquiry();
  return <nav className={styles.embeddedNav} aria-label="Inquiries">
    <StTextButton type="button" aria-current={view === "home" ? "page" : undefined} onClick={() => navigate("home", { requestId: null, inquiryId: null })}>Inquiries</StTextButton>
    <StTextButton type="button" aria-current={view === "new" ? "page" : undefined} onClick={() => navigate("new")}>New</StTextButton>
    <StTextButton type="button" aria-current={view === "search" ? "page" : undefined} onClick={() => navigate("search")}>Search</StTextButton>
    <StTextButton type="button" aria-current={view === "work" || view === "receipt" || view === "record" ? "page" : undefined} onClick={() => navigate("work")}>Recent changes</StTextButton>
    <StTextButton href="/business">{snapshot.audience === "agency" ? "Clients" : "Businesses"}</StTextButton>
    <StTextButton type="button" aria-current={view === "account" ? "page" : undefined} onClick={() => navigate("account")}>Account</StTextButton>
  </nav>;
}

export function InquirySurfaceContent() {
  const { snapshot, view } = useInquiry();
  return <><Feedback /><div className={styles.content} data-view={view} data-rehearsal={view === "rehearsal" || undefined}>{snapshot.available ? <ViewRouter /> : <UnavailableBusiness />}</div></>;
}

function UnavailableBusiness() {
  const { snapshot } = useInquiry();
  const name = snapshot.business?.name;
  return <XaPlace width="read" label="Your business"><XaPlaceTrouble title={name ? `${name}'s inquiries didn't load.` : "Your inquiries didn't load."} quiet="Nothing changed. Refresh the page to try again." action={<XaTextLink href="/business">Choose another business</XaTextLink>} /></XaPlace>;
}

export function InquiryNotice() {
  const { snapshot, view } = useInquiry();
  return snapshot.rehearsal || view === "rehearsal" ? (
    <div className={styles.rehearsalNotice} role="note">
      <XaNote pebble><strong>Rehearsal.</strong> Nothing here is real. Synthetic customers, test inboxes, and blocked external writes only.</XaNote>
    </div>
  ) : null;
}

function Feedback() {
  const { message, error } = useInquiry();
  if (!message && !error) return null;
  return <div className={styles.feedback} role={error ? "alert" : "status"}><XaNote pebble tone={error ? "trouble" : undefined}>{error || message}</XaNote></div>;
}

function RecordTimelineRail() {
  const { selectedRecord, snapshot } = useInquiry();
  if (!selectedRecord) return null;
  const events = snapshot.state.timeline.filter((event) => event.inquiryId === selectedRecord.id).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return <section className={styles.recordRailContent}><h2>Record timeline</h2><p>Each event is kept with the inquiry. Each line names whoever acted.</p>
    {snapshot.deliveryEvidence?.available === false ? <XaNote pebble>Delivery results can&apos;t be read right now, so some may be missing.</XaNote> : null}
    {events.length > 0 ? <XaLines label="Inquiry record history" lines={events.map(event => ({ time: formatRailDate(event.at), dateTime: event.at,
      text: <>{inquiryActorLabel(event.actor)}: {event.summary}{event.outcome === "failed" || event.outcome === "blocked" ? ` (${event.outcome === "failed" ? "did not finish" : "held back"})` : ""}</> }))} />
      : <XaNote>No timeline events are recorded for this inquiry.</XaNote>}
  </section>;
}

function formatRailDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(time) : "Time not recorded";
}
