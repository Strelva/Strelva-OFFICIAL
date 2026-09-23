"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileSearch, Globe2, MessageSquareText, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter, InquirySurfaceSnapshot, InquiryView } from "@/experience/inquiries/contracts";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { discoveryProducts, sameAppHref, type ManagedWorkSummary } from "./workspace-discovery";
import { WorkspaceTemplateLibrary } from "./WorkspaceTemplateLibrary";
import { WorkspaceIntent, retainRequestIntent } from "./WorkspaceIntent";
import { readRequestDraft, requestDraftKey, writeRequestDraft } from "./request-draft";
import { WorkspaceHelp } from "./WorkspaceHelp";
import { WorkspaceStart } from "./WorkspaceStart";
import { BusinessHome } from "./BusinessHome";
import { AgencyHome } from "./AgencyHome";
import { WorkspaceBusinessSettings } from "./WorkspaceBusinessSettings";
import { WebsiteAssignmentHandoff } from "./WorkspaceOfferings";
import { workspaceWorkLabel } from "./work-label";
import { workspaceExitBlocksChanges, workspaceExitIsStopped } from "./workspace-exit-ui";
import {
  WorkspaceOfferingDirectory,
  boundManagedWebsiteIds,
  useWorkspaceOfferings,
} from "./WorkspaceOfferings";
import type { WorkspaceStartContext, WorkspaceStartContinuation, WorkspaceStartTemplate, WorkspaceStartWebsiteHandoff } from "./workspace-start";
import styles from "./workspace-surface.module.css";

export interface WorkspaceInquiryTarget {
  tenantId: string;
  adapter?: InquirySurfaceAdapter;
  initialSnapshot?: InquirySurfaceSnapshot;
  initialView?: InquiryView;
  initialRequestId?: string | null;
  initialInquiryId?: string | null;
  initialRequestText?: string | null;
}

interface Props {
  appBase?: string;
  signOut?: ReactNode;
  snapshot: WorkspaceSnapshot;
  managedWork?: readonly ManagedWorkSummary[];
  managedWorkUnavailable?: boolean;
  home: boolean;
  agency: boolean;
  busy: boolean;
  selectedWork: WorkspaceWork | null;
  workingTitle?: string;
  workingSection?: "work" | "ongoing";
  onHome: () => void;
  onNew: (context?: WorkspaceStartContinuation) => void;
  onPlan?: (request: string) => void;
  onOngoing: () => void;
  onAgency: () => void;
  onInquiry?: (tenantId: string, context?: WorkspaceStartContinuation) => void;
  onTracker?: (context?: WorkspaceStartContinuation) => void;
  onWebsite?: (site: ManagedWorkSummary, context?: WorkspaceStartContinuation) => void | false;
  onDocument?: (context?: WorkspaceStartContinuation) => void;
  onHorizontal?: (productId: "websites" | "onboarding" | "applications" | "scheduling" | "investigations" | "operations", context?: WorkspaceStartContinuation) => void;
  trackerTemplates?: readonly WorkspaceStartTemplate[];
  inquiryBusinesses?: readonly { id: string; title: string }[];
  inquiry?: WorkspaceInquiryTarget;
  tracker?: ReactNode;
  plan?: ReactNode;
  document?: ReactNode;
  onCreatedApp?: (id: string) => void;
  onChoose: (id: string) => void;
  onWorkspace: (id: string) => void;
  onOpenClientWork: (workspaceId: string, workId: string) => void;
  notice: ReactNode;
  children?: ReactNode;
}

function initialSection(): StrelvaSection {
  if (typeof window === "undefined") return "home";
  const value = new URLSearchParams(window.location.search).get("view");
  if (value === "operations" || value === "ongoing") return "ongoing";
  if (value === "tracker" || value === "inquiries" || value === "document" || value === "plan") return "work";
  return value === "products" || value === "work" || value === "access" || value === "settings" || value === "help" ? value : "home";
}

function initialStartOpen(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === "start";
}

function initialOfferingId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("offering");
}

export function WorkspaceLayout({ appBase, signOut, snapshot, managedWork = [], managedWorkUnavailable, home, agency, busy, selectedWork, workingTitle, workingSection = "work", onHome, onNew, onPlan, onOngoing, onAgency, onInquiry, onTracker, onWebsite, onDocument, onHorizontal, trackerTemplates, inquiryBusinesses = [], inquiry, tracker, plan, document, onCreatedApp, onChoose, onWorkspace, onOpenClientWork, notice, children }: Props) {
  const [requestText, setRequestText] = useState("");
  const [requestRoute, setRequestRoute] = useState("start");
  const [requestCurrent, setRequestCurrent] = useState(false);
  const [startDraft, setStartDraft] = useState("");
  const [startSession, setStartSession] = useState(0);
  const draftKey = requestDraftKey({ actorEmail: snapshot.actor.email, workspaceId: snapshot.workspaceId });
  const [section, setSection] = useState<StrelvaSection>(initialSection);
  const [startOpen, setStartOpen] = useState(initialStartOpen);
  const [query, setQuery] = useState("");
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(initialOfferingId);
  const [helpRequest, setHelpRequest] = useState<string | undefined>();
  const [websiteHandoff, setWebsiteHandoff] = useState<WorkspaceStartWebsiteHandoff | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const productHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const restore = () => { setSection(initialSection()); setStartOpen(initialStartOpen()); if (initialStartOpen()) { try { setStartDraft(readRequestDraft(window.sessionStorage, draftKey)); } catch { /* Keep the current draft. */ } setStartSession(value => value + 1); } setProductId(null); setOfferingId(initialOfferingId()); setQuery(""); setHelpRequest(undefined); setWebsiteHandoff(null); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [draftKey]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    if (section === "products" && productId) productHeadingRef.current?.focus({ preventScroll: true });
  }, [offeringId, productId, section]);
  useEffect(() => {
    if (section !== "work" || typeof window === "undefined" || new URLSearchParams(window.location.search).get("search") !== "1") return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [section]);
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  const workspaceStopped = workspaceExitIsStopped(snapshot.workspaceExitState, snapshot.workspaceExitReadStatus);
  const workspaceExitUnavailable = snapshot.workspaceExitReadStatus === "unavailable";
  const workspaceExitBlocks = workspaceExitBlocksChanges(snapshot.workspaceExitState, snapshot.workspaceExitReadStatus);
  const canSaveServiceRequest = current?.kind === "customer"
    && current.access !== "delegated_read"
    && (current.role === "owner" || current.role === "admin");
  const serviceRequestProviders = canSaveServiceRequest ? [
    { label: "Strelva", provider: { kind: "strelva" as const } },
    ...snapshot.workspaces
      .filter((workspace) => workspace.kind === "agency" && workspace.access !== "delegated_read")
      .map((workspace) => ({ label: workspace.name, provider: { kind: "agency" as const, agencyWorkspaceId: workspace.id } })),
  ] : undefined;
  const readOnly = current?.access === "delegated_read";
  const workspaceMutationReadOnly = readOnly || workspaceExitBlocks;
  const offeringUnavailableReason = current?.kind !== "customer"
    ? "Choose a customer business workspace to view its installations. Personal and agency workspaces remain separate."
    : readOnly
      ? "This work-share does not include business-wide offering access. The customer can add direct business membership when that access is appropriate."
      : workspaceExitBlocks
        ? "This workspace has stopped. Existing offerings remain available to review."
      : "Offering access is unavailable in this workspace.";
  const offerings = useWorkspaceOfferings({
    businessId: snapshot.workspaceId,
    enabled: current?.kind === "customer" && !workspaceMutationReadOnly,
    unavailableReason: offeringUnavailableReason,
  });
  const products = discoveryProducts(snapshot.products);
  const product = products.find(item => item.id === productId);
  const normalized = query.trim().toLowerCase();
  const visibleWork = snapshot.work.filter(work => [work.title, work.assessment?.subject.name, work.assessment?.subject.url, work.assessment?.method.label].some(value => value?.toLowerCase().includes(normalized)));
  const sites = managedWork.flatMap(site => { const href = sameAppHref(site.href); return href ? [{ ...site, href }] : []; });
  const boundWebsiteIds = boundManagedWebsiteIds(offerings.state);
  const siteAssignmentsKnown = current?.kind !== "customer" || (!managedWorkUnavailable && offerings.state.status === "ready");
  const siteAssignmentState = managedWorkUnavailable || offerings.state.status === "error" || offerings.state.status === "unavailable"
    ? "unavailable" as const
    : offerings.state.status === "loading"
      ? "loading" as const
      : "known" as const;
  const assignedSites = sites.filter((site) => boundWebsiteIds.has(site.id));
  const unassignedSites = sites.filter((site) => !boundWebsiteIds.has(site.id));
  const visibleSites = assignedSites.filter(site => site.title.toLowerCase().includes(normalized));
  const visibleUnassignedSites = unassignedSites.filter(site => site.title.toLowerCase().includes(normalized));
  const person = snapshot.actor.email.split("@")[0] || "Your account";
  const sourcePlan = selectedWork && (selectedWork.productId === "documents" || selectedWork.productId === "tracker" || selectedWork.productId === "applications") && selectedWork.sourceWorkId
    ? snapshot.work.find((work) => work.id === selectedWork.sourceWorkId && work.productId === "work_plans" && work.resourceKind === "plan")
    : undefined;
  const sourcePlanHref = sourcePlan
    ? `${appBase ? `${appBase.replace(/\/$/, "")}/workspace` : "/workspace"}?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=plan&work=${encodeURIComponent(sourcePlan.id)}`
    : undefined;

  function workMethod(work: WorkspaceWork): string {
    return workspaceWorkLabel(work);
  }

  function clearEmbeddedParams(url: URL) {
    url.searchParams.delete("standingId");
    url.searchParams.delete("assignmentId");
    url.searchParams.delete("tenantId");
    url.searchParams.delete("inquiryView");
    url.searchParams.delete("inquiryRequest");
    url.searchParams.delete("inquiryRecord");
    url.searchParams.delete("trackerWork");
    url.searchParams.delete("row");
    url.searchParams.delete("search");
    url.searchParams.delete("offering");
    url.searchParams.delete("template");
  }

  function workspaceIdForNavigation(): string {
    return new URLSearchParams(window.location.search).get("workspaceId") || snapshot.workspaceId;
  }

  function openSearch() {
    navigate("work", undefined, true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function navigate(next: StrelvaSection, prefillHelp?: string, focusSearch = false) {
    setStartOpen(false); setSection(next); setProductId(null); setOfferingId(null); setQuery(""); setHelpRequest(next === "help" ? prefillHelp : undefined); setWebsiteHandoff(null);
    if (next === "ongoing") onOngoing(); else onHome();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    if (next === "home") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    if (focusSearch && next === "work") url.searchParams.set("search", "1"); else url.searchParams.delete("search");
    url.searchParams.delete("work");
    url.searchParams.delete("offering");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function openWork(id: string) {
    setStartOpen(false);
    onChoose(id);
    const selected = snapshot.work.find((work) => work.id === id);
    const url = new URL(window.location.href); url.searchParams.set("work", id); url.searchParams.set("workspaceId", workspaceIdForNavigation());
    clearEmbeddedParams(url);
    url.searchParams.set("view", selected?.productId === "operations" ? "ongoing" : selected?.productId === "tracker" ? "tracker" : selected?.productId === "documents" ? "document" : selected?.productId === "work_plans" ? "plan" : "work");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openInquiry(tenantId: string, context?: WorkspaceStartContinuation) {
    setStartOpen(false);
    onInquiry?.(tenantId, context);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "inquiries");
    url.searchParams.set("tenantId", tenantId);
    url.searchParams.delete("work");
    url.searchParams.delete("inquiryView");
    url.searchParams.delete("inquiryRequest");
    url.searchParams.delete("inquiryRecord");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openAccess() {
    setStartOpen(false);
    setSection("access");
    setProductId(null);
    setOfferingId(null);
    setQuery("");
    setHelpRequest(undefined);
    setWebsiteHandoff(null);
    onAgency();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    url.searchParams.set("view", "access");
    url.searchParams.delete("work");
    url.searchParams.delete("offering");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function rememberRequest(request: string, route = "start") {
    setRequestCurrent(true);
    setRequestText(request);
    setRequestRoute(route);
    try { retainRequestIntent(window.sessionStorage, draftKey, request, route); } catch { /* In-memory request remains available. */ }
    try { writeRequestDraft(window.sessionStorage, draftKey, request); } catch { /* In-memory request remains usable. */ }
  }

  function openRequest(request: string) {
    if (workspaceMutationReadOnly) return;
    rememberRequest(request);
    openStart(request);
  }

  function openStart(request?: string) {
    if (workspaceMutationReadOnly) return;
    let seed = typeof request === "string" ? request : requestText;
    if (typeof request !== "string") {
      try { seed = readRequestDraft(window.sessionStorage, draftKey) || requestText; } catch { /* Keep the in-memory draft. */ }
    }
    setStartDraft(seed);
    setStartSession(value => value + 1);
    setStartOpen(true);
    setSection("home");
    setProductId(null);
    setOfferingId(null);
    setQuery("");
    setHelpRequest(undefined);
    setWebsiteHandoff(null);
    onHome();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    url.searchParams.set("view", "start");
    url.searchParams.delete("work");
    url.searchParams.delete("offering");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openOffering(id?: string | null) {
    setStartOpen(false);
    setSection("products");
    setProductId(null);
    setOfferingId(id ?? null);
    setQuery("");
    setHelpRequest(undefined);
    setWebsiteHandoff(null);
    onHome();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    url.searchParams.set("view", "products");
    url.searchParams.delete("work");
    if (id) url.searchParams.set("offering", id); else url.searchParams.delete("offering");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function continueStart(continuation: WorkspaceStartContinuation) {
    if (workspaceMutationReadOnly) return;
    rememberRequest(continuation.request, continuation.route);
    if (continuation.route === "assessment") {
      setStartOpen(false);
      onNew(continuation);
      return;
    }
    if (continuation.route === "tracker") {
      if (!onTracker) return;
      setStartOpen(false);
      onTracker(continuation);
      return;
    }
    if (continuation.route === "document") {
      if (!onDocument) return;
      setStartOpen(false);
      onDocument(continuation);
      return;
    }
    if (continuation.route === "inquiries") {
      const business = inquiryBusinesses.find((item) => item.id === continuation.businessId);
      if (!business || !onInquiry) return;
      openInquiry(business.id, continuation);
      return;
    }
    if (continuation.route === "websites" || continuation.route === "onboarding" || continuation.route === "applications" || continuation.route === "scheduling" || continuation.route === "investigations" || continuation.route === "operations") {
      if (!onHorizontal) return; setStartOpen(false); onHorizontal(continuation.route, continuation); return;
    }
    if (continuation.route === "website") {
      const site = sites.find((item) => item.id === continuation.siteId);
      if (!site) return;
      if (onWebsite) {
        if (onWebsite(site, continuation) !== false) setStartOpen(false);
      } else setWebsiteHandoff({ site, request: continuation.request });
      return;
    }
  }

  const startContext: WorkspaceStartContext = {
    readOnly: workspaceMutationReadOnly,
    products,
    inquiryBusinesses,
    managedSites: sites,
    managedWorkUnavailable,
    trackerTemplates,
    native: {
      assessment: Boolean(onNew),
      tracker: Boolean(onTracker),
      inquiries: Boolean(onInquiry),
      website: Boolean(onWebsite || sites.length),
      document: Boolean(onDocument),
      websites: Boolean(onHorizontal), onboarding: Boolean(onHorizontal), applications: Boolean(onHorizontal), scheduling: Boolean(onHorizontal), investigations: Boolean(onHorizontal), operations: Boolean(onHorizontal),
      help: true,
    },
  };

  function workList(limit?: number, source = visibleWork) {
    const items = limit === undefined ? source : source.slice(0, limit);
    return <div className={styles.workList}>
      {visibleSites.map(site => <Link key={site.id} href={site.href} className={styles.workRow} prefetch={false}><Globe2 size={20} strokeWidth={1.5} /><span><strong>{site.title}</strong><small>Website installation · {site.relationship === "enterprise" ? "Enterprise service" : "Managed by Strelva"}</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>)}
      {items.map(work => <button key={work.id} type="button" className={styles.workRow} onClick={() => openWork(work.id)} aria-label={`Open ${work.title}`}><FileSearch size={20} strokeWidth={1.5} /><span><strong>{work.title}</strong><small>{workMethod(work)} · {new Date(work.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
    </div>;
  }

  const workspaceHref = `${appBase || ""}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`;
  const exportHref = `${appBase || ""}/workspace/export?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`;
  const stoppedBanner = workspaceExitBlocks ? <div role="status" aria-label={workspaceExitUnavailable ? "Workspace status unavailable" : "Workspace stopped"} className="mx-4 mt-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-[13px] sm:mx-7">
    <div className="min-w-0 max-w-2xl"><strong className="font-medium text-warm-black">{workspaceExitUnavailable ? "Workspace status is temporarily unavailable." : "Work in this workspace has stopped."}</strong><p className="mt-1 leading-relaxed text-gray-muted">Existing records remain available to review and export. New work and publishing stay disabled until the workspace status can be confirmed{workspaceExitUnavailable ? "." : " while retained items remain available for explicit review or recovery."}</p></div>
    <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-2"><Link className="font-medium text-warm-black underline-offset-2 hover:underline" href={workspaceHref + "&view=work"}>Review retained work</Link><Link className="font-medium text-warm-black underline-offset-2 hover:underline" href={exportHref}>Export retained records</Link></div>
  </div> : null;
  const stoppedHome = <div className={styles.page} aria-labelledby="workspace-stopped-title">
    <header className={styles.pageHeader}><p className={styles.eyebrow}>Workspace status</p><h1 id="workspace-stopped-title">{workspaceExitUnavailable ? "Workspace changes are paused." : "Work in this workspace has stopped."}</h1><p>{workspaceExitUnavailable ? "The workspace status could not be confirmed, so new work and publishing are paused. Saved work remains available to inspect." : "Saved work remains available to inspect. Open My work to review retained records or export a copy for your records."}</p></header>
    <div className="flex flex-wrap gap-3"><Link className={styles.primaryAction} href={workspaceHref + "&view=work"}>Review retained work<ArrowRight size={17} /></Link><Link className={styles.secondaryAction} href={exportHref}>Export retained records<ArrowRight size={17} /></Link></div>
  </div>;

  function startProduct(id: "websites" | "onboarding" | "applications" | "scheduling" | "investigations" | "operations") {
    if (workspaceMutationReadOnly || !onHorizontal || !products.some(item => item.id === id && item.availability === "available")) return;
    let request = requestText;
    try { request = readRequestDraft(window.sessionStorage, draftKey) || request; } catch { /* Use the current request. */ }
    if (request.trim()) {
      rememberRequest(request, id);
      onHorizontal(id, { route: id, productId: id, request, includedPartIds: ["scope", "control"] });
    } else onHorizontal(id);
  }

  function renderProductBody() {
    if (!product) return null;
    if (product.id === "websites" || product.id === "onboarding" || product.id === "applications" || product.id === "scheduling" || product.id === "investigations" || product.id === "operations") {
      const id = product.id;
      return <><h2>{product.name}</h2><p>{product.description}</p><button className={styles.primaryAction} type="button" disabled={workspaceMutationReadOnly || product.availability !== "available" || !onHorizontal} onClick={() => startProduct(id)}>Get started<ArrowRight size={17} /></button></>;
    }
    if (product.id === "ai_visibility") {
      return <><h2>Understand what AI can find.</h2><p>Check a business, inspect the evidence, and keep the assessment in your work. Share a copy when you want someone else to use it.</p><p>This is an assessment at a point in time. It does not activate monitoring or change your website.</p><button className={styles.primaryAction} type="button" disabled={workspaceMutationReadOnly || product.availability !== "available"} onClick={() => onNew()}>Check a business<ArrowRight size={17} /></button>{workspaceMutationReadOnly && <p>{workspaceExitUnavailable ? "Workspace status is temporarily unavailable, so new work is paused." : workspaceStopped ? "Work in this workspace has stopped." : "Switch to a workspace you own to create an assessment."}</p>}</>;
    }
    if (product.id === "inquiries") {
      return <><h2>Keep customer requests moving.</h2><p>Start with one request in a selected business scope. Review its shape, result, and receipt in one inspectable thread.</p>{inquiryBusinesses.length > 0 ? <div className={styles.productChoices}>{inquiryBusinesses.map((business) => <button key={business.id} type="button" className={styles.secondaryAction} disabled={workspaceMutationReadOnly} onClick={() => openInquiry(business.id)}><MessageSquareText size={17} />Open {business.title}<ArrowRight size={17} /></button>)}</div> : <p>No business scopes are available to this account yet.</p>}</>;
    }
    if (product.id === "tracker") {
      return <><h2>Turn a CSV into working data.</h2><p>Import a small CSV, review the proposed fields, and keep the resulting tracker in this workspace.</p><button className={styles.primaryAction} type="button" disabled={workspaceMutationReadOnly || product.availability !== "available" || !onTracker} onClick={() => onTracker?.()}>Start a tracker<ArrowRight size={17} /></button>{workspaceMutationReadOnly && <p>{workspaceExitUnavailable ? "Workspace status is temporarily unavailable, so new work is paused." : workspaceStopped ? "Work in this workspace has stopped." : "Switch to a workspace you own to create a tracker."}</p>}</>;
    }
    if (product.id === "documents") {
      return <><h2>Keep a useful document close.</h2><p>Write a procedure, proposal, or working note, review it before saving, and keep a history you can inspect or undo.</p><button className={styles.primaryAction} type="button" disabled={workspaceMutationReadOnly || product.availability !== "available" || !onDocument} onClick={() => onDocument?.()}>Start a document<ArrowRight size={17} /></button>{workspaceMutationReadOnly && <p>{workspaceExitUnavailable ? "Workspace status is temporarily unavailable, so new work is paused." : workspaceStopped ? "Work in this workspace has stopped." : "Switch to a workspace you own to create a document."}</p>}</>;
    }
    if (product.id === "managed_presence") {
      return <><h2>Your website, with the work around it.</h2><p>Open your website to work with its content, review changes, and see the connected information available for your business.</p>{sites.length ? workList(0) : <p>No managed website is connected to this account. You can ask Strelva about a build or an existing site.</p>}<button type="button" className={styles.secondaryAction} onClick={() => navigate("help")}>Talk about your website<ArrowRight size={17} /></button></>;
    }
    return <><h2>Try the search before you connect it.</h2><p>Home Finder is a brokerage-branded home search. This preview uses synthetic listings and never sends or stores buyer inquiries.</p>{product.previewHref ? <a className={styles.primaryAction} href={product.previewHref} target="_blank" rel="noreferrer">Try Home Finder<ArrowRight size={17} /></a> : <p>Its synthetic preview is not available from this environment yet.</p>}<p>A live installation needs brokerage approval, permitted listing data, and verified inquiry delivery.</p><button type="button" className={styles.secondaryAction} onClick={() => navigate("help", "I’d like early access to Home Finder. Please tell me what enabling a live brokerage installation would require.")}>Ask about early access<ArrowRight size={17} /></button></>;
  }

  if (home && !startOpen && section === "home" && current?.kind !== "agency" && !workspaceExitBlocks) return <WorkspaceIntent request={requestText} current={requestCurrent} route={requestRoute} draftKey={draftKey}><BusinessHome
    snapshot={snapshot} sites={assignedSites} unassignedSites={unassignedSites} siteAssignmentsKnown={siteAssignmentsKnown} offerings={offerings.state} busy={busy} notice={notice} managedWorkUnavailable={managedWorkUnavailable}
    appBase={appBase} accountHref={`${appBase || ""}/workspace/account`} signOut={signOut}
    onExplore={() => navigate("products")}
    onOpen={openWork} onStart={openStart}
    onCreateWebsite={onHorizontal && snapshot.products.some((entry) => entry.id === "websites" && entry.availability === "available") ? () => onHorizontal("websites") : undefined}
    onRequest={openRequest}
    onDraftChange={rememberRequest}
    onWorkspace={onWorkspace}
    onWork={() => navigate("work")} onOngoing={() => navigate("ongoing")} onAccess={openAccess} onSettings={() => navigate("settings")} onHelp={() => navigate("help")} onOfferings={openOffering}
    onWebsiteCommand={offerings.websiteCommand} onRetryWebsiteAssignments={offerings.reload}
  /></WorkspaceIntent>;

  const searchItems = [
    ...snapshot.work.map(work => ({ id: work.id, title: work.title, detail: workspaceWorkLabel(work), href: `${appBase || ""}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&work=${encodeURIComponent(work.id)}`, onOpen: () => openWork(work.id) })),
    ...assignedSites.map(site => ({ id: `site-${site.id}`, title: site.title, detail: "Managed website", href: site.href })),
  ];
  return <WorkspaceIntent request={requestText} current={requestCurrent} route={requestRoute} draftKey={draftKey}><StrelvaShell appBase={appBase} signOut={signOut}
    workspaceId={snapshot.workspaceId} searchItems={searchItems} searchScopeName={current?.name || "Your work"} recentWork={searchItems.filter(item => !item.id.startsWith("site-"))}
    active={agency ? "access" : home ? startOpen ? undefined : section : workingSection}
    title={!home ? inquiry ? "Inquiry work" : tracker !== undefined ? "Tracker" : plan !== undefined ? "Work plan" : document !== undefined ? "Document" : agency ? "People & access" : workingTitle || (selectedWork ? "Your work" : "New assessment") : startOpen ? "New" : section === "home" ? "Strelva" : section === "products" ? "Examples" : section === "settings" ? "Settings" : section === "ongoing" ? "Ongoing" : section === "help" ? "Help" : "Work"}
    accountName={person} accountDetail={snapshot.actor.email}
    onNavigate={navigate} onAccess={openAccess} onSearch={openSearch} onStart={openStart} startDisabled={workspaceMutationReadOnly} navigation={undefined}
    businessContext={<label><span className="sr-only">Current workspace</span><select value={snapshot.workspaceId} disabled={busy} onChange={event => { setStartOpen(false); setSection("home"); setProductId(null); setOfferingId(null); setQuery(""); onWorkspace(event.target.value); }}>{snapshot.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}{item.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}
    actions={!home ? inquiry ? <button type="button" onClick={() => navigate("work")}>My work</button> : tracker !== undefined || plan !== undefined || document !== undefined ? selectedWork ? <button type="button" onClick={onAgency}>Sharing & access</button> : <button type="button" onClick={() => navigate("work")}>My work</button> : <button type="button" aria-label={agency ? "Back to home" : "Sharing & access"} onClick={agency ? () => navigate("home") : onAgency}><span className="sm:hidden" aria-hidden="true">{agency ? "Back" : "Access"}</span><span className="hidden sm:inline" aria-hidden="true">{agency ? "Back to home" : "Sharing & access"}</span></button> : undefined}
    notice={notice} contentId="workspace-main"
  >
    {stoppedBanner}
    <div ref={scrollRef} className={styles.scroll} aria-busy={busy || undefined}>
      {!home ? <div className={styles.detail}><button type="button" className={styles.back} onClick={() => navigate(workingSection)}><ArrowLeft size={16} />Back to {workingSection === "ongoing" ? "ongoing" : "work"}</button>{sourcePlanHref ? <Link className={styles.textAction} href={sourcePlanHref}><FileSearch size={15} aria-hidden="true" />View plan and creation receipt<ArrowRight size={15} aria-hidden="true" /></Link> : null}{inquiry ? <InquiryServerWorkspaceExperience tenantId={inquiry.tenantId} adapter={inquiry.adapter} initialSnapshot={inquiry.initialSnapshot} initialView={inquiry.initialView} initialRequestId={inquiry.initialRequestId} initialInquiryId={inquiry.initialInquiryId} initialRequestText={inquiry.initialRequestText} basePath="/workspace" routePrefix="inquiry" /> : tracker !== undefined ? tracker : plan !== undefined ? plan : document !== undefined ? document : children}</div> : workspaceExitBlocks && section !== "work" ? stoppedHome : startOpen ? <WorkspaceStart key={`${snapshot.workspaceId}:${startSession}`} context={startContext} initialRequest={startDraft} draftKey={draftKey} onDraftChange={rememberRequest} onTemplates={() => navigate("products")} websiteHandoff={websiteHandoff} onWebsiteHandoffBack={() => setWebsiteHandoff(null)} onContinue={continueStart} onHelp={(request) => { rememberRequest(request, "help"); navigate("help", request); }} onPlan={onPlan ? request => { rememberRequest(request, "plan"); onPlan(request); } : undefined} /> : section === "home" && current?.kind === "agency" ? <AgencyHome snapshot={snapshot} busy={busy} onWorkspace={onWorkspace} onOpenWork={openWork} onOpenClientWork={onOpenClientWork} onStart={openStart} /> : section === "settings" ? <WorkspaceBusinessSettings workspace={current} sites={assignedSites} unassignedSites={unassignedSites} offerings={offerings.state} onWebsiteCommand={offerings.websiteCommand} onRetryWebsiteAssignments={offerings.reload} siteAssignmentState={siteAssignmentState} managedWorkUnavailable={managedWorkUnavailable} accountHref={`${appBase || ""}/workspace/account`} /> : section === "help" ? <WorkspaceHelp key={helpRequest} workspaceName={current?.name} workspaceId={canSaveServiceRequest ? snapshot.workspaceId : undefined} providerOptions={serviceRequestProviders} hasManagedService={assignedSites.length > 0} onAgency={onAgency} initialRequest={helpRequest} /> : section === "products" ? <div className={styles.page}>
        {offeringId ? <WorkspaceOfferingDirectory state={offerings.state} businessName={current?.name || "This business"} work={snapshot.work} managedSites={sites} products={products} selectedId={offeringId} onSelect={openOffering} onOpenWork={openWork} onOpenProduct={(id) => { setOfferingId(null); setProductId(id); }} onRequestSetup={(entry) => navigate("help", `I want setup help for ${entry.offering?.name ?? entry.title} for ${current?.name ?? "this business"}. ${entry.offering?.installationNote || entry.product?.description || entry.description}`)} onRetryConflict={offerings.retryConflict} onRetry={offerings.reload} onCommand={offerings.command} onWebsiteCommand={offerings.websiteCommand} /> : product ? <>
          <button type="button" className={styles.back} onClick={() => setProductId(null)}><ArrowLeft size={16} />All products</button>
          <header className={styles.pageHeader}><p className={styles.eyebrow}>{product.id === "homefinder" ? "Preview · early access" : product.availability === "available" ? "Available to use" : product.availability === "managed" ? "Managed service" : "Not available yet"}</p><h1 ref={productHeadingRef} tabIndex={-1}>{product.name}</h1><p>{product.description}</p></header>
          <div className={styles.productBody}>
            {renderProductBody()}
          </div>
        </> : <>
          <WorkspaceTemplateLibrary key={`${snapshot.actor.email}:${snapshot.workspaceId}`} workspaceId={snapshot.workspaceId} actorEmail={snapshot.actor.email} businessName={current?.name || "Your business"} canCreate={!workspaceMutationReadOnly && Boolean(onHorizontal) && products.some(item => item.id === "applications" && item.availability === "available")} onRequest={openRequest} onCreated={onCreatedApp} />
          <details open={moreToolsOpen} onToggle={event => setMoreToolsOpen(event.currentTarget.open)} className="mt-8 border-t border-gray-border pt-4"><summary className="cursor-pointer py-4 text-base font-medium">More tools and managed services</summary>
          <WorkspaceOfferingDirectory state={offerings.state} businessName={current?.name || "This business"} work={snapshot.work} managedSites={sites} products={products} selectedId={null} onSelect={openOffering} onOpenWork={openWork} onOpenProduct={(id) => { setOfferingId(null); setProductId(id); }} onRequestSetup={(entry) => navigate("help", `I want setup help for ${entry.offering?.name ?? entry.title} for ${current?.name ?? "this business"}. ${entry.offering?.installationNote || entry.product?.description || entry.description}`)} onRetryConflict={offerings.retryConflict} onRetry={offerings.reload} onCommand={offerings.command} onWebsiteCommand={offerings.websiteCommand} />
          </details>
          <div className={styles.invitation}><h2>Website health</h2><p>Check SEO, speed, security, and accessibility, then export the report.</p><Link className={styles.textAction} href="/audit">Open website audit<ArrowRight size={16} /></Link></div>
          <div className={styles.invitation}><h2>Something missing?</h2><p>Tell us what you want to do, what you use today, and where it falls short.</p><button type="button" className={styles.textAction} onClick={() => navigate("help")}>Tell us what you need<ArrowRight size={16} /></button></div>
        </>}
      </div> : section === "work" ? <div className={styles.page}>
        <header className={styles.pageHeader}><p className={styles.eyebrow}>{readOnly ? "Shared with you" : current?.name}</p><h1>My work</h1><p>Your websites and saved work, ready to return to.</p></header>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search saved work</span><input ref={searchInputRef} id="workspace-search" type="search" placeholder="Find a website or saved work…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {busy ? <p role="status">Loading your work…</p> : workList()}
        {!busy && visibleUnassignedSites.length > 0 ? <section className={styles.unassignedSites} aria-labelledby="unassigned-sites-title"><h2 id="unassigned-sites-title">{siteAssignmentsKnown ? "Authorized sites, not assigned to this business" : "Authorized sites, business assignment unavailable"}</h2><p>{siteAssignmentsKnown ? "These sites are available to your account. Assign one to this business before using its website controls here." : "These sites are available to your account, but this view cannot read the business offering that would establish an installation."}</p><WebsiteAssignmentHandoff businessName={current?.name || "this business"} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings.state} sites={visibleUnassignedSites} onRetry={offerings.reload} onCommand={offerings.websiteCommand} /></section> : null}
        {!busy && !visibleWork.length && !visibleSites.length && !visibleUnassignedSites.length && <div className={styles.empty}><h2>{query ? "No matching work" : "Your work will be here."}</h2><p>{query ? "Try a different name." : "Start a document, tracker, or assessment. Business installations appear here only after they are explicitly linked."}</p><button className={styles.textAction} onClick={() => query ? setQuery("") : navigate("products")}>{query ? "Clear search" : "Explore what’s available"}<ArrowRight size={16} /></button></div>}
      </div> : null}
    </div>
  </StrelvaShell></WorkspaceIntent>;
}
