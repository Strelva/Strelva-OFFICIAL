"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, CircleHelp, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  InquiryAttentionSummary,
  InquiryPatternSummary,
  InquiryPortfolio,
} from "@/products/inquiries/contracts";
import type { InquirySurfaceSnapshot } from "./contracts";
import { useInquiry } from "./context";
import styles from "./inquiry.module.css";

type PortfolioState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; portfolio: InquiryPortfolio };

function previewPortfolio(snapshot: InquirySurfaceSnapshot): InquiryPortfolio {
  const attention: InquiryAttentionSummary[] = snapshot.state.requests
    .filter((work) => ["planned", "ready_to_publish", "failed"].includes(work.state))
    .map((work) => ({
      tenantId: snapshot.business.id,
      businessId: snapshot.business.id,
      businessName: snapshot.business.name,
      workId: work.id,
      title: work.intent,
      state: work.state as InquiryAttentionSummary["state"],
      requiredDecision: work.state === "planned" ? "Review the plan" : work.state === "ready_to_publish" ? "Approve or revise the change" : "Review the failure",
      updatedAt: work.updatedAt,
    }));
  const patterns: InquiryPatternSummary[] = (snapshot.patterns ?? []).map((pattern) => ({
    id: pattern.id,
    sourceTenantId: snapshot.business.id,
    sourceBusinessId: pattern.sourceBusinessId,
    sourceBusinessName: snapshot.business.name,
    name: pattern.name,
    version: pattern.provenVersion,
    cleanReceiptCount: pattern.cleanReceiptCount,
  }));
  return { attention, patterns, unavailableTenantIds: [] };
}

function usePortfolio() {
  const { snapshot } = useInquiry();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<PortfolioState>({ status: "loading" });
  const fixture = useMemo(() => snapshot.rehearsal ? previewPortfolio(snapshot) : null, [snapshot]);

  useEffect(() => {
    if (snapshot.rehearsal) return;
    const controller = new AbortController();
    void fetch("/api/inquiry-workspace/portfolio", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => null) as (InquiryPortfolio & { error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || "Your business portfolio could not be loaded.");
      if (!body || !Array.isArray(body.attention) || !Array.isArray(body.patterns) || !Array.isArray(body.unavailableTenantIds)) {
        throw new Error("Your business portfolio returned an incomplete response.");
      }
      if (!controller.signal.aborted) setState({ status: "ready", portfolio: body });
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setState({ status: "error", message: cause instanceof Error ? cause.message : "Your business portfolio could not be loaded." });
    });
    return () => controller.abort();
  }, [retry, snapshot.rehearsal]);

  return {
    state: fixture ? { status: "ready" as const, portfolio: fixture } : state,
    retry: () => { setState({ status: "loading" }); setRetry((value) => value + 1); },
  };
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  const { navigate } = useInquiry();
  return <header className={styles.pageIntro}>
    <span className={styles.eyebrow}>{eyebrow}</span>
    <div className={styles.introLine}><h1 className="font-display">{title}</h1><button className={styles.backButton} type="button" onClick={() => navigate("home")}><ArrowLeft size={15} aria-hidden="true" />Home</button></div>
    <p>{description}</p>
  </header>;
}

function PortfolioStatus({ state, retry }: { state: PortfolioState; retry: () => void }) {
  if (state.status === "loading") return <section className={styles.missingEvidence} role="status"><CircleHelp size={18} aria-hidden="true" /><h2 className="font-display">Loading your businesses…</h2><p>Checking the inquiry work you can currently access.</p></section>;
  if (state.status === "error") return <section className={styles.missingEvidence} role="alert"><CircleHelp size={18} aria-hidden="true" /><h2 className="font-display">Your businesses could not be loaded.</h2><p>{state.message}</p><button type="button" className={styles.secondaryButton} onClick={retry}><RefreshCw size={15} aria-hidden="true" />Try again</button></section>;
  return null;
}

function attentionHref(basePath: string, item: InquiryAttentionSummary): string {
  const path = basePath.split("?")[0] ?? basePath;
  if (path.startsWith("/preview/")) {
    const params = new URLSearchParams({ view: "work", request: item.workId });
    return `${path}?${params.toString()}`;
  }
  if (path === "/workspace") {
    const current = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    const workspace = current?.get("workspaceId");
    if (workspace) params.set("workspaceId", workspace);
    params.set("view", "inquiries");
    params.set("tenantId", item.tenantId);
    params.set("inquiryView", "work");
    params.set("inquiryRequest", item.workId);
    return `/workspace?${params.toString()}`;
  }
  const params = new URLSearchParams({ view: "work", request: item.workId });
  return `/business/${encodeURIComponent(item.tenantId)}?${params.toString()}`;
}

export function InquiryAttentionView() {
  const { basePath, snapshot, navigate } = useInquiry();
  const { state, retry } = usePortfolio();
  const [index, setIndex] = useState(0);
  const items = state.status === "ready" ? state.portfolio.attention : [];
  const current = items[Math.min(index, Math.max(0, items.length - 1))];
  return <div className={styles.page}>
    <PageHeader eyebrow="ATTENTION" title="One business decision at a time." description="Only inquiry work from businesses you can currently access appears here." />
    <PortfolioStatus state={state} retry={retry} />
    {state.status === "ready" && state.portfolio.unavailableTenantIds.length > 0 ? <p className={styles.readOnlyCopy} role="status">Some businesses could not be checked. Their work is not shown.</p> : null}
    {state.status === "ready" && !current ? <section className={styles.missingEvidence}><CircleHelp size={18} aria-hidden="true" /><h2 className="font-display">Nothing needs your decision.</h2><p>No accessible inquiry work is waiting for review.</p></section> : null}
    {current ? <section className={styles.attentionPanel} aria-labelledby="portfolio-attention-title">
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>NEXT DECISION</span><h2 id="portfolio-attention-title" className="font-display">{current.title}</h2><p>{current.businessName} · {current.requiredDecision}</p></div><span className={styles.rowStatus} data-state={current.state}>{current.state.replaceAll("_", " ")}</span></div>
      <a className={styles.primaryButton} href={attentionHref(basePath, current)} onClick={(event) => { if (snapshot.rehearsal) { event.preventDefault(); navigate("work", { requestId: current.workId }); } }}>Open this work</a>
      <div className={styles.receiptActions} aria-label="Browse decisions"><button className={styles.textButton} type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index <= 0}><ChevronLeft size={15} aria-hidden="true" />Previous</button><span>{Math.min(index + 1, items.length)} of {items.length}</span><button className={styles.textButton} type="button" onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))} disabled={index >= items.length - 1}>Next<ChevronRight size={15} aria-hidden="true" /></button></div>
    </section> : null}
  </div>;
}

export function InquiryPatternsView() {
  const { snapshot, navigate, perform, pending, can } = useInquiry();
  const { state, retry } = usePortfolio();
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const patterns = state.status === "ready" ? state.portfolio.patterns : [];
  async function apply(event: FormEvent<HTMLFormElement>, pattern: InquiryPatternSummary) {
    event.preventDefault();
    const destination = destinations[pattern.id]?.trim();
    if (!destination || !can("canStart")) return;
    const result = await perform({ kind: "use-pattern", patternId: pattern.id, businessId: snapshot.business.id, destination, actorId: snapshot.business.role === "agency_member" ? "agency-member" : "business-owner" });
    if (result?.work) navigate("shape", { requestId: result.work.id });
  }
  return <div className={styles.page}>
    <PageHeader eyebrow="PATTERNS" title="Reuse an inquiry setup." description="Choose a setup from a business you can access. Check the wording and staff, then rehearse the new draft before making it live." />
    <PortfolioStatus state={state} retry={retry} />
    {state.status === "ready" && state.portfolio.unavailableTenantIds.length > 0 ? <p className={styles.readOnlyCopy} role="status">Some businesses could not be checked, so their patterns are not shown.</p> : null}
    {state.status === "ready" && patterns.length === 0 ? <section className={styles.missingEvidence}><CircleHelp size={18} aria-hidden="true" /><h2 className="font-display">No reusable patterns are available.</h2><p>A live inquiry shape will appear here after its source business can be checked.</p></section> : null}
    {patterns.length > 0 ? <section className={styles.patternsPanel} aria-labelledby="portfolio-patterns-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>AVAILABLE SHAPES</span><h2 id="portfolio-patterns-title" className="font-display">Choose a starting shape</h2></div></div><div className={styles.patternRows}>{patterns.map((pattern) => <form className={styles.patternRow} key={pattern.id} onSubmit={(event) => void apply(event, pattern)}><div><h3 className="font-display">{pattern.name}</h3><p>Source: {pattern.sourceBusinessName} · version {pattern.version}</p><small>{pattern.cleanReceiptCount} verified receipt{pattern.cleanReceiptCount === 1 ? "" : "s"}. Source permissions and staff routing are not copied.</small></div><label><span>Destination for {snapshot.business.name}</span><input type="email" required autoComplete="email" value={destinations[pattern.id] ?? ""} onChange={(event) => setDestinations((current) => ({ ...current, [pattern.id]: event.target.value }))} placeholder="team@example.com" disabled={pending || !can("canStart")} /></label><button type="submit" className={styles.primaryButton} disabled={pending || !can("canStart") || !destinations[pattern.id]?.trim()}>{pending ? "Preparing…" : "Copy to this business"}</button></form>)}</div></section> : null}
  </div>;
}
