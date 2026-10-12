"use client";

import { LockKeyhole } from "lucide-react";
import { useRef, useState } from "react";
import { useViewportMatch } from "@/experience/app-frame/AppFrame";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { InquiryProvider, type InquiryExperienceProps, useInquiry } from "./context";
import type { InquiryView } from "./contracts";
import { ViewRouter } from "./views";
import styles from "./inquiry.module.css";
import { StEmpty, StHead, StNotice, StPage, StPill, StSteps, StTextButton } from "@/components/ui/strelva/Kit";
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
  return <main className={styles.unavailablePage} data-workspace-theme="linen"><StPage><StHead title="This business could not be loaded." /><StNotice tone="critical">Refresh to try again. No preview data was substituted for the authorized business state.</StNotice><StTextButton href="/business">Choose another business</StTextButton></StPage></main>;
}

function titleForView(view: InquiryView, audience: "business" | "agency"): string {
  if (view === "home") return audience === "agency" ? "Attention" : "Inquiries";
  return {
    new: "New", shape: "Shape", work: "Recent changes", plan: "Plan", preview: "Preview", rehearsal: "Rehearsal", receipt: "Receipt", search: "Search", record: "Records", why: "Why", responsibility: "Running", connections: "Connections", onboarding: "Onboarding", account: "Account", attention: "Attention", patterns: "Patterns", home: "Inquiries",
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
  return <StPage><StHead titleId="inquiries-unavailable-title" title="This business could not be loaded." /><StNotice tone="critical">The authorized inquiry state is unavailable right now. No preview data was substituted.</StNotice><StTextButton href="/business">Choose another business</StTextButton></StPage>;
}

export function InquiryNotice() {
  const { snapshot, view } = useInquiry();
  return snapshot.rehearsal || view === "rehearsal" ? (
    <div className={styles.rehearsalNotice} role="note">
      <span className={styles.noticeIcon} aria-hidden="true">✦</span>
      <strong>Rehearsal.</strong>
      <span>Nothing here is real.</span>
      <span className={styles.noticeDetail}>Synthetic customers, test inboxes, and blocked external writes only.</span>
    </div>
  ) : null;
}

function Feedback() {
  const { message, error } = useInquiry();
  if (!message && !error) return null;
  return <div className={styles.feedback} role={error ? undefined : "status"}><StNotice tone={error ? "critical" : undefined}>{error || message}</StNotice></div>;
}

function RecordTimelineRail() {
  const { selectedRecord, snapshot } = useInquiry();
  if (!selectedRecord) return null;
  const events = snapshot.state.timeline.filter((event) => event.inquiryId === selectedRecord.id).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return <section className={styles.recordRailContent}><h2>Record timeline</h2><p>Each event is retained with the inquiry record.</p>{snapshot.deliveryEvidence?.available === false ? <StNotice>Delivery evidence is unavailable right now. Provider outcomes may be missing.</StNotice> : null}{events.length > 0 ? <StSteps label="Inquiry record history" steps={events.map(event => ({ title: event.type.replaceAll("_", " "), state: event.outcome === "failed" || event.outcome === "blocked" ? "failed" : "done", detail: <>{event.summary}<small className={styles.timelineMeta}>{inquiryActorLabel(event.actor)} · {formatRailDate(event.at)} · {event.outcome}</small></> }))} /> : <StEmpty>No timeline events are recorded for this inquiry.</StEmpty>}</section>;
}

function formatRailDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time) : "Time not recorded";
}
