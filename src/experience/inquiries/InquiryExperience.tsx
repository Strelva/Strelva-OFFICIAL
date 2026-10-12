"use client";

import Link from "next/link";
import {
  Clock3,
  LayoutList,
  LockKeyhole,
  Menu,
  Plus,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { AppFrame, useHydrationReady, useViewportMatch } from "@/experience/app-frame/AppFrame";
import { LogoMark } from "@/components/Logo";
import { InquiryProvider, type InquiryExperienceProps, useInquiry } from "./context";
import type { InquiryView } from "./contracts";
import { ViewRouter } from "./views";
import styles from "./inquiry.module.css";
import shellStyles from "@/experience/app-frame/strelva-shell.module.css";
import sidebarStyles from "@/experience/app-frame/strelva-sidebar.module.css";
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
      <InquiryFrame />
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

function InquiryFrame() {
  const { snapshot, view, selectedRecord } = useInquiry();
  const ready = useHydrationReady();
  const menuRef = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wideInspector = useViewportMatch("(min-width: 768px)");
  const [openedRecordId, setOpenedRecordId] = useState<string | null>(null);
  const [closedRecordId, setClosedRecordId] = useState<string | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const historyOpen = Boolean(selectedRecord && view === "record" && (openedRecordId === selectedRecord.id || (wideInspector && closedRecordId !== selectedRecord.id)));
  const audience = snapshot.audience;
  const rightRail = selectedRecord ? <RecordTimelineRail /> : null;
  return (
    <div className={`${shellStyles.root} ${styles.experience}`} data-workspace-theme="linen" data-dashboard data-audience={audience} data-rehearsal={snapshot.rehearsal || view === "rehearsal" || undefined}>
      <a className={styles.skip} href="#inquiry-main">Skip to inquiries</a>
      <AppFrame
        className={`${shellStyles.shell} ${styles.frame}`}
        navigationLabel="Inquiry navigation"
        navigationStorageKey={`strelva:inquiries:${audience}:rail`}
        navigationOpen={mobileOpen}
        onCloseNavigation={() => setMobileOpen(false)}
        navigationTriggerRef={menuRef}
        contentId="inquiry-main"
        navigation={<InquirySidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />}
        header={<div className={styles.header}>
          <button ref={menuRef} className={styles.mobileMenu} type="button" onClick={() => setMobileOpen(true)} disabled={!ready} aria-label="Open inquiry navigation" aria-expanded={mobileOpen}><Menu size={18} aria-hidden="true" /></button>
          <span className={styles.headerTitle}>{titleForView(view, audience)}</span>
          <span className={styles.headerContext}><span className={styles.contextDot} aria-hidden="true" />{snapshot.business.name}</span>
          {selectedRecord && view === "record" ? <StPill ref={historyTrigger} type="button" variant="soft" aria-expanded={historyOpen} aria-controls="inquiry-record-timeline" onClick={() => { setOpenedRecordId(selectedRecord.id); setClosedRecordId(null); }}>Record history</StPill> : null}
          {snapshot.readOnly ? <span className={styles.readOnlyTag}><LockKeyhole size={13} aria-hidden="true" />Read only</span> : null}
        </div>}
        notice={<InquiryNotice />}
        rightRail={rightRail}
        rightRailId="inquiry-record-timeline"
        rightRailTitle="Record timeline"
        rightRailOpen={historyOpen}
        rightRailTriggerRef={historyTrigger}
        onCloseRightRail={() => { setOpenedRecordId(null); setClosedRecordId(selectedRecord?.id || null); }}
      >
        <InquirySurfaceContent />
      </AppFrame>
    </div>
  );
}

export function InquiryEmbeddedContent() {
  return <><InquiryNotice /><InquirySurfaceContent /></>;
}

function InquiryEmbeddedNavigation() {
  const { view, navigate } = useInquiry();
  return <nav className={styles.embeddedNav} aria-label="Inquiries">
    <StTextButton type="button" aria-current={view === "new" ? "page" : undefined} onClick={() => navigate("new")}>New</StTextButton>
    <StTextButton type="button" aria-current={view === "search" ? "page" : undefined} onClick={() => navigate("search")}>Search</StTextButton>
    <StTextButton type="button" aria-current={view === "work" || view === "receipt" || view === "record" ? "page" : undefined} onClick={() => navigate("work")}>Recent changes</StTextButton>
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

function InquirySidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { snapshot, view, navigate, basePath } = useInquiry();
  const recent = snapshot.state.requests.slice(0, 3);
  const agency = snapshot.audience === "agency";
  return <aside className={sidebarStyles.sidebar} data-open={mobileOpen}>
    <div className={sidebarStyles.brandRow}>
      <Link href={basePath} className={sidebarStyles.brand} onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
          event.preventDefault();
          navigate("home", { requestId: null, inquiryId: null });
        }
        onClose();
      }} aria-label={`${snapshot.business.name} inquiries home`}><span>{snapshot.business.name}</span></Link>
      <button className={sidebarStyles.mobileClose} type="button" onClick={onClose} aria-label="Close inquiry navigation"><X size={18} /></button>
    </div>
    <div className={sidebarStyles.body}>
      <nav className={sidebarStyles.primary} aria-label="Inquiries">
        <SidebarButton icon={LayoutList} label="Inquiries" active={view === "home"} onClick={() => { navigate("home", { requestId: null, inquiryId: null }); onClose(); }} />
        <SidebarButton icon={Plus} label="New" active={view === "new"} onClick={() => { navigate("new"); onClose(); }} />
        <SidebarButton icon={Search} label="Search" active={view === "search"} onClick={() => { navigate("search"); onClose(); }} />
        <Link className={sidebarStyles.navItem} href="/business" onClick={onClose}><LayoutList size={17} strokeWidth={1.6} aria-hidden="true" /><span>{agency ? "Clients" : "Businesses"}</span></Link>
        <SidebarButton icon={Clock3} label="Recent changes" active={view === "work" || view === "receipt" || view === "record"} onClick={() => { navigate("work"); onClose(); }} />
      </nav>
      {recent.length > 0 ? <section className={sidebarStyles.recent} aria-label="Recent inquiry changes"><h2>Recent</h2>{recent.map((work) => <button className={sidebarStyles.navItem} key={work.id} type="button" title={work.intent} onClick={() => { navigate("work", { requestId: work.id }); onClose(); }}><span>{work.intent}</span></button>)}</section> : null}
    </div>
    <div className={sidebarStyles.footer}>
      <div className={styles.platformMark} aria-label="Strelva platform"><LogoMark aria-hidden="true" />Strelva</div>
      <button type="button" className={sidebarStyles.account} aria-current={view === "account" ? "page" : undefined} onClick={() => { navigate("account"); onClose(); }}><span className={sidebarStyles.avatar} aria-hidden="true"><UserRound size={16} /></span><span><strong>{snapshot.account?.name || "Your account"}</strong><small>{snapshot.account?.email || "Account"}</small></span></button>
    </div>
  </aside>;
}

function SidebarButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={sidebarStyles.navItem} onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></button>;
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
