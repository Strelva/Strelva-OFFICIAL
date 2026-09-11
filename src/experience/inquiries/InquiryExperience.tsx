"use client";

import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
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
  return <main className={styles.unavailablePage}><div className={styles.unavailablePanel}><span className={styles.eyebrow}>INQUIRIES UNAVAILABLE</span><h1 className="font-display">This business could not be loaded.</h1><p>Refresh to try again. No preview data was substituted for the authorized business state.</p></div></main>;
}

function titleForView(view: InquiryView, audience: "business" | "agency"): string {
  if (view === "home") return audience === "agency" ? "Attention" : "Inquiries";
  return {
    new: "New", shape: "Shape", work: "Work", plan: "Plan", preview: "Preview", rehearsal: "Rehearsal", receipt: "Receipt", search: "Search", record: "Records", why: "Why", responsibility: "Responsibility", connections: "Connections", onboarding: "Onboarding", account: "Account", attention: "Attention", patterns: "Patterns", home: "Inquiries",
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
    <div className={styles.experience} data-dashboard data-audience={audience} data-rehearsal={snapshot.rehearsal || view === "rehearsal" || undefined}>
      <a className={styles.skip} href="#inquiry-main">Skip to inquiry work</a>
      <AppFrame
        className={styles.frame}
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
          {selectedRecord && view === "record" ? <button ref={historyTrigger} type="button" className={styles.secondaryButton} aria-expanded={historyOpen} aria-controls="inquiry-record-timeline" onClick={() => { setOpenedRecordId(selectedRecord.id); setClosedRecordId(null); }}>Record history</button> : null}
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
  return <nav className={styles.embeddedNav} aria-label="Inquiry work">
    <button type="button" className={view === "new" ? styles.embeddedNavActive : undefined} onClick={() => navigate("new")}>New</button>
    <button type="button" className={view === "search" ? styles.embeddedNavActive : undefined} onClick={() => navigate("search")}>Search</button>
    <button type="button" className={view === "work" || view === "receipt" || view === "record" ? styles.embeddedNavActive : undefined} onClick={() => navigate("work")}>Recent work</button>
    <button type="button" className={view === "account" ? styles.embeddedNavActive : undefined} onClick={() => navigate("account")}>Account</button>
  </nav>;
}

export function InquirySurfaceContent() {
  const { snapshot, view } = useInquiry();
  return <><Feedback /><div className={styles.content} data-view={view} data-rehearsal={view === "rehearsal" || undefined}>{snapshot.available ? <ViewRouter /> : <UnavailableBusiness />}</div></>;
}

function UnavailableBusiness() {
  return <section className={styles.unavailablePanel} role="alert" aria-labelledby="inquiries-unavailable-title"><span className={styles.eyebrow}>INQUIRIES UNAVAILABLE</span><h1 id="inquiries-unavailable-title" className="font-display">This business could not be loaded.</h1><p>The authorized inquiry state is unavailable right now. No preview data was substituted.</p></section>;
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
  return <div className={`${styles.feedback} ${error ? styles.feedbackError : styles.feedbackSuccess}`} role={error ? "alert" : "status"}>
    {error ? <AlertCircle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
    <span>{error || message}</span>
  </div>;
}

function InquirySidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { snapshot, view, navigate, basePath } = useInquiry();
  const recent = snapshot.state.requests.slice(0, 3);
  const agency = snapshot.audience === "agency";
  return <aside className={styles.sidebar} data-open={mobileOpen}>
    <div className={styles.brandRow}>
      <Link href={basePath} className={styles.brand} onClick={onClose} aria-label="Strelva inquiries home"><LogoMark className={styles.brandMark} /><span className="font-display">Strelva</span></Link>
      <button className={styles.mobileClose} type="button" onClick={onClose} aria-label="Close inquiry navigation"><X size={18} /></button>
    </div>
    <div className={styles.scopeBlock}><span className={styles.eyebrow}>{agency ? "CLIENT" : "BUSINESS"}</span><strong>{snapshot.business.name}</strong><small>{snapshot.business.domain || "Website not recorded"}</small></div>
    <nav className={styles.sidebarNav} aria-label="Inquiry work">
      <SidebarButton icon={Plus} label="New" active={view === "new"} onClick={() => { navigate("new"); onClose(); }} />
      <SidebarButton icon={Search} label="Search" active={view === "search"} onClick={() => { navigate("search"); onClose(); }} />
      <Link className={`${styles.sidebarButton} ${view === "attention" ? styles.sidebarButtonActive : ""}`} href={agency ? "/business" : "/business"} onClick={onClose} aria-current={view === "attention" ? "page" : undefined}><LayoutList size={17} strokeWidth={1.6} aria-hidden="true" /><span>{agency ? "Clients" : "Businesses"}</span></Link>
      <SidebarButton icon={Clock3} label="Recent work" active={view === "work" || view === "receipt" || view === "record"} onClick={() => { navigate("work"); onClose(); }} />
    </nav>
    {recent.length > 0 ? <div className={styles.recentRail} aria-label="Recent inquiry work"><span className={styles.eyebrow}>RECENT</span>{recent.map((work) => <button key={work.id} type="button" onClick={() => { navigate("work", { requestId: work.id }); onClose(); }}><span>{work.intent}</span><small>{work.state.replaceAll("_", " ")}</small></button>)}</div> : null}
    <div className={styles.sidebarFooter}><SidebarButton icon={UserRound} label="Account" active={view === "account"} onClick={() => { navigate("account"); onClose(); }} /></div>
  </aside>;
}

function SidebarButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`${styles.sidebarButton} ${active ? styles.sidebarButtonActive : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></button>;
}

function RecordTimelineRail() {
  const { selectedRecord, snapshot } = useInquiry();
  if (!selectedRecord) return null;
  const events = snapshot.state.timeline.filter((event) => event.inquiryId === selectedRecord.id).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return <section className={styles.recordRailContent}><span className={styles.eyebrow}>EVIDENCE</span><h2 className="font-display">Record timeline</h2><p>Each event is retained with the inquiry record.</p>{snapshot.deliveryEvidence?.available === false ? <p role="status">Delivery evidence is unavailable right now. Provider outcomes may be missing.</p> : null}{events.length > 0 ? <ol className={styles.railTimeline}>{events.map((event) => <li key={event.id}><span className={styles.eventDot} aria-hidden="true" /><div><strong>{event.type.replaceAll("_", " ")}</strong><small>{event.summary}</small><small>{event.actor.label || event.actor.id} · {formatRailDate(event.at)} · {event.outcome}</small></div></li>)}</ol> : <p>No timeline events are recorded for this inquiry.</p>}</section>;
}

function formatRailDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time) : "Time not recorded";
}
