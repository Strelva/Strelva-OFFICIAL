"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileSearch, FileText, Globe2, MessageSquareText, Search, Table2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import { InquiryServerWorkspaceExperience } from "@/experience/inquiries/InquiryServerExperience";
import type { InquirySurfaceAdapter, InquirySurfaceSnapshot, InquiryView } from "@/experience/inquiries/contracts";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { discoveryProducts, sameAppHref, type ManagedWorkSummary } from "./workspace-discovery";
import { WorkspaceHelp } from "./WorkspaceHelp";
import { WorkspaceStart } from "./WorkspaceStart";
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
  onHome: () => void;
  onNew: (context?: WorkspaceStartContinuation) => void;
  onPlan?: (request: string) => void;
  onAgency: () => void;
  onInquiry?: (tenantId: string, context?: WorkspaceStartContinuation) => void;
  onTracker?: (context?: WorkspaceStartContinuation) => void;
  onWebsite?: (site: ManagedWorkSummary, context?: WorkspaceStartContinuation) => void;
  onDocument?: (context?: WorkspaceStartContinuation) => void;
  trackerTemplates?: readonly WorkspaceStartTemplate[];
  inquiryBusinesses?: readonly { id: string; title: string }[];
  inquiry?: WorkspaceInquiryTarget;
  tracker?: ReactNode;
  plan?: ReactNode;
  document?: ReactNode;
  onChoose: (id: string) => void;
  onWorkspace: (id: string) => void;
  notice: ReactNode;
  children?: ReactNode;
}

function initialSection(): StrelvaSection {
  if (typeof window === "undefined") return "home";
  const value = new URLSearchParams(window.location.search).get("view");
  if (value === "tracker" || value === "inquiries" || value === "document" || value === "plan") return "work";
  return value === "products" || value === "work" || value === "help" ? value : "home";
}

function initialStartOpen(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === "start";
}

export function WorkspaceLayout({ appBase, signOut, snapshot, managedWork = [], managedWorkUnavailable, home, agency, busy, selectedWork, onHome, onNew, onPlan, onAgency, onInquiry, onTracker, onWebsite, onDocument, trackerTemplates, inquiryBusinesses = [], inquiry, tracker, plan, document, onChoose, onWorkspace, notice, children }: Props) {
  const [section, setSection] = useState<StrelvaSection>(initialSection);
  const [startOpen, setStartOpen] = useState(initialStartOpen);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [helpRequest, setHelpRequest] = useState<string | undefined>();
  const [websiteHandoff, setWebsiteHandoff] = useState<WorkspaceStartWebsiteHandoff | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const productHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restore = () => { setSection(initialSection()); setStartOpen(initialStartOpen()); setProductId(null); setQuery(""); setHelpRequest(undefined); setWebsiteHandoff(null); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    if (section === "products" && productId) productHeadingRef.current?.focus({ preventScroll: true });
  }, [productId, section]);
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const businessHeading = current?.kind === "agency" ? "Clients" : "Businesses";
  const products = discoveryProducts(snapshot.products);
  const product = products.find(item => item.id === productId);
  const normalized = query.trim().toLowerCase();
  const visibleWork = snapshot.work.filter(work => [work.title, work.assessment?.subject.name, work.assessment?.subject.url, work.assessment?.method.label].some(value => value?.toLowerCase().includes(normalized)));
  const sites = managedWork.flatMap(site => { const href = sameAppHref(site.href); return href ? [{ ...site, href }] : []; });
  const visibleSites = sites.filter(site => site.title.toLowerCase().includes(normalized));
  const person = snapshot.actor.email.split("@")[0] || "Your account";
  const sourcePlan = selectedWork && (selectedWork.productId === "documents" || selectedWork.productId === "tracker") && selectedWork.sourceWorkId
    ? snapshot.work.find((work) => work.id === selectedWork.sourceWorkId && work.productId === "work_plans" && work.resourceKind === "plan")
    : undefined;
  const sourcePlanHref = sourcePlan
    ? `${appBase ? `${appBase.replace(/\/$/, "")}/workspace` : "/workspace"}?workspaceId=${encodeURIComponent(snapshot.workspaceId)}&view=plan&work=${encodeURIComponent(sourcePlan.id)}`
    : undefined;

  function workMethod(work: WorkspaceWork): string {
    if (work.productId === "research" && work.resourceKind === "experiment") return "Tracker experiment";
    if (work.productId === "documents" && work.resourceKind === "document") return "Private document";
    if (work.productId === "work_plans" && work.resourceKind === "plan") return "Work plan";
    if (work.productId === "tracker" && work.resourceKind === "tracker") return "Tracker";
    return work.assessment?.method.label ?? "Saved work · view unavailable";
  }

  function clearEmbeddedParams(url: URL) {
    url.searchParams.delete("tenantId");
    url.searchParams.delete("inquiryView");
    url.searchParams.delete("inquiryRequest");
    url.searchParams.delete("inquiryRecord");
    url.searchParams.delete("trackerWork");
  }

  function navigate(next: StrelvaSection, prefillHelp?: string) {
    setStartOpen(false); setSection(next); setProductId(null); setQuery(""); setHelpRequest(next === "help" ? prefillHelp : undefined); setWebsiteHandoff(null); onHome();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    if (next === "home") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    url.searchParams.delete("work");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function openWork(id: string) {
    setStartOpen(false);
    onChoose(id);
    const selected = snapshot.work.find((work) => work.id === id);
    const url = new URL(window.location.href); url.searchParams.set("work", id); url.searchParams.set("workspaceId", snapshot.workspaceId);
    clearEmbeddedParams(url);
    url.searchParams.set("view", selected?.productId === "tracker" ? "tracker" : selected?.productId === "documents" ? "document" : selected?.productId === "work_plans" ? "plan" : "work");
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

  function openStart() {
    setStartOpen(true);
    setSection("home");
    setProductId(null);
    setQuery("");
    setHelpRequest(undefined);
    setWebsiteHandoff(null);
    onHome();
    const url = new URL(window.location.href);
    clearEmbeddedParams(url);
    url.searchParams.set("view", "start");
    url.searchParams.delete("work");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function continueStart(continuation: WorkspaceStartContinuation) {
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
    if (continuation.route === "website") {
      const site = sites.find((item) => item.id === continuation.siteId);
      if (!site) return;
      if (onWebsite) {
        setStartOpen(false);
        onWebsite(site, continuation);
      } else setWebsiteHandoff({ site, request: continuation.request });
      return;
    }
  }

  const startContext: WorkspaceStartContext = {
    readOnly,
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
      help: true,
    },
  };

  const recent = <>
    {(inquiryBusinesses.length > 0 || sites.length > 0) && <section aria-label={businessHeading}><h2>{businessHeading}</h2>{inquiryBusinesses.slice(0, 8).map((business) => <button key={`inquiry-${business.id}`} type="button" onClick={() => openInquiry(business.id)}><MessageSquareText size={16} aria-hidden="true" /><span>{business.title}</span></button>)}{sites.filter((site) => !inquiryBusinesses.some((business) => business.id === site.id)).slice(0, 8).map(site => <Link key={`site-${site.id}`} href={site.href} prefetch={false}><Globe2 size={16} aria-hidden="true" /><span>{site.title}</span></Link>)}</section>}
    {snapshot.work.length > 0 && <section aria-label="Recent work"><h2>Recent work</h2>{snapshot.work.slice(0, 8).map(work => <button key={work.id} type="button" onClick={() => openWork(work.id)} aria-current={!home && selectedWork?.id === work.id && !agency ? "page" : undefined}><FileSearch size={15} aria-hidden="true" /><span>{work.title}</span></button>)}</section>}
  </>;

  function workList(limit?: number) {
    const items = limit === undefined ? visibleWork : visibleWork.slice(0, limit);
    return <div className={styles.workList}>
      {visibleSites.map(site => <Link key={site.id} href={site.href} className={styles.workRow} prefetch={false}><Globe2 size={20} strokeWidth={1.5} /><span><strong>{site.title}</strong><small>Website · {site.relationship === "enterprise" ? "Enterprise service" : "Managed by Strelva"}</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>)}
      {items.map(work => <button key={work.id} type="button" className={styles.workRow} onClick={() => openWork(work.id)} aria-label={`Open ${work.title}`}><FileSearch size={20} strokeWidth={1.5} /><span><strong>{work.title}</strong><small>{workMethod(work)} · {new Date(work.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
    </div>;
  }

  function renderProductBody() {
    if (!product) return null;
    if (product.id === "ai_visibility") {
      return <><h2>Understand what AI can find.</h2><p>Check a business, inspect the evidence, and keep the assessment in your work. Share a copy when you want someone else to use it.</p><p>This is an assessment at a point in time. It does not activate monitoring or change your website.</p><button className={styles.primaryAction} type="button" disabled={readOnly || product.availability !== "available"} onClick={() => onNew()}>Check a business<ArrowRight size={17} /></button>{readOnly && <p>Switch to a workspace you own to create an assessment.</p>}</>;
    }
    if (product.id === "inquiries") {
      return <><h2>Keep customer requests moving.</h2><p>Start with one request in a selected business scope. Review its shape, result, and receipt in one inspectable thread.</p>{inquiryBusinesses.length > 0 ? <div className={styles.productChoices}>{inquiryBusinesses.map((business) => <button key={business.id} type="button" className={styles.secondaryAction} onClick={() => openInquiry(business.id)}><MessageSquareText size={17} />Open {business.title}<ArrowRight size={17} /></button>)}</div> : <p>No business scopes are available to this account yet.</p>}</>;
    }
    if (product.id === "tracker") {
      return <><h2>Turn a CSV into working data.</h2><p>Import a small CSV, review the proposed fields, and keep the resulting tracker in this workspace.</p><button className={styles.primaryAction} type="button" disabled={readOnly || product.availability !== "available" || !onTracker} onClick={() => onTracker?.()}>Start a tracker<ArrowRight size={17} /></button>{readOnly && <p>Switch to a workspace you own to create a tracker.</p>}</>;
    }
    if (product.id === "documents") {
      return <><h2>Keep a useful document close.</h2><p>Write a procedure, proposal, or working note, review it before saving, and keep a history you can inspect or undo.</p><button className={styles.primaryAction} type="button" disabled={readOnly || product.availability !== "available" || !onDocument} onClick={() => onDocument?.()}>Start a document<ArrowRight size={17} /></button>{readOnly && <p>Switch to a workspace you own to create a document.</p>}</>;
    }
    if (product.id === "managed_presence") {
      return <><h2>Your website, with the work around it.</h2><p>Open your website to work with its content, review changes, and see the connected information available for your business.</p>{sites.length ? workList(0) : <p>No managed website is connected to this account. You can ask Strelva about a build or an existing site.</p>}<button type="button" className={styles.secondaryAction} onClick={() => navigate("help")}>Talk about your website<ArrowRight size={17} /></button></>;
    }
    return <><h2>Try the search before you connect it.</h2><p>Home Finder is a brokerage-branded home search. This preview uses synthetic listings and never sends or stores buyer inquiries.</p>{product.previewHref ? <a className={styles.primaryAction} href={product.previewHref} target="_blank" rel="noreferrer">Try Home Finder<ArrowRight size={17} /></a> : <p>Its synthetic preview is not available from this environment yet.</p>}<p>A live installation needs brokerage approval, permitted listing data, and verified inquiry delivery.</p><button type="button" className={styles.secondaryAction} onClick={() => navigate("help", "I’d like early access to Home Finder. Please tell me what enabling a live brokerage installation would require.")}>Ask about early access<ArrowRight size={17} /></button></>;
  }

  return <StrelvaShell appBase={appBase} signOut={signOut}
    active={home ? startOpen ? undefined : section : "work"}
    title={!home ? inquiry ? "Inquiry work" : tracker !== undefined ? "Tracker" : plan !== undefined ? "Work plan" : document !== undefined ? "Document" : agency ? "People & access" : selectedWork ? "Your work" : "New assessment" : startOpen ? "New" : section === "home" ? "Strelva" : section === "products" ? "Explore" : section === "help" ? "Help & service" : "My work"}
    accountName={person} accountDetail={snapshot.actor.email}
    onNavigate={navigate} onStart={openStart} navigation={recent}
    context={<label><span className="sr-only">Current workspace</span><select value={snapshot.workspaceId} disabled={busy} onChange={event => { setStartOpen(false); setSection("home"); setProductId(null); setQuery(""); onWorkspace(event.target.value); }}>{snapshot.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}{item.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}
    actions={!home ? inquiry ? <button type="button" onClick={() => navigate("work")}>My work</button> : tracker !== undefined || plan !== undefined || document !== undefined ? selectedWork ? <button type="button" onClick={onAgency}>Sharing & access</button> : <button type="button" onClick={() => navigate("work")}>My work</button> : <button type="button" onClick={agency ? () => navigate("home") : onAgency}>{agency ? "Back to home" : "Sharing & access"}</button> : undefined}
    notice={notice} contentId="workspace-main"
  >
    <div ref={scrollRef} className={styles.scroll} aria-busy={busy || undefined}>
      {!home ? <div className={styles.detail}><button type="button" className={styles.back} onClick={() => navigate("work")}><ArrowLeft size={16} />Back to my work</button>{sourcePlanHref ? <Link className={styles.textAction} href={sourcePlanHref}><FileSearch size={15} aria-hidden="true" />View plan and creation receipt<ArrowRight size={15} aria-hidden="true" /></Link> : null}{inquiry ? <InquiryServerWorkspaceExperience tenantId={inquiry.tenantId} adapter={inquiry.adapter} initialSnapshot={inquiry.initialSnapshot} initialView={inquiry.initialView} initialRequestId={inquiry.initialRequestId} initialInquiryId={inquiry.initialInquiryId} initialRequestText={inquiry.initialRequestText} basePath="/workspace" routePrefix="inquiry" /> : tracker !== undefined ? tracker : plan !== undefined ? plan : document !== undefined ? document : children}</div> : startOpen ? <WorkspaceStart context={startContext} websiteHandoff={websiteHandoff} onWebsiteHandoffBack={() => setWebsiteHandoff(null)} onContinue={continueStart} onHelp={(request) => navigate("help", request)} onPlan={onPlan} /> : section === "help" ? <WorkspaceHelp key={helpRequest} workspaceName={current?.name} hasManagedService={sites.length > 0} onAgency={onAgency} initialRequest={helpRequest} /> : section === "products" ? <div className={styles.page}>
        {product ? <>
          <button type="button" className={styles.back} onClick={() => setProductId(null)}><ArrowLeft size={16} />All products</button>
          <header className={styles.pageHeader}><p className={styles.eyebrow}>{product.id === "homefinder" ? "Preview · early access" : product.availability === "available" ? "Available to use" : product.availability === "managed" ? "Managed service" : "Not available yet"}</p><h1 ref={productHeadingRef} tabIndex={-1}>{product.name}</h1><p>{product.description}</p></header>
          <div className={styles.productBody}>
            {renderProductBody()}
          </div>
        </> : <>
          <header className={styles.pageHeader}><p className={styles.eyebrow}>Strelva products</p><h1>More you can do.</h1><p>Start with something useful. Add to the business you already have.</p></header>
          <div className={styles.productList}>{products.map(item => <button type="button" key={item.id} className={styles.productRow} onClick={() => setProductId(item.id)}><span className={styles.productSymbol}>{item.id === "ai_visibility" ? <FileSearch size={26} strokeWidth={1.3} /> : item.id === "documents" ? <FileText size={26} strokeWidth={1.3} /> : <Globe2 size={26} strokeWidth={1.3} />}</span><span><strong>{item.name}</strong><p>{item.description}</p><small>{item.id === "homefinder" ? "Preview · early access" : item.id === "tracker" || item.id === "documents" ? "Available to use" : item.availability === "available" ? "Available · Free assessment" : item.availability === "managed" ? "For connected clients" : "Not available yet"}</small></span><ArrowRight size={18} aria-hidden="true" /></button>)}</div>
          <div className={styles.invitation}><h2>Website health</h2><p>Check SEO, speed, security, and accessibility, then export the report.</p><Link className={styles.textAction} href="/audit">Open website audit<ArrowRight size={16} /></Link></div>
          <div className={styles.invitation}><h2>Something missing?</h2><p>Tell us what you want to do, what you use today, and where it falls short.</p><button type="button" className={styles.textAction} onClick={() => navigate("help")}>Tell us what you need<ArrowRight size={16} /></button></div>
        </>}
      </div> : section === "work" ? <div className={styles.page}>
        <header className={styles.pageHeader}><p className={styles.eyebrow}>{readOnly ? "Shared with you" : current?.name}</p><h1>My work</h1><p>Your websites and saved work, ready to return to.</p></header>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search saved work</span><input type="search" placeholder="Find a website or saved work…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {busy ? <p role="status">Loading your work…</p> : workList()}
        {!busy && !visibleWork.length && !visibleSites.length && <div className={styles.empty}><h2>{query ? "No matching work" : "Your work will be here."}</h2><p>{query ? "Try a different name." : "Start with a business assessment, or open a website connected to your account."}</p><button className={styles.textAction} onClick={() => query ? setQuery("") : navigate("products")}>{query ? "Clear search" : "Explore what’s available"}<ArrowRight size={16} /></button></div>}
      </div> : <div className={styles.home}>
        <header className={styles.welcome}><p className={styles.eyebrow}>{readOnly ? "Shared with you" : "Your Strelva"}</p><h1>{readOnly ? "Take a closer look." : "What would you like to work on?"}</h1><p>{readOnly ? "Review the work shared with you. Its owner controls access." : "Something new, or something you’re ready to improve."}</p></header>
        <div className={styles.starts}>
          <button type="button" onClick={() => { setProductId("ai_visibility"); setSection("products"); }}><FileSearch size={21} strokeWidth={1.5} /><span><strong>Check a business</strong><small>See what AI can understand</small></span><ArrowRight size={16} /></button>
          {inquiryBusinesses.length > 0 && onInquiry ? <button type="button" onClick={() => inquiryBusinesses.length === 1 ? openInquiry(inquiryBusinesses[0]!.id) : openStart()}><MessageSquareText size={21} strokeWidth={1.5} /><span><strong>Handle customer inquiries</strong><small>{inquiryBusinesses.length === 1 ? "Move one request forward" : "Choose a business first"}</small></span><ArrowRight size={16} /></button> : null}
          {onTracker && products.some((item) => item.id === "tracker" && item.availability === "available") ? <button type="button" onClick={() => onTracker()}><Table2 size={21} strokeWidth={1.5} /><span><strong>Build a tracker</strong><small>Turn a CSV into working data</small></span><ArrowRight size={16} /></button> : null}
          <button type="button" onClick={() => navigate(sites.length ? "work" : "products")}><Globe2 size={21} strokeWidth={1.5} /><span><strong>{sites.length ? "Update your website" : "Explore Strelva"}</strong><small>{sites.length ? "Open your connected sites" : "Find a useful product"}</small></span><ArrowRight size={16} /></button>
        </div>
        <section className={styles.recent} aria-labelledby="recent-title"><div className={styles.sectionHeading}><h2 id="recent-title">{readOnly ? "Shared work" : "Pick up where you left off"}</h2>{(snapshot.work.length > 0 || sites.length > 0) && <button type="button" onClick={() => navigate("work")}>View all<ArrowRight size={14} /></button>}</div>{busy ? <p role="status">Loading your work…</p> : workList(4)}{!busy && !snapshot.work.length && !sites.length && <p className={styles.emptyNote}>Your saved work will appear here. You don’t need a managed service to begin.</p>}</section>
        {managedWorkUnavailable && <p role="status" className={styles.emptyNote}>Some websites could not be loaded. Your saved assessments remain available. <Link href="/account?managed=1">Check website access</Link></p>}
        <div className={styles.homeFoot}><span>Built in Buffalo. Open to what comes next.</span><button type="button" onClick={() => navigate("help")}>What would make this more useful?<ArrowRight size={14} /></button></div>
      </div>}
    </div>
  </StrelvaShell>;
}
