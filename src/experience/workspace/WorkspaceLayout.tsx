"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, FileSearch, Globe2, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { discoveryProducts, sameAppHref, type ManagedWorkSummary } from "./WorkspaceProductDiscovery";
import { WorkspaceHelp } from "./WorkspaceHelp";
import styles from "./workspace-surface.module.css";

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
  onNew: () => void;
  onAgency: () => void;
  onChoose: (id: string) => void;
  onWorkspace: (id: string) => void;
  notice: ReactNode;
  children: ReactNode;
}

function initialSection(): StrelvaSection {
  if (typeof window === "undefined") return "home";
  const value = new URLSearchParams(window.location.search).get("view");
  return value === "products" || value === "work" || value === "help" ? value : "home";
}

export function WorkspaceLayout({ appBase, signOut, snapshot, managedWork = [], managedWorkUnavailable, home, agency, busy, selectedWork, onHome, onNew, onAgency, onChoose, onWorkspace, notice, children }: Props) {
  const [section, setSection] = useState<StrelvaSection>(initialSection);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  useEffect(() => {
    const restore = () => { setSection(initialSection()); setProductId(null); setQuery(""); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const products = discoveryProducts(snapshot.products);
  const product = products.find(item => item.id === productId);
  const normalized = query.trim().toLowerCase();
  const visibleWork = snapshot.work.filter(work => [work.title, work.payload?.business, work.payload?.url, work.auditPayload?.url].some(value => value?.toLowerCase().includes(normalized)));
  const sites = managedWork.flatMap(site => { const href = sameAppHref(site.href); return href ? [{ ...site, href }] : []; });
  const visibleSites = sites.filter(site => site.title.toLowerCase().includes(normalized));
  const person = snapshot.actor.email.split("@")[0] || "Your account";

  function navigate(next: StrelvaSection) {
    setSection(next); setProductId(null); setQuery(""); onHome();
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    url.searchParams.delete("work");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function openWork(id: string) {
    onChoose(id);
    const url = new URL(window.location.href); url.searchParams.set("work", id); url.searchParams.set("workspaceId", snapshot.workspaceId);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const recent = <>
    {sites.length > 0 && <section aria-label="Your websites"><h2>Websites</h2>{sites.map(site => <Link key={site.id} href={site.href} prefetch={false}><Globe2 size={16} aria-hidden="true" /><span>{site.title}</span></Link>)}</section>}
    {snapshot.work.length > 0 && <section aria-label="Recent work"><h2>Recent work</h2>{snapshot.work.slice(0, 8).map(work => <button key={work.id} type="button" onClick={() => openWork(work.id)} aria-current={!home && selectedWork?.id === work.id && !agency ? "page" : undefined}><FileSearch size={15} aria-hidden="true" /><span>{work.title}</span></button>)}</section>}
    {(current?.kind === "agency" || current?.kind === "customer" || snapshot.delegations.length > 0) && <section><h2>People</h2><button type="button" onClick={onAgency}><Building2 size={16} aria-hidden="true" /><span>Sharing & agency access</span></button></section>}
  </>;

  function workList(limit?: number) {
    const items = limit === undefined ? visibleWork : visibleWork.slice(0, limit);
    return <div className={styles.workList}>
      {visibleSites.map(site => <Link key={site.id} href={site.href} className={styles.workRow} prefetch={false}><Globe2 size={20} strokeWidth={1.5} /><span><strong>{site.title}</strong><small>Website · {site.relationship === "enterprise" ? "Enterprise service" : "Managed by Strelva"}</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>)}
      {items.map(work => <button key={work.id} type="button" className={styles.workRow} onClick={() => openWork(work.id)} aria-label={`Open ${work.title}`}><FileSearch size={20} strokeWidth={1.5} /><span><strong>{work.title}</strong><small>{work.auditPayload ? "Website audit" : work.payload ? "AI Visibility assessment" : "Saved work · view unavailable"} · {new Date(work.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
    </div>;
  }

  return <StrelvaShell appBase={appBase} signOut={signOut}
    active={home ? section : undefined}
    title={!home ? agency ? "People & access" : selectedWork ? "Your work" : "New assessment" : section === "home" ? "Strelva" : section === "products" ? "Explore" : section === "help" ? "Help & service" : "My work"}
    accountName={person} accountDetail={snapshot.actor.email}
    onNavigate={navigate} onStart={() => navigate("products")} navigation={recent}
    context={<label><span className="sr-only">Current workspace</span><select value={snapshot.workspaceId} disabled={busy} onChange={event => { setSection("home"); setProductId(null); setQuery(""); onWorkspace(event.target.value); }}>{snapshot.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}{item.access === "delegated_read" ? " · Read-only" : ""}</option>)}</select></label>}
    actions={!home ? <button type="button" onClick={agency ? () => navigate("home") : onAgency}>{agency ? "Back to home" : "Sharing & access"}</button> : undefined}
    notice={notice} contentId="workspace-main"
  >
    <div className={styles.scroll} aria-busy={busy || undefined}>
      {!home ? <div className={styles.detail}><button type="button" className={styles.back} onClick={() => navigate("work")}><ArrowLeft size={16} />Back to my work</button>{children}</div> : section === "help" ? <WorkspaceHelp workspaceName={current?.name} hasManagedService={sites.length > 0} onAgency={onAgency} /> : section === "products" ? <div className={styles.page}>
        {product ? <>
          <button type="button" className={styles.back} onClick={() => setProductId(null)}><ArrowLeft size={16} />All products</button>
          <header className={styles.pageHeader}><p className={styles.eyebrow}>{product.availability === "available" ? "Available to use" : product.availability === "managed" ? "Managed service" : "Not available yet"}</p><h1>{product.name}</h1><p>{product.description}</p></header>
          <div className={styles.productBody}>
            {product.id === "ai_visibility" ? <><h2>Understand what AI can find.</h2><p>Check a business, inspect the evidence, and keep the assessment in your work. Share a copy when you want someone else to use it.</p><p>This is an assessment at a point in time. It does not activate monitoring or change your website.</p><button className={styles.primaryAction} type="button" disabled={readOnly || product.availability !== "available"} onClick={onNew}>Check a business<ArrowRight size={17} /></button>{readOnly && <p>Switch to a workspace you own to create an assessment.</p>}</> : product.id === "managed_presence" ? <><h2>Your website, with the work around it.</h2><p>Open your website to work with its content, review changes, and see the connected information available for your business.</p>{sites.length ? workList(0) : <p>No managed website is connected to this account. You can ask Strelva about a build or an existing site.</p>}<button type="button" className={styles.secondaryAction} onClick={() => navigate("help")}>Talk about your website<ArrowRight size={17} /></button></> : <><h2>Home search on a brokerage’s own site.</h2><p>Home Finder is being prepared as a focused product for brokerage-branded search and inquiry delivery. It is not available to install from your account yet.</p><p>A live installation needs brokerage approval, permitted listing data, and verified inquiry delivery.</p><button type="button" className={styles.secondaryAction} onClick={() => navigate("help")}>Ask about Home Finder<ArrowRight size={17} /></button></>}
          </div>
        </> : <>
          <header className={styles.pageHeader}><p className={styles.eyebrow}>Strelva products</p><h1>More you can do.</h1><p>Start with something useful. Add to the business you already have.</p></header>
          <div className={styles.productList}>{products.map(item => <button type="button" key={item.id} className={styles.productRow} onClick={() => setProductId(item.id)}><span className={styles.productSymbol}>{item.id === "ai_visibility" ? <FileSearch size={26} strokeWidth={1.3} /> : <Globe2 size={26} strokeWidth={1.3} />}</span><span><strong>{item.name}</strong><p>{item.description}</p><small>{item.availability === "available" ? "Available · Free assessment" : item.availability === "managed" ? "For connected clients" : "Not available yet"}</small></span><ArrowRight size={18} aria-hidden="true" /></button>)}</div>
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
          <button type="button" onClick={() => navigate(sites.length ? "work" : "products")}><Globe2 size={21} strokeWidth={1.5} /><span><strong>{sites.length ? "Work on your website" : "Explore Strelva"}</strong><small>{sites.length ? "Open your connected sites" : "Find a useful product"}</small></span><ArrowRight size={16} /></button>
        </div>
        <section className={styles.recent} aria-labelledby="recent-title"><div className={styles.sectionHeading}><h2 id="recent-title">{readOnly ? "Shared work" : "Pick up where you left off"}</h2>{(snapshot.work.length > 0 || sites.length > 0) && <button type="button" onClick={() => navigate("work")}>View all<ArrowRight size={14} /></button>}</div>{busy ? <p role="status">Loading your work…</p> : workList(4)}{!busy && !snapshot.work.length && !sites.length && <p className={styles.emptyNote}>Your saved work will appear here. You don’t need a managed service to begin.</p>}</section>
        {managedWorkUnavailable && <p role="status" className={styles.emptyNote}>Some websites could not be loaded. Your saved assessments remain available. <Link href="/account?managed=1">Check website access</Link></p>}
        <div className={styles.homeFoot}><span>Built in Buffalo. Open to what comes next.</span><button type="button" onClick={() => navigate("help")}>What would make this more useful?<ArrowRight size={14} /></button></div>
      </div>}
    </div>
  </StrelvaShell>;
}
