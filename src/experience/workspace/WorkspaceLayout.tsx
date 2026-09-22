"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileSearch, Globe2, MessageSquareText, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter, InquirySurfaceSnapshot, InquiryView } from "@/experience/inquiries/contracts";
import { WorkspaceIntentProvider, type WorkspaceClientIntent } from "@/platform/workspaces/client-intent";
import type { ApplicationTemplate } from "@/products/applications/templates";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { discoveryProducts, sameAppHref, type ManagedWorkSummary } from "./workspace-discovery";
import { WorkspaceHelp } from "./WorkspaceHelp";
import { WorkspaceStart } from "./WorkspaceStart";
import { BusinessHome } from "./BusinessHome";
import { AgencyHome } from "./AgencyHome";
import { WorkspaceBusinessSettings } from "./WorkspaceBusinessSettings";
import { WorkspaceTemplateLibrary } from "./WorkspaceTemplateLibrary";
import { WebsiteAssignmentHandoff, WorkspaceOfferingDirectory, boundManagedWebsiteIds, useWorkspaceOfferings } from "./WorkspaceOfferings";
import { workspaceWorkLabel } from "./work-label";
import { workspaceExitBlocksChanges, workspaceExitIsStopped } from "./workspace-exit-ui";
import { browserIntentStorage, restoreWorkspaceIntent, retainWorkspaceIntent } from "./workspace-intent";
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
  onChoose: (id: string) => void;
  onWorkspace: (id: string) => void;
  onOpenClientWork: (workspaceId: string, workId: string) => void;
  notice: ReactNode;
  children?: ReactNode;
}
function parameter(key: string): string | null { return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(key); }
function initialSection(): StrelvaSection {
  const value = parameter("view");
  if (value === "operations" || value === "ongoing") return "ongoing";
  if (value === "tracker" || value === "inquiries" || value === "document" || value === "plan") return "work";
  return value === "products" || value === "templates" || value === "work" || value === "access" || value === "settings" || value === "help" ? value : "home";
}
function workView(work?: WorkspaceWork): string {
  if (work?.productId === "operations") return "ongoing";
  if (work?.productId === "documents") return "document";
  if (work?.productId === "work_plans") return "plan";
  if (work && ["tracker", "onboarding", "websites", "applications", "custom-applications", "scheduling", "investigations", "product-learning"].includes(work.productId)) return work.productId;
  return "work";
}

export function WorkspaceLayout({ appBase = "", signOut, snapshot, managedWork = [], managedWorkUnavailable, home, agency, busy, selectedWork, workingTitle, workingSection = "work", onHome, onNew, onPlan, onOngoing, onAgency, onInquiry, onTracker, onWebsite, onDocument, onHorizontal, trackerTemplates, inquiryBusinesses = [], inquiry, tracker, plan, document: documentContent, onChoose, onWorkspace, onOpenClientWork, notice, children }: Props) {
  const [section, setSection] = useState<StrelvaSection>(initialSection);
  const [startOpen, setStartOpen] = useState(() => parameter("view") === "start");
  const [query, setQuery] = useState(() => parameter("q")?.slice(0, 240) || "");
  const [productId, setProductId] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(() => parameter("offering"));
  const [templateId, setTemplateId] = useState<string | null>(() => parameter("template"));
  const [helpRequest, setHelpRequest] = useState<string | undefined>();
  const [websiteHandoff, setWebsiteHandoff] = useState<WorkspaceStartWebsiteHandoff | null>(null);
  const [intent, setIntent] = useState<WorkspaceClientIntent | null>(() => restoreWorkspaceIntent(browserIntentStorage(), snapshot.actor.email, snapshot.workspaceId));
  const [requestDraft, setRequestDraft] = useState(() => intent?.route === "start" ? intent.request : "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const productHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const restore = () => { setSection(initialSection()); setStartOpen(parameter("view") === "start"); setProductId(null); setOfferingId(parameter("offering")); setTemplateId(parameter("template")); setQuery(parameter("q")?.slice(0, 240) || ""); setHelpRequest(undefined); setWebsiteHandoff(null); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    if (section === "products" && productId) productHeadingRef.current?.focus({ preventScroll: true });
  }, [offeringId, productId, section, templateId]);
  useEffect(() => {
    if (section !== "work" || parameter("search") !== "1") return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  const workspaceStopped = workspaceExitIsStopped(snapshot.workspaceExitState, snapshot.workspaceExitReadStatus);
  const workspaceExitUnavailable = snapshot.workspaceExitReadStatus === "unavailable";
  const workspaceExitBlocks = workspaceExitBlocksChanges(snapshot.workspaceExitState, snapshot.workspaceExitReadStatus);
  const readOnly = current?.access === "delegated_read";
  const workspaceMutationReadOnly = readOnly || workspaceExitBlocks;
  const canSaveServiceRequest = current?.kind === "customer" && !readOnly && (current.role === "owner" || current.role === "admin");
  const serviceRequestProviders = canSaveServiceRequest ? [{ label: "Strelva", provider: { kind: "strelva" as const } }, ...snapshot.workspaces.filter(workspace => workspace.kind === "agency" && workspace.access !== "delegated_read").map(workspace => ({ label: workspace.name, provider: { kind: "agency" as const, agencyWorkspaceId: workspace.id } }))] : undefined;
  const offerings = useWorkspaceOfferings({ businessId: snapshot.workspaceId, enabled: current?.kind === "customer" && !workspaceMutationReadOnly, unavailableReason: current?.kind !== "customer" ? "Choose a customer business workspace to view its installations. Personal and agency workspaces remain separate." : readOnly ? "This work-share does not include business-wide offering access. The customer can add direct business membership when that access is appropriate." : workspaceExitUnavailable ? "Workspace status is temporarily unavailable. Existing work remains available to review." : workspaceExitBlocks ? "This workspace has stopped. Existing offerings remain available to review." : "Offering access is unavailable in this workspace." });
  const products = discoveryProducts(snapshot.products);
  const product = products.find(item => item.id === productId);
  const normalized = query.trim().toLowerCase();
  const visibleWork = snapshot.work.filter(work => [work.title, workspaceWorkLabel(work), work.assessment?.subject.name, work.assessment?.subject.url, work.assessment?.method.label].some(value => value?.toLowerCase().includes(normalized)));
  const sites = managedWork.flatMap(site => { const href = sameAppHref(site.href); return href ? [{ ...site, href }] : []; });
  const boundWebsiteIds = boundManagedWebsiteIds(offerings.state);
  const siteAssignmentsKnown = current?.kind !== "customer" || (!managedWorkUnavailable && offerings.state.status === "ready");
  const siteAssignmentState = managedWorkUnavailable || offerings.state.status === "error" || offerings.state.status === "unavailable" ? "unavailable" as const : offerings.state.status === "loading" ? "loading" as const : "known" as const;
  const assignedSites = sites.filter(site => boundWebsiteIds.has(site.id));
  const unassignedSites = sites.filter(site => !boundWebsiteIds.has(site.id));
  const visibleSites = assignedSites.filter(site => site.title.toLowerCase().includes(normalized));
  const visibleUnassignedSites = unassignedSites.filter(site => site.title.toLowerCase().includes(normalized));
  const person = snapshot.actor.email.split("@")[0] || "Your account";
  const sourcePlan = selectedWork && ["documents", "tracker", "applications"].includes(selectedWork.productId) && selectedWork.sourceWorkId ? snapshot.work.find(work => work.id === selectedWork.sourceWorkId && work.productId === "work_plans" && work.resourceKind === "plan") : undefined;
  const sourcePlanHref = sourcePlan ? `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=plan&work=${encodeURIComponent(sourcePlan.id)}` : undefined;

  function remember(request: string, route: string, selectedTemplate?: string) {
    const next: WorkspaceClientIntent = { workspaceId: snapshot.workspaceId, request, route, ...(selectedTemplate ? { templateId: selectedTemplate } : {}) };
    setIntent(next);
    retainWorkspaceIntent(browserIntentStorage(), snapshot.actor.email, next);
  }
  function updateRequest(value: string) { setRequestDraft(value); remember(value, "start"); }
  function clearEmbeddedParams(url: URL) {
    for (const key of ["standingId", "assignmentId", "tenantId", "inquiryView", "inquiryRequest", "inquiryRecord", "trackerWork", "row", "search", "offering", "template"]) url.searchParams.delete(key);
  }
  function locationFor(view?: string) {
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    url.searchParams.set("workspaceId", snapshot.workspaceId);
    url.searchParams.delete("work");
    if (view && view !== "home") url.searchParams.set("view", view); else url.searchParams.delete("view");
    if (view === "work" && query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    return url;
  }
  function push(url: URL) { window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); }
  function navigate(next: StrelvaSection, prefillHelp?: string, focusSearch = false) {
    setStartOpen(false); setSection(next); setProductId(null); setOfferingId(null); setTemplateId(null); setHelpRequest(next === "help" ? prefillHelp : undefined); setWebsiteHandoff(null);
    if (next === "ongoing") onOngoing(); else onHome();
    const url = locationFor(next);
    if (focusSearch && next === "work") url.searchParams.set("search", "1");
    push(url);
  }
  function openSearch() { navigate("work", undefined, true); window.requestAnimationFrame(() => searchInputRef.current?.focus()); }
  function updateQuery(value: string) {
    const bounded = value.slice(0, 240); setQuery(bounded);
    const url = new URL(window.location.href);
    if (bounded) url.searchParams.set("q", bounded); else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function openWork(id: string) {
    setStartOpen(false); onChoose(id);
    const url = locationFor(workView(snapshot.work.find(work => work.id === id)));
    url.searchParams.set("work", id);
    if (query) url.searchParams.set("q", query);
    push(url);
  }
  function openAccess() { setStartOpen(false); setSection("access"); setProductId(null); setOfferingId(null); setTemplateId(null); setHelpRequest(undefined); setWebsiteHandoff(null); onAgency(); push(locationFor("access")); }
  function openStart(request?: string) {
    if (workspaceMutationReadOnly) return;
    if (typeof request === "string") updateRequest(request);
    setStartOpen(true); setSection("home"); setProductId(null); setOfferingId(null); setTemplateId(null); setHelpRequest(undefined); setWebsiteHandoff(null); onHome(); push(locationFor("start"));
  }
  function openOffering(id?: string | null) { navigate("products"); setOfferingId(id ?? null); const url = locationFor("products"); if (id) url.searchParams.set("offering", id); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); }
  function openTemplate(id: string | null) { setTemplateId(id); const url = locationFor("templates"); if (id) url.searchParams.set("template", id); push(url); }
  function preparePlan(request: string) { if (!workspaceMutationReadOnly && onPlan) { remember(request, "plan"); setStartOpen(false); onPlan(request); } }
  function openInquiry(tenantId: string, continuation?: WorkspaceStartContinuation) { if (workspaceMutationReadOnly) return; setStartOpen(false); onInquiry?.(tenantId, continuation); const url = locationFor("inquiries"); url.searchParams.set("tenantId", tenantId); push(url); }

  function continueStart(continuation: WorkspaceStartContinuation) {
    if (workspaceMutationReadOnly) return;
    remember(continuation.request, continuation.route);
    if (continuation.route === "assessment") { setStartOpen(false); onNew(continuation); return; }
    if (continuation.route === "tracker" && onTracker) { setStartOpen(false); onTracker(continuation); return; }
    if (continuation.route === "document" && onDocument) { setStartOpen(false); onDocument(continuation); return; }
    if (continuation.route === "inquiries") { const business = inquiryBusinesses.find(item => item.id === continuation.businessId); if (business && onInquiry) openInquiry(business.id, continuation); return; }
    if (continuation.route === "websites" || continuation.route === "onboarding" || continuation.route === "applications" || continuation.route === "scheduling" || continuation.route === "investigations" || continuation.route === "operations") { if (onHorizontal) { setStartOpen(false); onHorizontal(continuation.route, continuation); } return; }
    if (continuation.route === "website") {
      const site = sites.find(item => item.id === continuation.siteId);
      if (!site) return;
      if (onWebsite) { if (onWebsite(site, continuation) !== false) setStartOpen(false); }
      else setWebsiteHandoff({ site, request: continuation.request });
    }
  }
  function useTemplate(entry: ApplicationTemplate) {
    if (workspaceMutationReadOnly || !onHorizontal || !products.some(item => item.id === "applications" && item.availability === "available")) return;
    const request = `Create a ${entry.name.toLowerCase()} app for our business. ${entry.description}`;
    remember(request, "applications", entry.id); setStartOpen(false);
    onHorizontal("applications", { route: "applications", productId: "applications", request, includedPartIds: ["scope", "control"] });
  }
  const startContext: WorkspaceStartContext = { readOnly: workspaceMutationReadOnly, products, inquiryBusinesses, managedSites: sites, managedWorkUnavailable, trackerTemplates, native: { assessment: Boolean(onNew), tracker: Boolean(onTracker), inquiries: Boolean(onInquiry), website: Boolean(onWebsite || sites.length), document: Boolean(onDocument), websites: Boolean(onHorizontal), onboarding: Boolean(onHorizontal), applications: Boolean(onHorizontal), scheduling: Boolean(onHorizontal), investigations: Boolean(onHorizontal), operations: Boolean(onHorizontal), help: true } };
  function workList(limit?: number, source = visibleWork) {
    const items = limit === undefined ? source : source.slice(0, limit);
    return <div className={styles.workList}>{visibleSites.map(site => <Link key={site.id} href={site.href} className={styles.workRow} prefetch={false}><Globe2 size={20} strokeWidth={1.5} /><span><strong>{site.title}</strong><small>Website installation · {site.relationship === "enterprise" ? "Enterprise service" : "Managed by Strelva"}</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>)}{items.map(work => <button key={work.id} type="button" className={styles.workRow} onClick={() => openWork(work.id)} aria-label={`Open ${work.title}`}><FileSearch size={20} strokeWidth={1.5} /><span><strong>{work.title}</strong><small>{workspaceWorkLabel(work)} · {new Date(work.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}</div>;
  }
  const workspaceHref = `${appBase}/workspace?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`;
  const exportHref = `${appBase}/workspace/export?workspaceId=${encodeURIComponent(snapshot.workspaceId)}`;
  const stoppedBanner = workspaceExitBlocks ? <div role="status" aria-label={workspaceExitUnavailable ? "Workspace status unavailable" : "Workspace stopped"} className="mx-4 mt-4 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-sm sm:mx-7"><div className="min-w-0 max-w-2xl"><strong className="font-medium text-warm-black">{workspaceExitUnavailable ? "Workspace status is temporarily unavailable." : "Work in this workspace has stopped."}</strong><p className="mt-1 leading-relaxed text-gray-muted">Existing records remain available to review and export. New work and publishing stay disabled.</p></div><div className="flex flex-wrap gap-4"><Link href={`${workspaceHref}&view=work`}>Review retained work</Link><Link href={exportHref}>Export retained records</Link></div></div> : null;
  const stoppedHome = <div className={styles.page}><header className={styles.pageHeader}><p className={styles.eyebrow}>Workspace status</p><h1>{workspaceExitUnavailable ? "Workspace changes are paused." : "Work in this workspace has stopped."}</h1><p>Saved work remains available to inspect. Open My work to review retained records or export a copy.</p></header><div className="flex flex-wrap gap-3"><Link className={styles.primaryAction} href={`${workspaceHref}&view=work`}>Review retained work<ArrowRight size={17} /></Link><Link className={styles.secondaryAction} href={exportHref}>Export retained records<ArrowRight size={17} /></Link></div></div>;

  function renderProductBody() {
    if (!product) return null;
    if (product.id === "websites" || product.id === "onboarding" || product.id === "applications" || product.id === "scheduling" || product.id === "investigations" || product.id === "operations") {
      const id = product.id;
      return <><h2>{product.name}</h2><p>{product.description}</p>{id === "applications" ? <Button type="button" variant="secondary" onClick={() => navigate("templates")}>Browse app templates</Button> : null}<Button type="button" disabled={workspaceMutationReadOnly || product.availability !== "available" || !onHorizontal} onClick={() => { if (!workspaceMutationReadOnly && product.availability === "available") onHorizontal?.(id); }}>Get started<ArrowRight size={17} /></Button></>;
    }
    if (product.id === "ai_visibility") return <><h2>Understand what AI can find.</h2><p>Check a business, inspect the evidence, and keep the assessment in your work. This is a point-in-time assessment, not ongoing monitoring.</p><Button disabled={workspaceMutationReadOnly || product.availability !== "available"} onClick={() => onNew()}>Check a business</Button></>;
    if (product.id === "inquiries") return <><h2>Keep customer requests moving.</h2><p>Choose the business whose customer requests you want to work with.</p>{inquiryBusinesses.length ? <div className={styles.productChoices}>{inquiryBusinesses.map(business => <Button key={business.id} variant="secondary" disabled={workspaceMutationReadOnly} onClick={() => openInquiry(business.id)}><MessageSquareText size={17} />Open {business.title}</Button>)}</div> : <p>No business scopes are available to this account yet.</p>}</>;
    if (product.id === "tracker") return <><h2>Turn a CSV into working data.</h2><p>Import a CSV, review its fields, and keep the resulting tracker in this workspace.</p><Button disabled={workspaceMutationReadOnly || product.availability !== "available" || !onTracker} onClick={() => onTracker?.()}>Start a tracker</Button></>;
    if (product.id === "documents") return <><h2>Keep a useful document close.</h2><p>Write a procedure, proposal, or working note and keep its history alongside it.</p><Button disabled={workspaceMutationReadOnly || product.availability !== "available" || !onDocument} onClick={() => onDocument?.()}>Start a document</Button></>;
    if (product.id === "managed_presence") return <><h2>Your website, with the work around it.</h2><p>Open your website, review changes, and see its connected information.</p>{sites.length ? workList(0) : <p>No managed website is connected to this account.</p>}<Button variant="secondary" onClick={() => navigate("help")}>Talk about your website</Button></>;
    return <><h2>Try the search before you connect it.</h2><p>Home Finder is a brokerage-branded home search. This preview uses synthetic listings and never sends or stores buyer inquiries.</p>{product.previewHref ? <a className={styles.primaryAction} href={product.previewHref} target="_blank" rel="noreferrer">Try Home Finder<ArrowRight size={17} /></a> : <p>Its synthetic preview is not available from this environment yet.</p>}<p>A live installation needs brokerage approval, permitted listing data, and verified inquiry delivery.</p><Button variant="secondary" onClick={() => navigate("help", "I’d like early access to Home Finder. Please tell me what enabling a live brokerage installation would require.")}>Ask about early access</Button></>;
  }
  function directory(selectedId: string | null) { return <WorkspaceOfferingDirectory state={offerings.state} businessName={current?.name || "This business"} work={snapshot.work} managedSites={sites} products={products} selectedId={selectedId} onSelect={openOffering} onOpenWork={openWork} onOpenProduct={id => { setOfferingId(null); setProductId(id); }} onRequestSetup={entry => navigate("help", `I want setup help for ${entry.offering?.name ?? entry.title} for ${current?.name ?? "this business"}. ${entry.offering?.installationNote || entry.product?.description || entry.description}`)} onRetryConflict={offerings.retryConflict} onRetry={offerings.reload} onCommand={offerings.command} onWebsiteCommand={offerings.websiteCommand} />; }

  let body: ReactNode;
  if (!home) body = <div className={styles.detail}><Button type="button" variant="ghost" onClick={() => navigate(workingSection)} icon={<ArrowLeft size={16} />}>Back to {workingSection === "ongoing" ? "ongoing" : "work"}</Button>{sourcePlanHref ? <Link className={styles.textAction} href={sourcePlanHref}><FileSearch size={15} aria-hidden="true" />View plan and creation receipt<ArrowRight size={15} aria-hidden="true" /></Link> : null}{inquiry ? <InquiryServerWorkspaceExperience tenantId={inquiry.tenantId} adapter={inquiry.adapter} initialSnapshot={inquiry.initialSnapshot} initialView={inquiry.initialView} initialRequestId={inquiry.initialRequestId} initialInquiryId={inquiry.initialInquiryId} initialRequestText={inquiry.initialRequestText} basePath="/workspace" routePrefix="inquiry" /> : tracker !== undefined ? tracker : plan !== undefined ? plan : documentContent !== undefined ? documentContent : children}</div>;
  else if (workspaceExitBlocks && section !== "work" && section !== "templates") body = stoppedHome;
  else if (startOpen) body = <WorkspaceStart context={startContext} initialRequest={requestDraft} websiteHandoff={websiteHandoff} onWebsiteHandoffBack={() => setWebsiteHandoff(null)} onContinue={continueStart} onHelp={request => { remember(request, "help"); navigate("help", request); }} onPlan={onPlan ? preparePlan : undefined} />;
  else if (section === "templates") body = <WorkspaceTemplateLibrary readOnly={workspaceMutationReadOnly} available={Boolean(onHorizontal) && products.some(item => item.id === "applications" && item.availability === "available")} selectedId={templateId} onSelect={openTemplate} onUse={useTemplate} unavailableReason={workspaceExitBlocks ? "New work is paused for this workspace. Templates remain available to preview." : undefined} />;
  else if (section === "home" && current?.kind === "agency") body = <AgencyHome snapshot={snapshot} busy={busy} onWorkspace={onWorkspace} onOpenWork={openWork} onOpenClientWork={onOpenClientWork} onStart={() => openStart()} />;
  else if (section === "settings") body = <WorkspaceBusinessSettings workspace={current} sites={assignedSites} unassignedSites={unassignedSites} offerings={offerings.state} onWebsiteCommand={offerings.websiteCommand} onRetryWebsiteAssignments={offerings.reload} siteAssignmentState={siteAssignmentState} managedWorkUnavailable={managedWorkUnavailable} accountHref={`${appBase}/workspace/account`} />;
  else if (section === "help") body = <WorkspaceHelp key={helpRequest} workspaceName={current?.name} workspaceId={canSaveServiceRequest ? snapshot.workspaceId : undefined} providerOptions={serviceRequestProviders} hasManagedService={assignedSites.length > 0} onAgency={onAgency} initialRequest={helpRequest || (intent?.route === "help" ? intent.request : undefined)} />;
  else if (section === "products") body = <div className={styles.page}>{offeringId ? directory(offeringId) : product ? <><Button type="button" variant="ghost" onClick={() => setProductId(null)} icon={<ArrowLeft size={16} />}>All products</Button><header className={styles.pageHeader}><p className={styles.eyebrow}>{product.id === "homefinder" ? "Preview · early access" : product.availability === "available" ? "Available to use" : product.availability === "managed" ? "Managed service" : "Not available yet"}</p><h1 ref={productHeadingRef} tabIndex={-1}>{product.name}</h1><p>{product.description}</p></header><div className={styles.productBody}>{renderProductBody()}</div></> : <>{directory(null)}<div className={styles.invitation}><h2>Website health</h2><p>Check SEO, speed, security, and accessibility, then export the report.</p><Link className={styles.textAction} href="/audit">Open website audit<ArrowRight size={16} /></Link></div><div className={styles.invitation}><h2>Something missing?</h2><p>Tell us what you need and where your current tools fall short.</p><Button variant="ghost" onClick={() => navigate("help")}>Tell us what you need<ArrowRight size={16} /></Button></div></>}</div>;
  else if (section === "work") body = <div className={styles.page}><header className={styles.pageHeader}><p className={styles.eyebrow}>{readOnly ? "Shared with you" : current?.name}</p><h1>My work</h1><p>Your websites and saved work, ready to return to.</p></header><label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search saved work</span><input ref={searchInputRef} id="workspace-search" type="search" placeholder="Find a website or saved work…" maxLength={240} value={query} onChange={event => updateQuery(event.target.value)} /></label>{busy ? <p role="status">Loading your work…</p> : <><p role="status" className="mb-4 text-sm text-gray-muted">{visibleWork.length + visibleSites.length + visibleUnassignedSites.length} {normalized ? "matching items" : "items"}</p>{workList()}</>}{!busy && visibleUnassignedSites.length > 0 ? <section className={styles.unassignedSites} aria-labelledby="unassigned-sites-title"><h2 id="unassigned-sites-title">{siteAssignmentsKnown ? "Authorized sites, not assigned to this business" : "Authorized sites, business assignment unavailable"}</h2><p>These sites are available to your account. Business assignment and website permission remain separate.</p><WebsiteAssignmentHandoff businessName={current?.name || "this business"} state={managedWorkUnavailable ? { status: "unavailable", reason: "Linked website access is unavailable right now." } : offerings.state} sites={visibleUnassignedSites} onRetry={offerings.reload} onCommand={offerings.websiteCommand} /></section> : null}{!busy && !visibleWork.length && !visibleSites.length && !visibleUnassignedSites.length ? <div className={styles.empty}><h2>{query ? "No matching work" : "Your work will be here."}</h2><p>{query ? "Try a different name." : "Start from a template or describe what you need."}</p><Button variant="ghost" onClick={() => query ? updateQuery("") : navigate("templates")}>{query ? "Clear search" : "Browse templates"}<ArrowRight size={16} /></Button></div> : null}</div>;
  else body = null;

  if (home && !startOpen && section === "home" && current?.kind !== "agency" && !workspaceExitBlocks) return <WorkspaceIntentProvider value={intent}><BusinessHome snapshot={snapshot} sites={assignedSites} unassignedSites={unassignedSites} siteAssignmentsKnown={siteAssignmentsKnown} offerings={offerings.state} busy={busy} notice={notice} managedWorkUnavailable={managedWorkUnavailable} appBase={appBase} accountHref={`${appBase}/workspace/account`} signOut={signOut} request={requestDraft} onRequestChange={updateRequest} onExplore={() => navigate("products")} onTemplates={() => navigate("templates")} onSearch={openSearch} onOpen={openWork} onStart={() => openStart()} onCreateWebsite={onHorizontal && products.some(entry => entry.id === "websites" && entry.availability === "available") ? () => onHorizontal("websites") : undefined} onRequest={request => openStart(request)} onWorkspace={onWorkspace} onWork={() => navigate("work")} onOngoing={() => navigate("ongoing")} onAccess={openAccess} onSettings={() => navigate("settings")} onHelp={() => navigate("help")} onOfferings={openOffering} onWebsiteCommand={offerings.websiteCommand} onRetryWebsiteAssignments={offerings.reload} /></WorkspaceIntentProvider>;
  const title = !home ? inquiry ? "Inquiry work" : tracker !== undefined ? "Tracker" : plan !== undefined ? "Work plan" : documentContent !== undefined ? "Document" : agency ? "People & access" : workingTitle || "Your work" : startOpen ? "New" : section === "home" ? "Strelva" : section === "products" ? "Explore offerings" : section === "templates" ? "Templates" : section === "settings" ? "Settings" : section === "ongoing" ? "Ongoing" : section === "help" ? "Help" : "Work";
  return <WorkspaceIntentProvider value={intent}><StrelvaShell appBase={appBase} signOut={signOut} workspaceId={snapshot.workspaceId} active={agency ? "access" : home ? startOpen ? undefined : section : workingSection} title={title} accountName={person} accountDetail={snapshot.actor.email} onNavigate={navigate} onAccess={openAccess} onSearch={openSearch} onStart={() => openStart()} startDisabled={workspaceMutationReadOnly} navigation={snapshot.work.length ? <><h2>Recent</h2>{snapshot.work.slice(0, 7).map(work => <button key={work.id} type="button" aria-current={selectedWork?.id === work.id ? "page" : undefined} onClick={() => openWork(work.id)}><span>{work.title}</span></button>)}</> : undefined} context={<label><span className="sr-only">Current workspace</span><select value={snapshot.workspaceId} disabled={busy} onChange={event => { setStartOpen(false); setSection("home"); setProductId(null); setOfferingId(null); setTemplateId(null); setQuery(""); onWorkspace(event.target.value); }}>{snapshot.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}{item.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>} actions={!home ? <Button variant="ghost" type="button" onClick={agency ? () => navigate("home") : onAgency}>{agency ? "Back to home" : "Sharing & access"}</Button> : undefined} notice={notice} contentId="workspace-main">{stoppedBanner}<div ref={scrollRef} className={styles.scroll} aria-busy={busy || undefined}>{body}</div></StrelvaShell></WorkspaceIntentProvider>;
}
