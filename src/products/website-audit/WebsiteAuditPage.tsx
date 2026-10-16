"use client";

/**
 * The free check (XA, designed from B3 "read the site" and B4 "is this
 * right"). One column of words on paper, the felt on the right. While the
 * check runs Pebble works on the site; when it lands, the felt holds the
 * site as Gemini reads it, with what was found and what was missing labelled
 * in place. The one ink pill carries the result forward (into a workspace,
 * or to the agency whose check this is). Nothing here changes the site.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { XaButton, XaButtonLink, XaField, XaHeadline, XaLabel, XaPage, XaPebbleScene, XaRow, XaRows, XaSays, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote } from "@/components/ui/strelva/xa/entry";
import styles from "./website-audit.module.css";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import { AiVisibilityResultView, AiVisibilitySignals } from "@/products/ai-visibility";
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

const checkState: Record<CheckStatus, { kind: "live" | "waits" | "down"; label: string }> = {
  pass: { kind: "live", label: "Passed" }, warn: { kind: "waits", label: "Needs attention" }, fail: { kind: "down", label: "Failed" },
};

function hostOf(value: string): string {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host.replace(/^www\./, ""); } catch { return value; }
}

function agencyBrand(agency: AgencyAttribution): OwnerBrand {
  return { ...STRELVA_BRAND, agencyId: agency.workspaceId, name: agency.name, logoUrl: agency.brand.logoUrl, accentColor: agency.brand.accentColor ?? STRELVA_BRAND.accentColor, replyTo: agency.replyTo ?? null };
}

/** One category as a disclosure: the row says how many checks need attention; opening it lists every check. */
function CategoryChecks({ category }: { category: CategoryResult }) {
  const [expanded, setExpanded] = useState(false);
  const checksId = useId();
  const open = category.checks.filter(check => check.status !== "pass").length;
  return <li className={styles.category}>
    <button type="button" className={styles.categoryRow} aria-expanded={expanded} aria-controls={checksId} onClick={() => setExpanded(!expanded)}>
      <span className={styles.categoryText}><span className={styles.categoryName}>{auditDisplayCopy(category.name)}</span><span className={styles.categoryDetail} data-tone={open ? "waits" : undefined}>{open ? `${open} of ${category.checks.length} need attention` : `All ${category.checks.length} passed`}</span></span>
      <span className={styles.categoryScore}>{category.score}/100</span>
      <span className={styles.categoryAction}>{expanded ? "Hide checks" : "See checks"}</span>
    </button>
    {expanded ? <ul id={checksId} className={styles.checks}>
      {category.checks.map((check, index) => <li key={`${check.name}-${index}`}>
        <span className={styles.checkHead}><span className={styles.checkName}>{auditDisplayCopy(check.name)}</span>{check.status === "pass" ? <span className={styles.passed}>Passed</span> : <XaStatus kind={checkState[check.status].kind} size="sm">{checkState[check.status].label}</XaStatus>}</span>
        <span className={styles.checkBody}>{auditDisplayCopy(check.message)}</span>
        {check.impact && check.status !== "pass" ? <span className={styles.checkBody}>{auditDisplayCopy(check.impact)}</span> : null}
        {check.details ? <span className={styles.checkMuted}>{auditDisplayCopy(check.details)}</span> : null}
      </li>)}
    </ul> : null}
  </li>;
}

export function WebsiteAuditPending({ url, headingRef }: { url: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const host = hostOf(url);
  return <>
    <XaHeadline ref={headingRef} quiet="Nothing on your site changes.">Checking {host}</XaHeadline>
    <XaWorking title="Reading the website and running its checks" steps={[
      { id: "read", label: `Reading the public pages of ${host}`, state: "active" },
      { id: "health", label: "Checking website health and one Gemini answer when available", state: "pending" },
      { id: "findings", label: "Preparing the findings", state: "pending" },
    ]} />
    <XaEntryNote>Results appear here when the check completes, usually within a minute.</XaEntryNote>
  </>;
}

/** The site as Gemini reads it: the felt's object once a check has landed. */
function ReadPage({ url, business, ai, aiError }: { url: string; business: string; ai: AiVisibilityResult | null; aiError: string }) {
  const host = hostOf(url);
  return <XaPage address={host} title={ai ? `What Gemini can read about ${ai.business}` : business || host} label={`${host}, as Gemini reads it`}>
    {ai?.signals.length ? <AiVisibilitySignals signals={ai.signals} />
      : <p className={styles.pageNote}>{ai ? "Readability was not measured for this site." : aiError ? `Gemini check unavailable: ${aiError}` : "This saved report has no Gemini section."}</p>}
  </XaPage>;
}

export function WebsiteAuditPage({ initialUrl = "", initialBusiness = "", initialCategory = "", initialCity = "", initialResult, initialReportId, initialAiResult, initialScanId, initialError, attributionError, workspaceEnabled = false, saved = false, agency, frame = "page", signedIn = false, mode, initialState }: {
  agency?: AgencyAttribution; initialUrl?: string; initialBusiness?: string; initialCategory?: string; initialCity?: string; initialResult?: AuditResult; initialReportId?: string; initialAiResult?: AiVisibilityResult; initialScanId?: string; initialError?: string; attributionError?: string; workspaceEnabled?: boolean; saved?: boolean;
  /** "embed" sits inside an iframe on the agency's own site: no frame, no felt. */
  frame?: "page" | "embed"; signedIn?: boolean; mode?: "light" | "dark";
  /** Preview fixtures only: open on the running state. */
  initialState?: "scanning";
}) {
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
  const [state, setState] = useState<ScanState>(initialState ?? (initialResult || initialAiResult ? "done" : "idle"));
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
      setError(err instanceof Error ? err.message : "The check didn’t finish. Try again.");
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
        // Popup blocked: fall back to a same-tab navigation.
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
  const summaryState = statuses.includes("fail") ? { kind: "down", label: "Some checks failed" } as const : statuses.includes("warn") ? { kind: "waits", label: "Needs attention" } as const : statuses.length ? { kind: "live", label: "Website checks passed" } as const : { kind: "draft", label: "No checks returned" } as const;
  const embed = frame === "embed";
  const brand = agency && !attributionError ? agencyBrand(agency) : undefined;
  const checkedAt = result ? new Date(result.scannedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const shownUrl = result?.url || aiResult?.url || url;
  const shownBusiness = aiResult?.business || result?.businessName || business;
  const resultsPrimary = !saved && Boolean(result) && Boolean((reportId && workspaceEnabled) || result?.agency);

  const form = attributionError
    ? <XaSays>{attributionError} Ask the agency for a working check link.</XaSays>
    : <form onSubmit={handleScan} aria-describedby={error ? errorId : undefined} className={styles.form}>
      <XaField label="Website address" aria-label="Website address" type="text" ref={addressRef} aria-invalid={invalidUrl || undefined} aria-describedby={error ? errorId : undefined} required value={url} onChange={event => setUrl(event.target.value)} placeholder="yourbusiness.com" autoComplete="url" inputMode="url" />
      <XaField label="Business name" id="business-name" ref={businessRef} required autoComplete="organization" value={business} onChange={event => setBusiness(event.target.value)} aria-invalid={invalidBusiness || undefined} aria-describedby={invalidBusiness ? errorId : undefined} hint="Gemini needs your business name to check whether it appears in an answer." />
      <div className={styles.pair}>
        <XaField label="What you do (optional)" value={category} onChange={event => setCategory(event.target.value)} placeholder="Family dentist" />
        <XaField label="City and state (optional)" autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} placeholder="Buffalo, NY" />
      </div>
      {error ? <p id={errorId} role="alert" className={styles.error}>{auditDisplayCopy(error)}</p> : null}
      <XaButton type="submit" variant="primary" size="lg" block>Check</XaButton>
    </form>;

  const idle = <>
    <XaHeadline quiet="And what your website gets wrong. Free, no account.">See whether Gemini names your business.</XaHeadline>
    {form}
    <XaEntryNote>Strelva reads the public website and asks Gemini once when available. Nothing on your site changes, and no monitoring starts.</XaEntryNote>
  </>;

  const done = <>
    <XaLabel>{result ? <>Your website check{checkedAt ? ` · ${checkedAt}` : ""}</> : "Your business check"}</XaLabel>
    {result ? <XaHeadline ref={headingRef} quiet={fixes.length ? `${fixes.length === 1 ? "One fix comes" : `${fixes.length} fixes come`} first.` : "Nothing urgent turned up."}>{hostOf(result.url)} scores {result.overallScore} out of 100.</XaHeadline>
      : <XaHeadline ref={headingRef} quiet="Website health could not be measured.">{shownBusiness ? `${shownBusiness}, as Gemini sees it.` : "Your business check."}</XaHeadline>}
    {result ? <XaStatus kind={summaryState.kind}>Grade {result.grade} · {summaryState.label}</XaStatus> : null}
    {!embed ? <div className={styles.phoneOnly}><ReadPage url={shownUrl || ""} business={shownBusiness} ai={aiResult} aiError={aiError} /></div> : null}
    {error && !result ? <XaSays>{error}</XaSays> : null}
    {websiteError ? <XaSays>Website check unavailable: {websiteError}</XaSays> : null}
    {result ? <>
      <section className={styles.section} aria-labelledby="audit-start">
        <XaLabel as="h2" id="audit-start">Start here</XaLabel>
        {fixes.length ? <XaRows label="First fixes">{fixes.map(fix => <XaRow key={`${fix.category}-${fix.name}`} title={auditDisplayCopy(fix.name)}
          detail={<>{auditDisplayCopy(fix.impact || fix.message)}{fix.quantified ? ` Estimated impact: ${auditDisplayCopy(fix.quantified)}.` : ""}</>}
          meta={auditDisplayCopy(fix.category)}
          action={fix.guides?.[0] ? <XaTextLink href={`/guides/${fix.guides[0].slug}`} aria-label={`How to fix: ${auditDisplayCopy(fix.guides[0].title)}`}>How to fix it</XaTextLink> : undefined} />)}</XaRows>
          : <p className={styles.quiet}>No fixes were flagged in the checks that completed.</p>}
      </section>
      <div className={styles.actions}>
        {saved ? <XaStatus kind="live">Saved privately to this workspace</XaStatus>
          : reportId && workspaceEnabled ? <XaButtonLink variant="primary" size="lg" href={`/workspace?save=${encodeURIComponent(reportId)}`}>Start with this fix</XaButtonLink>
            : result.agency ? <XaButtonLink variant="primary" size="lg" href={result.agency.contactUrl} target="_blank" rel="noopener noreferrer">Get this fixed by {result.agency.name}</XaButtonLink> : null}
        <XaButton variant="secondary" onClick={() => void handleDownloadReport()} busy={reportLoading}>{reportLoading ? "Preparing…" : "Save as PDF"}</XaButton>
        {!saved ? <XaTextLink onClick={handleReset}>Check another site</XaTextLink> : null}
      </div>
      {!saved && !(reportId && workspaceEnabled) && !result.agency ? <XaEntryNote>Saving to an account is unavailable for this result. You can still save it as a PDF.</XaEntryNote> : null}
      {result.agency && reportId && workspaceEnabled && !saved ? <XaEntryNote><XaTextLink href={result.agency.contactUrl}>Get this fixed by {result.agency.name}</XaTextLink></XaEntryNote> : null}
      <XaEntryNote>This check does not change your website or turn on monitoring.</XaEntryNote>
      {error ? <p role="alert" className={styles.error}>{auditDisplayCopy(error)}</p> : null}
      <section className={styles.section} aria-labelledby="audit-every">
        <XaLabel as="h2" id="audit-every">Every check</XaLabel>
        {result.categories.length ? <ul className={styles.categories} aria-label="Checks by area">{result.categories.map(category => <CategoryChecks key={category.slug} category={category} />)}</ul> : <p className={styles.quiet}>No category checks were returned.</p>}
      </section>
    </> : null}
    <section className={styles.section} id="ai-visibility" aria-labelledby="audit-gemini">
      <XaLabel as="h2" id="audit-gemini">What Gemini says</XaLabel>
      {aiResult ? <AiVisibilityResultView embedded result={aiResult} scanId={scanId} shareUrl={shareUrl} workspaceEnabled={workspaceEnabled} onReset={handleReset} primaryAction={!resultsPrimary && !saved && !result} showSignals={embed} />
        : <>
          <XaSays>{aiError ? `Gemini check unavailable: ${aiError}` : "Gemini visibility was not included in this saved report. Check again with your business name to include it."}</XaSays>
          {!saved ? <div><XaTextLink onClick={handleReset}>Run a complete check</XaTextLink></div> : null}
        </>}
    </section>
  </>;

  const body = state === "scanning" ? <WebsiteAuditPending url={url} headingRef={headingRef} /> : state === "done" ? done : idle;
  const host = hostOf(shownUrl || "");
  const felt: ReactNode = state === "done"
    ? <XaEntryFelt object={<ReadPage url={shownUrl || ""} business={shownBusiness} ai={aiResult} aiError={aiError} />} title={`Read from ${hostOf(shownUrl || "") || "your site"}.`}>What Gemini could read is checked. What is missing is where the fixes start.</XaEntryFelt>
    : state === "scanning"
      ? <XaEntryFelt pose="fixing" title={`Pebble is reading ${host || "your site"}.`}>Up to five public pages, then one question to Gemini. Nothing on your site changes.</XaEntryFelt>
      : <XaEntryFelt pose="fixing" title="Two checks, one answer.">Website health across speed, search, phones, structured data, security and accessibility. Then whether Gemini names your business when someone asks.</XaEntryFelt>;

  if (embed) return <div data-workspace-theme="linen" data-workspace-mode={mode} className={styles.embed}>
    {brand ? <p className={styles.embedBrand} data-agency-brand={brand.agencyId ?? undefined}>{state === "done" ? null : <XaPebbleScene pose="fixing" size={64} bare />}<span>Prepared by {brand.name}. Runs on Strelva.</span></p> : null}
    <div className={styles.embedColumn}>{body}</div>
  </div>;

  return <XaEntryFrame brand={brand} mode={mode} wide={state === "done"} label="Website and business check"
    end={<>{!brand ? <XaTextLink href="/agencies">For agencies</XaTextLink> : null}<XaTextLink href={signedIn ? "/workspace" : "/sign-in"}>{signedIn ? "Your workspace" : "Sign in"}</XaTextLink></>}
    phoneArt={state === "done" ? undefined : "fixing"}
    felt={felt}
    footnote={brand ? `Prepared by ${brand.name}.` : undefined}>
    {body}
  </XaEntryFrame>;
}
