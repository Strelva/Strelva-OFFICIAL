"use client";

import { useEffect, useId, useRef, useState } from "react";
import { StCopy, StEmpty, StHead, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StState, StSteps, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import styles from "./website-audit.module.css";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";
import { AiVisibilityResultView } from "@/products/ai-visibility";
import type { AiVisibilityResult } from "@/products/ai-visibility/client";
import { runPublicBusinessCheck } from "./business-check";
import { withGeminiReportSection } from "./report";
import type { AuditResult, CheckStatus, CategoryResult } from "@/lib/audit/types";
import { topFixes } from "@/lib/audit/impact";
import { workspaceHistoryState } from "@/platform/workspaces/location";

type ScanState = "idle" | "scanning" | "done" | "error";

/** Presentation wording only. The retained report and API payload are unchanged. */
export function auditDisplayCopy(value: string): string {
  return value.replace(/\bAI[- ]readability\b/gi, "Readability for assistants")
    .replace(/\bAI[- ]ready\b/gi, "readable for assistants")
    .replace(/\bAI agents?\b/gi, "assistants")
    .replace(/\bAI\b/gi, "assistants")
    .replace(/\buser-agent\b/gi, "browser signature")
    .replace(/\bagents\b/gi, "assistants")
    .replace(/\bagent\b/gi, "assistant")
    .replace(/\bautomation\b/gi, "repeat actions")
    .replace(/\bworkflows?\b/gi, "process")
    .replace(/\btasks?\b/gi, "work");
}

const checkState: Record<CheckStatus, { kind: "live" | "need" | "down"; label: string }> = {
  pass: { kind: "live", label: "Passed" }, warn: { kind: "need", label: "Needs attention" }, fail: { kind: "down", label: "Failed" },
};

function CategoryChecks({ category }: { category: CategoryResult }) {
  const [expanded, setExpanded] = useState(false);
  const checksId = useId();
  return <StSection title={auditDisplayCopy(category.name)} meta={<StMono>{category.score}/100</StMono>} action={<StTextButton aria-expanded={expanded} aria-controls={checksId} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide checks" : "See checks"}</StTextButton>}>
    {expanded ? <div id={checksId}><StRows>{category.checks.map((check, index) => <StRow key={`${check.name}-${index}`} title={auditDisplayCopy(check.name)} detail={auditDisplayCopy(check.message)} end={<StState kind={checkState[check.status].kind}>{checkState[check.status].label}</StState>}>
      {check.impact && check.status !== "pass" ? <StCopy>{auditDisplayCopy(check.impact)}</StCopy> : null}
      {check.details ? <StCopy muted>{auditDisplayCopy(check.details)}</StCopy> : null}
    </StRow>)}</StRows></div> : null}
  </StSection>;
}

export function WebsiteAuditPending({ url, headingRef }: { url: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return <><StHead titleRef={headingRef} title="Checking your website" meta={<StMono>{url}</StMono>} /><div role="status"><StCopy>Reading the website and running its checks. Results appear when the scan completes.</StCopy><StSteps label="Website check" steps={[{ title: "Reading the public website", state: "active" }, { title: "Checking website health and one Gemini answer when available", state: "pending" }, { title: "Preparing the findings", state: "pending" }]} /></div></>;
}

export function WebsiteAuditPage({ initialUrl = "", initialBusiness = "", initialCategory = "", initialCity = "", initialResult, initialReportId, initialAiResult, initialScanId, initialError, attributionError, workspaceEnabled = false, saved = false, agency }: { agency?: AgencyAttribution; initialUrl?: string; initialBusiness?: string; initialCategory?: string; initialCity?: string; initialResult?: AuditResult; initialReportId?: string; initialAiResult?: AiVisibilityResult; initialScanId?: string; initialError?: string; attributionError?: string; workspaceEnabled?: boolean; saved?: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [business, setBusiness] = useState(initialBusiness);
  const [category, setCategory] = useState(initialCategory);
  const [city, setCity] = useState(initialCity);
  const [aiResult, setAiResult] = useState<AiVisibilityResult | null>(initialAiResult ?? null);
  const [scanId, setScanId] = useState<string | null>(initialScanId ?? null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState("");
  const [aiError, setAiError] = useState("");
  const [invalidBusiness, setInvalidBusiness] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [state, setState] = useState<ScanState>(initialResult || initialAiResult ? "done" : "idle");
  const [result, setResult] = useState<AuditResult | null>(initialResult || null);
  const [reportId, setReportId] = useState<string | null>(initialReportId || null);
  const [error, setError] = useState(initialError || "");
  const [invalidUrl, setInvalidUrl] = useState(false);
  const errorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const businessRef = useRef<HTMLInputElement>(null);
  const previousState = useRef(state);
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    if (state === "scanning" || state === "done") headingRef.current?.focus();
    else addressRef.current?.focus();
  }, [state]);
  const [reportLoading, setReportLoading] = useState(false);
  useEffect(() => {
    if (!scanId) { setShareUrl(null); return; }
    const share = new URL("/audit", window.location.origin);
    share.searchParams.set("scan", scanId);
    if (reportId) share.searchParams.set("report", reportId);
    if (agency) share.searchParams.set("agency", agency.slug);
    setShareUrl(share.href);
  }, [scanId, reportId, agency]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current || attributionError) return;
    setInvalidUrl(false);
    setInvalidBusiness(false);
    const cleaned = url.trim();
    if (!cleaned) return;

    // Client-side URL validation
    let normalizedUrl = cleaned;
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL (e.g., example.com)");
      setInvalidUrl(true);
      return;
    }

    if (!business.trim()) {
      setError("Enter your business name to run the check.");
      setInvalidBusiness(true);
      businessRef.current?.focus();
      return;
    }
    pending.current = true;
    setReportId(null);
    setScanId(null);
    setAiResult(null);
    setAiError("");
    setWebsiteError("");
    setState("scanning");
    setError("");
    setResult(null);

    try {
      const checked = await runPublicBusinessCheck({ url: cleaned, business: business.trim(), category: category.trim(), city: city.trim(), agency });
      if (!mounted.current) return;
      setResult(checked.website);
      setReportId(checked.reportId);
      setAiResult(checked.ai);
      setScanId(checked.scanId);
      setWebsiteError(checked.websiteError);
      setAiError(checked.aiError);
      if (!checked.website && !checked.ai) {
        throw new Error(checked.websiteError === checked.aiError ? checked.websiteError : `Website: ${checked.websiteError} Gemini: ${checked.aiError}`);
      }
      const location = new URL(window.location.href);
      location.searchParams.delete("report");
      location.searchParams.delete("scan");
      if (checked.reportId) location.searchParams.set("report", checked.reportId);
      if (checked.scanId) location.searchParams.set("scan", checked.scanId);
      window.history.replaceState(workspaceHistoryState(window.history.state), "", `${location.pathname}${location.search}`);
      setState("done");
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Scan failed. Try again.");
      setState("error");
    } finally {
      pending.current = false;
    }
  }

  function handleReset() {
    const location = new URL(window.location.href);
    location.searchParams.delete("report");
    location.searchParams.delete("scan");
    window.history.replaceState(workspaceHistoryState(window.history.state), "", `${location.pathname}${location.search}`);
    setReportId(null);
    setAiResult(null);
    setScanId(null);
    setAiError("");
    setWebsiteError("");
    setInvalidBusiness(false);
    setState("idle");
    setInvalidUrl(false);
    setResult(null);
    setError("");
    setUrl("");
  }

  // POST the current result to the report renderer and open the returned HTML
  // in a new tab so the user can print/save it as a PDF. Uses a blob URL so the
  // document is fully self-contained and never blocked by popup heuristics tied
  // to async document.write.
  async function handleDownloadReport() {
    if (!result || reportLoading) return;
    setReportLoading(true);
    try {
      const res = await fetch(result.agency ? `/api/audit/report?agency=${encodeURIComponent(result.agency.slug)}` : "/api/audit/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      const html = withGeminiReportSection(await res.text(), aiResult, aiError ? `Gemini check unavailable: ${aiError}` : undefined);
      const blob = new Blob([html], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup blocked — fall back to a same-tab navigation.
        window.location.href = blobUrl;
      }
      // Revoke after the new tab has had time to load the document.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setError("Could not generate the report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }

  const fixes = result ? topFixes(result.categories, 4) : [];
  const statuses = result?.categories.flatMap(category => category.checks.map(check => check.status)) ?? [];
  const summaryState = statuses.includes("fail") ? { kind: "down", label: "Some checks failed" } as const : statuses.includes("warn") ? { kind: "need", label: "Needs attention" } as const : statuses.length ? { kind: "live", label: "Website checks passed" } as const : { kind: "draft", label: "No checks returned" } as const;
  return <StPage className={state === "idle" || state === "error" ? styles.entry : undefined}>
    {agency && !attributionError ? <OwnerBrandIdentity brand={{ ...STRELVA_BRAND, agencyId: agency.workspaceId, name: agency.name, logoUrl: agency.brand.logoUrl, accentColor: agency.brand.accentColor ?? STRELVA_BRAND.accentColor, replyTo: agency.replyTo ?? null }} /> : null}
    {(state === "idle" || state === "error") ? <>
      <StHead title="Check your website and business" meta="See what needs fixing on your website and whether Gemini names your business. Free, no account." />
      {attributionError ? <StNotice tone="critical">{attributionError} Ask the agency for a working check link.</StNotice> : <form onSubmit={handleScan} aria-describedby={error ? errorId : undefined} className={styles.form}>
        <StTextField label="Website address" aria-label="Website address" type="text" ref={addressRef} aria-invalid={invalidUrl || undefined} aria-describedby={error ? errorId : undefined} required value={url} onChange={event => setUrl(event.target.value)} placeholder="example.com" autoComplete="url" inputMode="url" />
        <StTextField label="Business name" id="business-name" ref={businessRef} required autoComplete="organization" value={business} onChange={event => setBusiness(event.target.value)} aria-invalid={invalidBusiness || undefined} aria-describedby={invalidBusiness ? errorId : undefined} description="Gemini needs your business name to check whether it appears in an answer." />
        <StTextField label="Business category (optional)" value={category} onChange={event => setCategory(event.target.value)} placeholder="Your service" />
        <StTextField label="City and state (optional)" autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} />
        <div className={styles.actions}><StPill type="submit" size="lg">Check</StPill></div>
        {error ? <StNotice id={errorId} tone="critical">{auditDisplayCopy(error)}</StNotice> : null}
        <StCopy muted>Strelva reads the public website and asks Gemini once when available. This check does not change your site or turn on monitoring.</StCopy>
      </form>}
      <StSection title="What you get back"><StCopy>Checks for speed, search, mobile use, structured data, security and accessibility, with the first fixes to consider and a website report you can export. The same check includes whether Gemini names your business in one sampled answer.</StCopy></StSection>
    </> : null}
    {state === "scanning" ? <WebsiteAuditPending url={url} headingRef={headingRef} /> : null}
    {state === "done" ? <>
      {!result ? <StHead titleRef={headingRef} title="Your business check" meta="Website health could not be measured." /> : null}
      {error && !result ? <StNotice tone="need">{error}</StNotice> : null}
      {websiteError ? <StNotice tone="critical">Website check unavailable: {websiteError}</StNotice> : null}
      {result ? <>
      <StHead titleRef={headingRef} title="Your website check" meta={<><StMono>{result.url}</StMono> · checked <StMono>{new Date(result.scannedAt).toLocaleString()}</StMono></>} />
      <div className={styles.summary}><StMono tone="text" size="value">{result.overallScore}/100</StMono><StState kind={summaryState.kind}>Grade {result.grade} · {summaryState.label}</StState></div>
      <div className={styles.split}>
        <div className={styles.stack}>
          <StSection title="Start here">{fixes.length ? <StRows>{fixes.map(fix => <StRow key={`${fix.category}-${fix.name}`} kind={auditDisplayCopy(fix.category)} title={auditDisplayCopy(fix.name)} detail={auditDisplayCopy(fix.message)}>
            {fix.impact ? <StCopy>{auditDisplayCopy(fix.impact)}</StCopy> : null}
            {fix.quantified ? <StCopy muted>Estimated impact: {auditDisplayCopy(fix.quantified)}</StCopy> : null}
            {fix.guides?.map(guide => <StTextButton key={guide.slug} href={`/guides/${guide.slug}`}>Fix it: {auditDisplayCopy(guide.title)}</StTextButton>)}
          </StRow>)}</StRows> : <StEmpty>No fixes were flagged in the checks that completed.</StEmpty>}</StSection>
          <StCopy muted>This assessment does not change your website or activate monitoring.</StCopy>
          {saved ? <StState kind="live">Saved privately to this workspace</StState> : reportId && workspaceEnabled ? <StPillLink href={`/workspace?save=${reportId}`}>Save to my work</StPillLink> : <StCopy muted>Account saving is unavailable for this result. You can still export it.</StCopy>}
          {result.agency ? <StTextButton href={result.agency.contactUrl} target="_blank" rel="noopener noreferrer">Get this fixed by {result.agency.name}</StTextButton> : null}
          <div className={styles.actions}><StPill variant="soft" onClick={handleDownloadReport} busy={reportLoading}>{reportLoading ? "Preparing…" : "Save as PDF"}</StPill>{!saved ? <StTextButton onClick={handleReset}>Check another site</StTextButton> : null}</div>
          {error ? <StNotice tone="critical">{auditDisplayCopy(error)}</StNotice> : null}
        </div>
        <div className={styles.stack}>{result.categories.length ? result.categories.map(category => <CategoryChecks key={category.slug} category={category} />) : <StEmpty>No category checks were returned.</StEmpty>}</div>
      </div>
      </> : null}
      <StSection title="Gemini visibility" id="ai-visibility">
        {aiResult ? <AiVisibilityResultView result={aiResult} scanId={scanId} shareUrl={shareUrl} workspaceEnabled={workspaceEnabled} onReset={handleReset} /> : <>
          <StNotice tone="need">{aiError ? `Gemini check unavailable: ${aiError}` : "Gemini visibility was not included in this saved report. Check again with your business name to include it."}</StNotice>
          {!saved ? <StTextButton onClick={handleReset}>Run a complete check</StTextButton> : null}
        </>}
      </StSection>
    </> : null}
  </StPage>;
}
