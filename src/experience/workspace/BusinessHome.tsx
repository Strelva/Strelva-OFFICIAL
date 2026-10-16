"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Check, Circle, FileText, LayoutGrid, LoaderCircle, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { StPage, StHead, StSection, StRows, StRow, StBeacon, StState, StMono, StTextButton, StEmpty, StNotice, StSkeleton, StComposerDock, StSteps } from "@/components/ui/strelva/Kit";
import { Button } from "@/components/ui/Button";
import { actorPresentation } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import { StrelvaShell, pinnedApps, pinnedSystems, pinnedWebsites, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { BusinessArrivals } from "@/experience/systems/BusinessArrivals";
import { SystemList } from "@/experience/systems/SystemList";
import { SYSTEMS_LABEL, SYSTEMS_LIST_LABEL, HEALTH_LABEL, LIFECYCLE_LABEL, type SystemView } from "@/experience/systems/model";
import type { OfferingWebsiteBinding, OfferingWebsiteBindingCommand } from "@/platform/offerings";
import type { WorkspaceSnapshot, WorkspaceSystemActivation, WorkspaceWork } from "./contracts";
import type { ManagedWorkSummary } from "./workspace-discovery";
import type { WorkspaceSearchItem } from "./workspace-search";
import { BusinessOfferingSummary, WebsiteAssignmentHandoff, type WorkspaceOfferingState } from "./WorkspaceOfferings";
import { WorkspaceAllowanceSummary } from "./WorkspaceAllowanceSummary";
import { OwnerPhoneNavigation } from "./OwnerPhoneNavigation";
import { navigateWorkspace, readWorkspaceLocation } from "@/platform/workspaces/location";
import { greetingName } from "./today/today-model";
import { OwnerToday } from "./today/OwnerToday";
import { ownerSystemRank } from "./today/today-model";
import { OwnerDecisionView } from "./today/OwnerDecisionView";
import { workspaceReadEligibility } from "./workspace-read-eligibility";
import { useAgencyClientHome } from "./useAgencyClientHome";
import { agencyClientDeliveries } from "./agency-client-home";
import { AgencyClientDecisionStatus, AgencyClientChanges, AgencyClientDeliveryCheck } from "./AgencyClientHomeSections";
import { WorkspaceBusinessSwitcher, agencyClientLinks, clientAgencyWorkspace } from "./WorkspaceBusinessSwitcher";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { requestDraftKey } from "./request-draft";
import { useBusinessDeliveries } from "./useBusinessDeliveries";
import { NeedsYouSection, StrelvaHandledSection } from "./NeedsYouSection";
import { decisionCount } from "./needs-you-presentation";
import { useNeedsYou } from "./useNeedsYou";
import { SiteSummarySection, useSiteSummary, type SiteSummaryState } from "./SiteSummarySection";
import { ownerGettingStartedHref } from "./getting-started-status";
import { workspaceHome } from "./workspace-home";
import { businessRequestRows, deliveryProviderName, type BusinessRequestRow } from "./WorkspaceRequests";
import { workspaceWorkLabel } from "./work-label";
import { LoopRibbon } from "./outcomes/LoopRibbon";
import { useHomeOutcomes } from "./outcomes/HomeOutcomes";
import styles from "./business-home.module.css";

interface Props {
  needs?: ReturnType<typeof useNeedsYou>;
  agencyHome?: ReturnType<typeof useAgencyClientHome>;
  appBase?: string;
  accountHref: string;
  onOfferings: (id?: string) => void;
  managedWorkUnavailable?: boolean;
  snapshot: WorkspaceSnapshot;
  sites: readonly ManagedWorkSummary[];
  unassignedSites: readonly ManagedWorkSummary[];
  siteAssignmentsKnown: boolean;
  offerings: WorkspaceOfferingState;
  busy: boolean;
  notice?: ReactNode;
  onOpen: (id: string) => void;
  onStart: () => void;
  onCreateWebsite?: () => void;
  onRequest?: (request: string) => void;
  onDraftChange?: (request: string) => void;
  /** Opens any workspace place or business-menu section. */
  onNavigate: (section: StrelvaSection) => void;
  onWorkspace: (id: string) => void;
  signOut?: ReactNode;
  onWebsiteCommand?: (command: OfferingWebsiteBindingCommand) => Promise<OfferingWebsiteBinding | null>;
  onRetryWebsiteAssignments?: () => void;
  /** The business's actual Systems (read adapter output). */
  systems?: readonly SystemView[];
  /** Saved results that are not Systems. Defaults to Home's recorded results. */
  files?: readonly WorkspaceWork[];
  systemHref?: (id: string) => string;
  onOpenSystem?: (id: string) => void;
  /** Still loading, so the System list is incomplete. */
  systemsLoading?: boolean;
  /** The server could not read this business's Systems. */
  systemsUnavailable?: boolean;
  /**
   * STRELVA_SYSTEMS_RELEASE, from the server's snapshot. Off (the default)
   * renders Home exactly as before the Systems model: no Systems header,
   * list or files split, and the website and apps pinned by name.
   */
  systemsReleased?: boolean;
  /**
   * `home` (the default) or the Needs you place: the deck of the owner's
   * decisions. The Needs you place exists only while STRELVA_NEEDS_YOU_RELEASE
   * is on; the layout opens Home otherwise.
   */
  view?: "home" | "needs-you";
}

const STARTERS = [
  { label: "Fix customer follow-up", request: "Make sure customer follow-up does not fall through." },
  { label: "Improve our website", request: "Improve our website based on what customers need." },
  { label: "Give my team a better way to request things", request: "Give my team a better way to submit and track requests." },
] as const;

/** The minute, on the client only. The server and hydration render without a clock. */
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

export { ownerSystemRank } from "./today/today-model";

function greetingFor(minute: number | null): { greeting: string; line: string | null } {
  if (minute === null) return { greeting: "Welcome back.", line: null };
  const at = new Date(minute * 60_000);
  const hour = at.getHours();
  const weekday = at.toLocaleDateString("en-US", { weekday: "long" });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return { greeting: hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.", line: `${weekday}, ${time}` };
}

type StepState = "done" | "now" | "attention" | "next";
function stepState(line: WorkspaceSystemActivation["lines"][number]): StepState {
  if (line.state.startsWith("Done") || line.state === "Can't be undone") return "done";
  if (line.detail === "Running now.") return "now";
  if (line.state === "Waiting" || line.state === "Didn't happen" || line.state === "Not sure yet") return "attention";
  return "next";
}
const STEP_ICON = { done: Check, now: LoaderCircle, attention: TriangleAlert, next: Circle } as const;

/** Live chips on the dusk band: only what the snapshot and the site summary actually say. */
function liveChips(siteSummary: SiteSummaryState, systems: readonly SystemView[], sites: readonly ManagedWorkSummary[], systemsReleased: boolean): { id: string; text: string; tone: "live" | "clay" | "quiet" }[] {
  const chips: { id: string; text: string; tone: "live" | "clay" | "quiet" }[] = [];
  const site = siteSummary.status === "ready" ? siteSummary.data.sites[0] : undefined;
  if (site?.visits) chips.push({ id: "visits", text: `${site.siteName} · ${site.visits.thisWeek.toLocaleString("en-US")} found you this week`, tone: "live" });
  if (systemsReleased && systems.length) {
    const live = systems.filter(item => item.lifecycle === "live").length;
    const off = systems.filter(item => item.health.state === "degraded" || item.health.state === "blocked").length;
    if (live) chips.push({ id: "live", text: `${live} ${live === 1 ? "system" : "systems"} live`, tone: "live" });
    if (off) chips.push({ id: "health", text: `${off} ${off === 1 ? "needs" : "need"} a look`, tone: "clay" });
  } else if (!systemsReleased && sites.length) {
    chips.push({ id: "sites", text: `${sites.length} connected ${sites.length === 1 ? "website" : "websites"}`, tone: "quiet" });
  }
  if (site?.leads?.count) chips.push({ id: "leads", text: `${site.leads.count.toLocaleString("en-US")} reached out · 30 days`, tone: "quiet" });
  return chips.slice(0, 3);
}

/** The start and return surface, using the same frame as every saved result. */
export function BusinessHome({ needs: providedNeeds, agencyHome: providedAgencyHome, snapshot, sites, unassignedSites, siteAssignmentsKnown, offerings, busy, notice, onOpen, onStart, onCreateWebsite, onRequest, onDraftChange, onNavigate, onWorkspace, onOfferings, appBase = "", accountHref, signOut, managedWorkUnavailable, onWebsiteCommand, onRetryWebsiteAssignments, files, systemHref, onOpenSystem, systemsLoading = false, systemsUnavailable = false, systems: knownSystems = [], systemsReleased = false, view = "home" }: Props) {
  const [handledWorkspaceId, setHandledWorkspaceId] = useState<string | null>(null);
  // The decision opened from Today in this session, until the address carries it.
  const [reviewed, setReviewed] = useState<{ workspaceId: string; id: string } | null>(null);
  const showHandled = handledWorkspaceId === snapshot.workspaceId;
  const needsYouHeading = useRef<HTMLHeadingElement>(null);
  // An incomplete list would misplace a System; show none until it loads.
  const systems = systemsReleased && !systemsLoading ? knownSystems : [];
  const current = snapshot.workspaces.find(space => space.id === snapshot.workspaceId);
  const agencySeat = current?.access === "provider_seat";
  const readOnly = current?.access === "delegated_read" || current?.access === "provider_seat";
  const customer = current?.kind === "customer";
  const name = current?.name || "Your business";
  const home = workspaceHome(snapshot.work);
  const eligibility = workspaceReadEligibility(current, snapshot.releases?.needsYou === true);
  const localAgencyHome = useAgencyClientHome(!providedAgencyHome && agencySeat ? snapshot.workspaceId : undefined);
  const sharedHome = providedAgencyHome ?? localAgencyHome;
  const locationParams = useSearchParams();
  const readLocation = readWorkspaceLocation(new URLSearchParams(locationParams?.toString() ?? ""));
  const decisionHint = locationParams?.get("item") ?? (typeof window !== "undefined" && window.location.hash.startsWith("#decision-") ? window.location.hash.slice(10) : undefined);
  const selectedDecisionId = readLocation.decision ?? (decisionHint && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decisionHint) ? decisionHint : undefined);
  const decisionId = selectedDecisionId ?? (reviewed?.workspaceId === snapshot.workspaceId ? reviewed.id : undefined);
  const agencyWorkspace = clientAgencyWorkspace(snapshot);
  const navigationBrand = !agencyWorkspace || snapshot.ownerBrand?.agencyId === agencyWorkspace.id ? snapshot.ownerBrand : undefined;
  const deliveryScope = eligibility.deliveries && !agencySeat ? snapshot.workspaceId : undefined;
  const deliveries = useBusinessDeliveries(deliveryScope);
  const refreshDeliveries = agencySeat ? sharedHome.refresh : deliveries.refresh;
  const deliveryItems = agencySeat ? sharedHome.state.status === "ready" ? agencyClientDeliveries(sharedHome.state.data) : [] : deliveries.state.status === "ready" ? deliveries.state.items : [];
  const deliveryAttention = deliveryItems.filter(item => item.attention);
  // STRELVA_NEEDS_YOU_RELEASE: Needs you and What changed come from the
  // policy model. Request decisions arrive there as items, so the delivery
  // list no longer adds its own.
  const needsYouReleased = eligibility.decisions;
  const localNeeds = useNeedsYou(!providedNeeds && needsYouReleased && eligibility.canDecide ? snapshot.workspaceId : undefined);
  const needsYou = providedNeeds ?? localNeeds;
  // Owner entry: the linked site's numbers, inquiries and Strelva's work (the old Today page).
  // Outcome loop: preview-only until the loop is joined on the server (null by default).
  const outcomes = useHomeOutcomes();
  const siteSummary = useSiteSummary(eligibility.siteSummary ? snapshot.workspaceId : undefined);
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  const { greeting, line } = greetingFor(minute);
  const attentionCount = home.attention.length + deliveryAttention.length;
  const decisionsWaiting = agencySeat ? sharedHome.state.status === "ready" ? sharedHome.state.data.decisions.filter(item => item.state === "open").length : null : needsYou.state.status === "ready" && needsYou.state.complete ? needsYou.state.items.length + home.attention.length : null;
  const fileIds = systemsReleased && files ? new Set(files.map(item => item.id)) : null;
  const results = fileIds ? home.results.filter(work => fileIds.has(work.id)) : home.results;
  const savedResultCount = results.length;
  // The Systems layout (Systems list and files split) is for a business with Systems released.
  const business = systemsReleased && customer;
  // Connected sites (the business's own site, any builder) open at /workspace/site when on for this business.
  const connectSiteHref = business && !readOnly && (snapshot.releases?.connectedSites === true || snapshot.releases?.websiteRebuild === true)
    ? `${appBase}/workspace/site?${new URLSearchParams({ workspaceId: snapshot.workspaceId })}` : null;
  const openSystemHref = systemHref || ((id: string) => `${appBase}/workspace?view=system&system=${encodeURIComponent(id)}&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`);
  const live = systems.filter(item => item.lifecycle === "live").length;
  const drafts = systems.filter(item => item.lifecycle === "draft").length;
  const paused = systems.filter(item => item.lifecycle === "paused").length;
  const agencyNames = new Map(snapshot.workspaces.filter(space => space.kind === "agency").map(space => [space.id, space.name]));
  const requestRows = businessRequestRows(deliveryItems, snapshot.work, item => deliveryProviderName(item, agencyNames));
  const handled = requestRows.filter(row => row.stage === "done").slice(0, 5);
  const inProgress = requestRows.filter(row => row.stage === "in_progress" || row.stage === "asked");
  // With Systems released, What changed is the receipt feed, not done Requests,
  // and In progress also lists every Make real that is running or partly live.
  const receipts = systemsReleased ? snapshot.systems?.handled ?? [] : [];
  const making = systemsReleased ? snapshot.systems?.activations ?? [] : [];
  /** Requests belong to a business. Personal workspaces only see these lists when something is in them. */
  const showRequests = customer || requestRows.length > 0;
  const deliveryPending = agencySeat ? sharedHome.state.status === "loading" : deliveries.state.status === "loading";
  const deliveryUnavailable = agencySeat ? sharedHome.state.status === "error" : deliveries.state.status === "error";
  const workHref = (id: string) => `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&work=${encodeURIComponent(id)}`;
  const searchItems: WorkspaceSearchItem[] = [
    { id: "action-new", title: "Start with an outcome", detail: "Tell Strelva what you want to make happen", href: `${appBase}/workspace?view=start&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: onStart },
    systemsReleased
      ? { id: "action-explore", title: "Browse Apps", detail: "Apps you can install and adapt", href: `${appBase}/workspace?view=products&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: () => onNavigate("products") }
      : { id: "action-explore", title: "Get or build an app", detail: "Apps and templates you can adapt", href: `${appBase}/workspace?view=products&workspaceId=${encodeURIComponent(snapshot.workspaceId)}`, onOpen: () => onNavigate("products") },
    ...snapshot.work.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) })),
    ...(systemsReleased
      ? systems.map(system => ({ id: `system-${system.id}`, title: system.name, detail: "System", href: openSystemHref(system.id), onOpen: onOpenSystem ? () => onOpenSystem(system.id) : undefined }))
      : sites.map(site => ({ id: `site-${site.id}`, title: site.title, detail: "Managed website", href: site.href }))),
    ...deliveryItems.map(item => ({ id: `delivery-${item.id}`, title: item.title, detail: item.detail, href: item.href })),
  ];
  const recentWork = results.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: workHref(work.id), onOpen: () => onOpen(work.id) }));

  function requestRow(row: BusinessRequestRow) {
    const body = <><span><strong>{row.title}</strong><small>{row.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></>;
    return <li key={row.id}>{row.href ? <a className={styles.row} href={row.href}>{body}</a> : <button type="button" aria-label={`Open ${row.title}`} className={styles.row} onClick={() => row.workId && onOpen(row.workId)}>{body}</button>}</li>;
  }

  function request(value: string) {
    if (readOnly || busy) return;
    if (onRequest) onRequest(value);
    else onStart();
  }

  const attentionRows = home.attention.map(({ work, reason }) => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}><span><strong>{work.title}</strong><small>{reason}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>);
  const receiptList = <ul className={styles.list} aria-label="This week’s changes">{receipts.slice(0, 7).map(receipt => <li key={receipt.id}><span className={styles.row}><span><strong>{receipt.sentence}</strong>{actorPresentation(receipt.actor).credit ? <small>{actorPresentation(receipt.actor).credit}</small> : null}<small>{new Date(receipt.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {receipt.undo}</small></span></span></li>)}</ul>;

  // ---- Strelva is working (ink-moss): what is moving now, then recorded changes.
  const lead = making[0];
  const otherMaking = making.slice(lead ? 1 : 0);
  const leadRequest = lead ? undefined : inProgress[0];
  const otherRequests = inProgress.slice(leadRequest ? 1 : 0, 5);
  const progressChecking = busy || deliveryPending;
  const anyWork = Boolean(lead || leadRequest);
  const working = <section className={`${styles.working} ${styles.reveal}`} style={{ "--i": 1 } as CSSProperties} aria-labelledby="home-progress">
    <p className={styles.eyebrow} data-tone="aurora"><span className={styles.dot} aria-hidden="true" data-live={anyWork || undefined} />{anyWork ? "In progress" : "This week"}</p>
    <h2 id="home-progress" className={styles.srOnly}>In progress</h2>
    {lead ? <div className={styles.lead}>
      <h3>{lead.partlyLive ? `${lead.title}: Partly live` : lead.title}</h3>
      <p>{lead.partlyLive ? `${lead.done} of ${lead.total} done` : lead.headline}</p>
      <div className={styles.progressCard}>
        <div className={styles.track} role="progressbar" aria-label={`${lead.title} progress`} aria-valuemin={0} aria-valuemax={lead.total} aria-valuenow={lead.done}><span style={{ "--pct": `${lead.total ? Math.round((lead.done / lead.total) * 100) : 0}%` } as CSSProperties} /></div>
        {lead.lines.length ? <ol className={styles.steps} aria-label={`${lead.title} steps`}>{lead.lines.map((step, index) => {
          const state = stepState(step);
          const Icon = STEP_ICON[state];
          return <li key={`${step.label}-${index}`} data-state={state}><Icon size={14} strokeWidth={1.8} aria-hidden="true" /><span>{step.label}{step.detail && state !== "now" ? <small>{step.detail}</small> : null}</span><em>{state === "now" ? "now" : step.state}</em></li>;
        })}</ol> : <p className={styles.progressNote}>{lead.done} of {lead.total} done</p>}
      </div>
    </div> : leadRequest ? <div className={styles.lead}>
      <h3>{leadRequest.title}</h3>
      <p>{leadRequest.detail}</p>
    </div> : progressChecking ? <p role="status" className={styles.muted}>Checking your requests…</p> : <div className={styles.lead}>
      <h3>{readOnly ? "No shared requests are in progress." : "Nothing is in progress."}</h3>
      {readOnly ? null : <>
        <p>Ask Strelva above for something with an end, like a new page or an intake form.</p>
        <div className={styles.starters} aria-label="Try asking Strelva">{STARTERS.map(starter => <button key={starter.label} type="button" disabled={busy} onClick={() => request(starter.request)}>{starter.label}</button>)}</div>
      </>}
    </div>}
    {otherMaking.length || (!progressChecking && otherRequests.length) ? <ul className={styles.list} aria-label="Also in progress">
      {otherMaking.map(activation => <li key={activation.id}><span className={styles.row}><span><strong>{activation.partlyLive ? `${activation.title}: Partly live` : activation.headline}</strong><small>{activation.done} of {activation.total} done</small></span></span></li>)}
      {progressChecking ? null : otherRequests.map(row => requestRow(row))}
    </ul> : null}
    {lead && progressChecking ? <p role="status" className={styles.muted}>Checking your requests…</p> : null}
    {needsYouReleased ? <StrelvaHandledSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.receiptNotices} onUndo={needsYou.undo}
      fallback={receipts.length ? receiptList : handled.length && !systemsReleased ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : undefined} />
      : <section className={styles.handled} aria-labelledby="home-handled">
        <header className={styles.handledHeader}><h2 id="home-handled">{STRELVA_HANDLED_LABEL}</h2>{systemsReleased ? <span>This week</span> : null}</header>
        {systemsReleased ? (receipts.length ? receiptList : <p className={styles.muted}>Nothing this week. When something changes for you, it shows here with what changed and how to undo it.</p>)
          : progressChecking ? <p role="status" className={styles.muted}>Checking what finished…</p> : handled.length ? <ul className={styles.list}>{handled.map(row => requestRow(row))}</ul> : <p className={styles.muted}>Nothing finished yet. When Strelva or your agency finishes something, it appears here with what changed.</p>}
        {customer && sites.length ? <a className={styles.textAction} href={`${appBase}/workspace/recaps?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`}>Weekly and monthly recaps<ArrowRight size={16} aria-hidden="true" /></a> : null}
      </section>}
    <button type="button" className={styles.textAction} onClick={() => onNavigate("requests")}>All requests<ArrowRight size={16} aria-hidden="true" /></button>
  </section>;

  // ---- Your side (linen): the owner's decisions, the rule behind them, and the site's week.
  const policy = needsYouReleased && !agencySeat ? <p className={styles.policy}><ShieldCheck size={15} aria-hidden="true" />Strelva asks you before anything goes live, quotes a price, or books your time.<button type="button" onClick={() => onNavigate("settings")}>Who decides</button></p> : null;
  const needsYouEmpty = <p className={styles.sideTitle}>Nothing needs you right now.</p>;
  const decisions = agencySeat && needsYouReleased ? <AgencyClientDecisionStatus state={sharedHome.state} businessName={name} workspaceId={snapshot.workspaceId} selectedId={selectedDecisionId} onRetry={sharedHome.refresh} /> : needsYouReleased
    ? <NeedsYouSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.notices} onDecide={needsYou.decide} onRetry={needsYou.refresh} appBase={appBase}
      extraCount={home.attention.length} extra={home.attention.length ? attentionRows : null} empty={needsYouEmpty} />
    : <section className={styles.section} aria-labelledby="home-attention">
      <header className={styles.sideHeader}>
        <h2 id="home-attention" className={styles.eyebrow} data-tone="clay"><span className={styles.dot} aria-hidden="true" />Needs you{!busy && !deliveryPending && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}</h2>
        {!busy && !deliveryPending ? <p className={styles.sideTitle}>{attentionCount ? `${decisionCount(attentionCount)} waiting on you.` : "Nothing needs a decision right now."}</p> : null}
      </header>
      {busy || deliveryPending ? <p role="status" className={styles.muted}>Checking your work…</p> : attentionCount ? <ul className={styles.decisions}>
        {deliveryAttention.map(item => <li key={`delivery-${item.id}`}><a className={styles.row} href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} aria-hidden="true" /></a></li>)}
        {attentionRows}
      </ul> : null}
      {deliveryUnavailable ? <p role="status" className={styles.notice}>{systemsReleased ? "Requests waiting on your decision could not be checked." : "Delivery decisions could not be checked."} <button type="button" onClick={refreshDeliveries}>Check again</button></p> : null}
    </section>;
  const yourSide = <div className={`${styles.yourSide} ${styles.reveal}`} style={{ "--i": 2 } as CSSProperties} aria-label="Your side">
    {decisions}
    {policy}
    {agencySeat ? <StNotice>Website results and customer details are not shared with this agency access. Shared System health appears above.</StNotice> : <SiteSummarySection state={siteSummary.state} workspaceId={snapshot.workspaceId} appBase={appBase} onRetry={siteSummary.retry} />}
  </div>;

  const composer = <WorkspaceComposer key={`${snapshot.actor.email}:${snapshot.workspaceId}`} tone="glass" draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} onTemplates={() => onNavigate("products")} placeholder={customer ? "Ask Strelva for anything your business needs" : "Ask Strelva for anything you need"} systemsReleased={systemsReleased} />;
  const chips = liveChips(siteSummary.state, systems, sites, systemsReleased);
  const systemsLine = business && systems.length ? [live ? `${live} live` : "", drafts ? `${drafts} in draft` : "", paused ? `${paused} paused` : ""].filter(Boolean).join(" · ") : "";

  const gettingStartedHref = ownerGettingStartedHref(snapshot, appBase);
  const gettingStartedAction = gettingStartedHref ? <StNotice><StTextButton href={gettingStartedHref}>Getting started</StTextButton> · Read your website or add business details. Nothing has to move.</StNotice> : null;
  const homePage = <div className={styles.home} aria-busy={busy || undefined}>
    {gettingStartedAction}
    <section className={`${styles.dusk} ${styles.reveal}`} aria-labelledby="business-start-title">
      <div className={styles.duskMain}>
        <p className={styles.duskLine}>{readOnly ? systemsReleased ? "Shared with you" : "Shared workspace" : line}{(readOnly || line) ? " · " : ""}{name}</p>
        <h1 id="business-start-title" className="font-display">{agencySeat ? name : readOnly ? "Review what was shared." : greeting}</h1>
        {readOnly ? <p className={styles.duskNote}>{agencySeat ? `Your agency has access to ${name}. Review its Systems, Requests and decision status within the shared scope.` : `${name} shared this with your agency to review.`}</p> : composer}
      </div>
      {chips.length || systemsLine ? <ul className={styles.chips} aria-label="Right now">
        {chips.map(chip => <li key={chip.id} data-tone={chip.tone}><span className={styles.dot} aria-hidden="true" />{chip.text}</li>)}
        {systemsLine && !chips.some(chip => chip.id === "live") ? <li data-tone="quiet"><span className={styles.dot} aria-hidden="true" />{systemsLine}</li> : null}
      </ul> : null}
    </section>

    {managedWorkUnavailable ? <p role="status" className={styles.notice}>Some websites could not be loaded. <a href={accountHref}>Check website access</a></p> : null}

    {outcomes ? <LoopRibbon {...outcomes.loop} className={styles.outcome} /> : null}
    {customer ? <div className={styles.sides}>{working}{yourSide}</div> : <div className={styles.single}>
      {decisions}
      {showRequests ? working : null}
    </div>}

    {business || systems.length ? <section className={styles.section} aria-labelledby="home-systems">
      <header className={styles.sectionHeader}><h2 id="home-systems"><LayoutGrid size={18} aria-hidden="true" />{SYSTEMS_LABEL}</h2>{systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{SYSTEMS_LIST_LABEL}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
      {busy || systemsLoading ? <p role="status" className={styles.muted}>Loading your systems…</p> : systemsUnavailable ? <p role="status" className={styles.notice}>Your systems could not be loaded just now. Nothing about them has changed.</p> : systems.length ? <SystemList systems={systems} href={openSystemHref} onOpen={onOpenSystem} label={`${name} ${SYSTEMS_LABEL.toLowerCase()}`} /> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : "Nothing is running yet."}</h3><p>{readOnly ? "Systems the owner shares will appear here." : "Your website, inquiries, bookings and the tools your team uses will appear here once Strelva builds them. Tell Strelva what you need above."}</p></div></div>}
      {connectSiteHref && !busy && !systemsLoading ? <p className={styles.muted} data-home-connect-site>{snapshot.releases?.websiteRebuild === true
        ? <>Your next website: <a className="underline underline-offset-4" href={connectSiteHref}>Open website options</a>.</>
        : systems.some(item => item.kind === "website")
        ? <>Have another website? <a className="underline underline-offset-4" href={connectSiteHref}>Connect it</a>. It stays where it is.</>
        : <>Already have a website? <a className="underline underline-offset-4" href={connectSiteHref}>Bring it into Strelva</a>. It stays where it is; Strelva takes its inquiries.</>}</p> : null}
    </section> : null}

    {!business || results.length || !systems.length ? <section className={styles.section} aria-labelledby="home-recent">
      <header className={styles.sectionHeader}><h2 id="home-recent">{systemsReleased ? "Files and results" : "Recent"}</h2>{!business || !systems.length ? <Button variant="ghost" size="sm" onClick={() => onNavigate("apps")}>{systemsReleased ? SYSTEMS_LIST_LABEL : "Files and results"}{savedResultCount ? ` (${savedResultCount})` : ""}<ArrowRight size={16} aria-hidden="true" /></Button> : null}</header>
      {busy ? <p role="status" className={styles.muted}>Loading saved work…</p> : results.length ? <ul className={styles.list}>
        {results.slice(0, 6).map(work => <li key={work.id}><button type="button" aria-label={`Open ${work.title}`} className={styles.row} onClick={() => onOpen(work.id)}>{work.productId === "applications" ? <LayoutGrid size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}<span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}
      </ul> : <div className={styles.empty}><LayoutGrid size={24} aria-hidden="true" /><div><h3>{readOnly ? "Nothing has been shared here yet." : systemsReleased ? "No saved files yet." : "No saved result yet."}</h3><p>{readOnly ? "Shared work will appear here." : systemsReleased ? "Checks, reports and plans Strelva makes for you are kept here." : "Describe the outcome above. Strelva will show you what it can create or handle."}</p></div>{!readOnly && !business ? <Button variant="secondary" onClick={() => onNavigate("products")}><Plus size={16} aria-hidden="true" />{systemsReleased ? "Get or build something" : "Get or build an app"}</Button> : null}</div>}
      {!readOnly && onCreateWebsite ? <button type="button" className={styles.textAction} disabled={busy} onClick={onCreateWebsite}>Prefer to build a website yourself? Start a private draft.<ArrowRight size={16} aria-hidden="true" /></button> : null}
      {!business ? <p className={styles.contextLine} aria-label="Current Strelva context"><span>Working in <strong>{name}</strong></span>{savedResultCount ? <span>{savedResultCount} saved {savedResultCount === 1 ? "result" : "results"}</span> : null}{sites.length ? <span>{sites.length} connected {sites.length === 1 ? "website" : "websites"}</span> : null}</p> : null}
    </section> : null}

    {unassignedSites.length ? <details className={styles.details} aria-label="Websites available to your account"><summary>Websites available to your account <span>{unassignedSites.length}</span></summary><p className={styles.muted}>{current?.kind !== "customer" ? "These websites are available through your account. Assign them from the appropriate client business." : siteAssignmentsKnown ? "These websites are not yet assigned to this business." : "Business assignments could not be confirmed."}</p>{current?.kind !== "customer" ? <ul className={styles.list}>{unassignedSites.map(site => <li key={site.id}><a className={styles.row} href={site.href}><span><strong>{site.title}</strong><small>Account-authorized website</small></span><ArrowRight size={16} /></a></li>)}</ul> : <WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} />}</details> : null}

    <details className={styles.details} aria-label="Usage and connected services"><summary>Usage and connected services</summary><div className={styles.connections}>{customer && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={() => onNavigate("settings")} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} systemsReleased={systemsReleased} /></div></details>
  </div>;

  const paperReceipts = agencySeat ? <AgencyClientChanges state={sharedHome.state} workspaceId={snapshot.workspaceId} onRetry={sharedHome.refresh} /> : <StrelvaHandledSection state={needsYou.state} pending={needsYou.pending} notices={needsYou.receiptNotices} onUndo={needsYou.undo}
    fallback={receipts.length ? receiptList : undefined} />;
  const paperHome = <div className={styles.paperScroll} aria-busy={busy || undefined}>
    <StPage>
      <StHead title={showHandled ? STRELVA_HANDLED_LABEL : name} titleId="business-start-title"
        meta={showHandled ? "Last 7 days · what changed and who did it" : agencySeat ? `${name} · Agency access · shared workspace` : readOnly ? `${name} shared this with your agency to review.` : [decisionsWaiting === null ? "" : `${decisionsWaiting} need you`, live ? `${live} live` : "", drafts ? `${drafts} in draft` : "", paused ? `${paused} paused` : ""].filter(Boolean).join(" · ")}
        crumb={showHandled ? { label: "Home", onClick: () => setHandledWorkspaceId(null) } : undefined} />
      {gettingStartedAction}
      {agencySeat && readLocation.deliveryCheck ? <AgencyClientDeliveryCheck state={sharedHome.state} selectedKey={readLocation.deliveryCheck} workspaceId={snapshot.workspaceId} onRetry={sharedHome.refresh} /> : null}
      {showHandled ? paperReceipts : <>
        {decisions}
        {customer && !readOnly ? <BusinessArrivals key={snapshot.workspaceId} workspaceId={snapshot.workspaceId} appBase={appBase} /> : null}
        <StSection title={SYSTEMS_LABEL} id="home-systems" meta="Not working first" action={systems.length ? <StTextButton onClick={() => onNavigate("apps")}>{SYSTEMS_LIST_LABEL}</StTextButton> : undefined}>
          {busy || systemsLoading ? <StSkeleton label="Loading your systems" /> : systemsUnavailable ? <StNotice tone="critical">Your systems could not be loaded just now. Nothing about them has changed.</StNotice> : systems.length ? <StRows label={`${name} systems`}>
            {[...systems].sort((a, b) => ownerSystemRank(a) - ownerSystemRank(b) || a.name.localeCompare(b.name)).map(system => <StRow key={system.id} title={system.name} detail={system.detail}
              href={openSystemHref(system.id)} onClick={onOpenSystem ? () => onOpenSystem(system.id) : undefined}
              lead={<StBeacon kind={system.health.state === "blocked" || system.health.state === "degraded" ? "down" : system.lifecycle === "live" ? "live" : "draft"} />}
              end={<span className={styles.systemStates}><StState kind={system.lifecycle === "live" ? "live" : "draft"}>{LIFECYCLE_LABEL[system.lifecycle]}</StState><span>{HEALTH_LABEL[system.health.state]}</span>{system.health.lastVerifiedAt ? <StMono>Checked {new Date(system.health.lastVerifiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</StMono> : null}</span>} />)}
          </StRows> : <StEmpty><strong>{readOnly ? "Nothing has been shared here yet." : "Nothing is running yet."}</strong>{readOnly ? "Systems the owner shares will appear here." : "Your website, inquiries, bookings and the tools your team uses appear here once they're made. Ask for what you need below, or bring in an agency from Help."}</StEmpty>}
          {connectSiteHref && !busy && !systemsLoading ? <p className={styles.paperNote} data-home-connect-site>{snapshot.releases?.websiteRebuild === true ? <>Your next website: <a href={connectSiteHref}>Open website options</a>.</> : systems.some(item => item.kind === "website") ? <>Have another website? <a href={connectSiteHref}>Connect it</a>. It stays where it is.</> : <>Already have a website? <a href={connectSiteHref}>Bring it into Strelva</a>. It stays where it is; Strelva takes its inquiries.</>}</p> : null}
        </StSection>
        <div className={styles.paperLower}>
          <div>{needsYouReleased ? <><div className={styles.receiptAction}><StTextButton onClick={() => setHandledWorkspaceId(snapshot.workspaceId)}>All receipts</StTextButton></div>{paperReceipts}</> : <StSection title={STRELVA_HANDLED_LABEL} meta="Last 7 days" id="home-handled">{receipts.length ? receiptList : <StEmpty>Nothing this week. When something changes for you, it shows here with what changed and how to undo it.</StEmpty>}</StSection>}</div>
          <div className={styles.paperSecondary}>
            <StSection title="In progress" action={<StTextButton onClick={() => onNavigate("requests")}>All requests</StTextButton>}>
              {making.length || inProgress.length ? <StRows>{making.map(activation => <StRow key={activation.id} title={activation.partlyLive ? `${activation.title}: Partly live` : activation.headline} detail={`${activation.done} of ${activation.total} done`}>
                {activation.lines.length ? <StSteps label={`${activation.title} steps`} steps={activation.lines.map(line => ({ title: line.label, detail: line.detail, state: stepState(line) === "done" ? "done" : stepState(line) === "now" ? "active" : stepState(line) === "attention" ? "failed" : "pending" }))} /> : null}
              </StRow>)}{inProgress.slice(0, 5).map(row => <StRow key={row.id} title={row.title} detail={row.detail} href={row.href} onClick={!row.href && row.workId ? () => onOpen(row.workId!) : undefined} />)}</StRows> : progressChecking ? <StSkeleton label="Checking your requests" /> : deliveryUnavailable ? null : <StEmpty>Nothing is in progress.</StEmpty>}
              {deliveryUnavailable ? <StNotice>Requests could not be checked. <StTextButton onClick={refreshDeliveries}>Check again</StTextButton></StNotice> : null}
            </StSection>
            <StSection title="Files and results" action={<StTextButton onClick={() => onNavigate("work")}>{SYSTEMS_LIST_LABEL}</StTextButton>}>
              {busy ? <StSkeleton label="Loading saved files" /> : results.length ? <StRows>{results.slice(0, 6).map(work => <StRow key={work.id} title={work.title} detail={workspaceWorkLabel(work)} onClick={() => onOpen(work.id)} />)}</StRows> : <StEmpty>No saved files yet. Checks, reports and plans Strelva makes for you are kept here.</StEmpty>}
            </StSection>
          </div>
        </div>
        {managedWorkUnavailable ? <StNotice>Some websites could not be loaded. <a href={accountHref}>Check website access</a></StNotice> : null}
        {policy}
        {outcomes ? <LoopRibbon {...outcomes.loop} /> : null}
        <details className={styles.paperDetails}><summary>Website results and connected services</summary>{agencySeat ? <StNotice>Website results and customer details are not shared with this agency access. Shared System health appears above.</StNotice> : <SiteSummarySection state={siteSummary.state} workspaceId={snapshot.workspaceId} appBase={appBase} onRetry={siteSummary.retry} />}{customer && !readOnly ? <WorkspaceAllowanceSummary businessId={snapshot.workspaceId} enabled compact onOpenSettings={() => onNavigate("settings")} /> : null}<BusinessOfferingSummary state={offerings} work={snapshot.work} onOpen={onOfferings} systemsReleased={systemsReleased} />{!readOnly && onCreateWebsite ? <StTextButton onClick={onCreateWebsite} disabled={busy}>Start a private website draft</StTextButton> : null}</details>
        {unassignedSites.length ? <details className={styles.paperDetails}><summary>Websites available to your account</summary><WebsiteAssignmentHandoff businessName={name} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings} sites={unassignedSites} onRetry={onRetryWebsiteAssignments} onCommand={onWebsiteCommand} /></details> : null}
      </>}
    </StPage>
    {!readOnly ? <StComposerDock><WorkspaceComposer tone="dock" scope={name} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })} disabled={busy} onSubmit={request} onEdited={onDraftChange} placeholder="Ask Strelva to change or make something" systemsReleased={systemsReleased} /></StComposerDock> : null}
  </div>;

  // ---- The Needs you place: one card per decision, shaped for it.
  const deckCards = home.attention.map(({ work, reason }) => <StRow key={work.id} kind={workspaceWorkLabel(work)} title={work.title} detail={reason} end={<StTextButton onClick={() => onOpen(work.id)} aria-label={`Open ${work.title}`}>Open</StTextButton>} />);
  const needsYouPage = agencySeat ? <div className={styles.paperScroll}><StPage><StHead title={`Waiting on ${name}`} meta="Shared decision status · the business decides" />{decisions}</StPage></div> : <div className={styles.paperScroll} aria-busy={busy || undefined}><StPage>
    <StHead title="Needs you" titleRef={needsYouHeading} meta={selectedDecisionId ? `Review this decision for ${name}.` : decisionsWaiting === null ? `Decisions only you can make for ${name}.` : decisionsWaiting ? `${decisionCount(decisionsWaiting)} only you can make.` : "Nothing is waiting on you."} />
    <NeedsYouSection retryFocusTarget={needsYouHeading} variant="deck" selectedId={selectedDecisionId} state={selectedDecisionId && needsYou.state.status === "ready" ? { ...needsYou.state, items: needsYou.state.items.filter(item => item.id === selectedDecisionId) } : needsYou.state} pending={needsYou.pending} notices={needsYou.notices} onDecide={needsYou.decide} onRetry={needsYou.refresh} appBase={appBase}
      extraCount={selectedDecisionId ? 0 : home.attention.length} extra={!selectedDecisionId && home.attention.length ? deckCards : null}
      empty={selectedDecisionId ? <StEmpty>This decision is no longer waiting or is unavailable in this business.</StEmpty> : <StEmpty action={<StTextButton onClick={() => onNavigate("home")}>Back to Home</StTextButton>}><strong>Nothing needs you.</strong>When Strelva needs your yes, it shows here first, with what happens either way.</StEmpty>} />
    {policy}
  </StPage></div>;

  // ---- XA · O1–O4: Today and the yes, for the business's own people. An
  // agency seat inside a client keeps its shared-status view (agency lane).
  const xaOwner = business && !agencySeat;
  const reviewDecision = (id: string) => {
    setReviewed({ workspaceId: snapshot.workspaceId, id });
    setHandledWorkspaceId(null);
    onNavigate("needs-you");
    try { navigateWorkspace({ view: "needs-you", workspaceId: snapshot.workspaceId, decision: id }, "replace"); } catch { /* The session state above still opens it. */ }
  };
  const accountDisplayName = snapshot.actor.displayName?.trim() || null;
  const xaToday = <OwnerToday businessName={name} ownerName={greetingName(accountDisplayName)} minute={minute} needs={needsYou.state} notices={needsYou.notices} systems={systems} systemsLoading={busy || systemsLoading} systemsUnavailable={systemsUnavailable}
    readOnly={readOnly} readOnlyNote={`${name} shared this with your agency to review.`} busy={busy} draftKey={requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId })}
    onAsk={request} onDraftChange={onDraftChange} onReview={item => reviewDecision(item.id)} onAllWaiting={() => { setReviewed(null); onNavigate("needs-you"); }} onRetry={needsYou.refresh}
    onWhatChanged={() => setHandledWorkspaceId(snapshot.workspaceId)} systemHref={openSystemHref} onOpenSystem={onOpenSystem} gettingStartedHref={gettingStartedHref}
    attention={home.attention.map(({ work, reason }) => ({ id: work.id, title: work.title, reason, onOpen: () => onOpen(work.id) }))}
    making={making.map(activation => ({ id: activation.id, title: activation.title, headline: activation.headline, partlyLive: activation.partlyLive, done: activation.done, total: activation.total,
      lines: activation.lines.flatMap(line => { const state = stepState(line); return state === "next" ? [] : [{ label: line.detail && state !== "now" ? `${line.label}. ${line.detail}` : line.label, state: state === "done" ? "done" as const : state === "now" ? "active" as const : "failed" as const }]; }) }))}
    receipts={receipts.map(receipt => ({ at: receipt.at, sentence: `${receipt.sentence.replace(/[.!?]$/, "")}. ${receipt.undo}` }))}
    onRequests={() => onNavigate("requests")} onRunning={() => onNavigate("ongoing")} onBringAgency={() => onNavigate("help")}
    connectSite={connectSiteHref ? { href: connectSiteHref, words: snapshot.releases?.websiteRebuild === true ? "rebuild" : systems.some(item => item.kind === "website") ? "another" : "first" } : null} />;
  const xaDecision = <OwnerDecisionView businessName={name} needs={needsYou.state} pending={needsYou.pending} notices={needsYou.notices} selectedId={decisionId} systems={systems} appBase={appBase}
    onDecide={needsYou.decide} onUndo={needsYou.undo} onRetry={needsYou.refresh} onToday={() => { setReviewed(null); onNavigate("home"); }}
    onWhatChanged={() => { setReviewed(null); setHandledWorkspaceId(snapshot.workspaceId); onNavigate("home"); }} onOpenDecision={reviewDecision}
    onAsk={readOnly ? undefined : request} />;
  const page = view === "needs-you" && needsYouReleased ? xaOwner ? xaDecision : needsYouPage
    : business ? xaOwner && !showHandled ? xaToday : paperHome : homePage;

  return <StrelvaShell connectionsAvailable={current?.kind === "customer" || current?.kind === "agency"} workspaceName={agencyWorkspace ? `${navigationBrand?.agencyId ? navigationBrand.name : agencyWorkspace.name} / ${name}` : name} ownerBrand={navigationBrand} brandWorkspaceId={agencyWorkspace?.id} allClients={agencyWorkspace ? { href: `${appBase}/workspace?workspaceId=${agencyWorkspace.id}&agencyView=clients` } : undefined} agencyNavigation={agencyWorkspace && systemsReleased ? { leadsAvailable: false, agencyWorkspaceId: agencyWorkspace.id, clients: agencyClientLinks(snapshot, appBase, onWorkspace) } : undefined} active={view === "needs-you" ? "needs-you" : "home"} title={view === "needs-you" ? agencySeat ? `Waiting on ${name}` : "Needs you" : xaOwner && !showHandled ? "Today" : name} appBase={appBase} workspaceId={snapshot.workspaceId} accountName={snapshot.actor.displayName?.trim() || snapshot.actor.email.split("@")[0] || "Your account"} accountDetail={snapshot.actor.email} signOut={signOut} onNavigate={place => { setHandledWorkspaceId(null); onNavigate(place); }} onStart={onStart} startDisabled={readOnly || busy} searchItems={searchItems} searchScopeName={name} recentWork={recentWork} pinned={systemsReleased ? pinnedSystems(systems, openSystemHref, onOpenSystem) : [...pinnedWebsites(sites), ...pinnedApps(snapshot.work, workHref, onOpen)]} systemsReleased={systemsReleased} notice={notice} contentId="business-home-main"
    navigation={gettingStartedHref ? <StTextButton href={gettingStartedHref}>Getting started</StTextButton> : undefined}
    needsYou={needsYouReleased ? { count: decisionsWaiting, label: agencySeat ? `Waiting on ${name}` : undefined } : undefined}
    businessContext={business ? <WorkspaceBusinessSwitcher snapshot={snapshot} systems={systems} onSystem={onOpenSystem} busy={busy} onWorkspace={onWorkspace} onNavigate={onNavigate} /> : <label><span className={styles.srOnly}>Current workspace</span><select aria-label="Current workspace" value={snapshot.workspaceId} disabled={busy} onChange={event => onWorkspace(event.target.value)}>{snapshot.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}>
    {page}
    {business ? <OwnerPhoneNavigation active={view === "needs-you" ? "needs-you" : "home"} onNavigate={place => { setHandledWorkspaceId(null); onNavigate(place); }} askReleased={snapshot.releases?.ask === true} /> : null}
  </StrelvaShell>;
}
