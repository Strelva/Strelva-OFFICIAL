"use client";

/**
 * The free check (XA, designed from B3 "read the site"). One column of words
 * on paper; the felt holds the one dominant object, the business's page as
 * the check reads it. While the check runs, the page shows what is being
 * looked for; when it lands, every fact and fix is marked in place there.
 * The column says one sentence, the first fix, and the one ink pill that
 * carries it forward (into a workspace, or to the agency whose check this
 * is). No scores, no grade: every check sits behind "See every check".
 * Nothing here changes the site.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { XaButton, XaButtonLink, XaField, XaHeadline, XaLabel, XaSays, XaStatus, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryPebbleLine } from "@/components/ui/strelva/xa/entry";
import { CheckPage, type CheckMark } from "./CheckPage";
import styles from "./website-audit.module.css";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import { AiVisibilityFollowUp, publicCopy } from "@/products/ai-visibility";
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

export function WebsiteAuditPending({ url, business, headingRef }: { url: string; business?: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  const host = hostOf(url);
  return <>
    <XaHeadline ref={headingRef} quiet="Up to five public pages, then one question to Gemini.">Checking {host}</XaHeadline>
    <XaWorking title="Reading the website and running its checks" steps={[
      { id: "read", label: `Reading the public pages of ${host}`, state: "active" },
      { id: "gemini", label: `Asking Gemini about ${business?.trim() || host}`, state: "active" },
    ]} />
    <XaEntryNote>Nothing on your site changes. Results land here, usually within a minute.</XaEntryNote>
  </>;
}

/** What the check looks for on every site; the page shows these while it reads. */
const LOOKING_FOR: readonly [string, string][] = [["name", "Business name"], ["address", "Address"], ["phone", "Phone"], ["hours", "Hours"], ["services", "Services"]];

function readingMarks(): CheckMark[] {
  return [...LOOKING_FOR.map(([id, label]) => ({ id, label, state: "reading" as const })), { id: "health", label: "Speed, search, phones, security and accessibility", state: "reading" as const }];
}

/** Gemini's readability signals as facts on the page. */
function factMarks(ai: AiVisibilityResult | null, details = true): CheckMark[] {
  return (ai?.signals ?? []).map(signal => ({ id: signal.id, label: publicCopy(signal.label), detail: details ? publicCopy(signal.detail) : undefined, state: signal.pass ? "found" as const : "missing" as const }));
}

/** Website fixes as numbered marks, with the area folded into the sentence. */
function fixMarks(fixes: ReturnType<typeof topFixes>): CheckMark[] {
  return fixes.map((fix, index) => ({ id: `${fix.category}-${fix.name}`, n: index + 1, state: "fix" as const,
    label: `${auditDisplayCopy(fix.category)}: ${auditDisplayCopy(fix.name)}`, detail: publicCopy(auditDisplayCopy(fix.message)) }));
}

function joinNames(names: string[]): string {
  return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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
  const [shared, setShared] = useState(false);
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
  const embed = frame === "embed";
  const brand = agency && !attributionError ? agencyBrand(agency) : undefined;
  const checkedAt = result ? new Date(result.scannedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const shownUrl = result?.url || aiResult?.url || url;
  const shownBusiness = aiResult?.business || result?.businessName || business;
  const host = hostOf(shownUrl || "");
  const resultAgency = result?.agency ?? aiResult?.agency;
  const passed = result ? result.categories.filter(category => category.checks.length && category.checks.every(check => check.status === "pass")).map(category => auditDisplayCopy(category.name)) : [];
  const [everyOpen, setEveryOpen] = useState(false);
  const everyId = useId();

  // The one ink pill: into a workspace with this check saved, or to the agency whose check this is.
  const continueHref = reportId && workspaceEnabled ? `/workspace?save=${encodeURIComponent(reportId)}`
    : scanId && workspaceEnabled ? `/workspace?save=${encodeURIComponent(scanId)}`
      : resultAgency?.contactUrl ?? (scanId ? `/access-request?ref=ai-visibility&scan=${encodeURIComponent(scanId)}` : null);
  const continueLabel = resultAgency && !(workspaceEnabled && (reportId || scanId)) ? `Get this fixed by ${resultAgency.name}` : "Start with this fix";

  async function handleShare() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setShared(true); } catch { setShared(false); }
  }

  const form = attributionError
    ? <>
      <XaSays>{agency ? `${agency.name}’s check link isn’t working right now. ` : "This agency check link isn’t working right now. "}{attributionError}</XaSays>
      {agency?.contactUrl ? <XaButtonLink href={agency.contactUrl} variant="primary" size="lg" block target="_blank" rel="noopener noreferrer">Contact {agency.name}</XaButtonLink>
        : <XaButton variant="primary" size="lg" block onClick={() => window.location.reload()}>Try the link again</XaButton>}
      <XaEntryNote>Ask the agency for a working check link. Nothing was checked or saved.</XaEntryNote>
    </>
    : <form onSubmit={handleScan} aria-describedby={error ? errorId : undefined} className={styles.form}>
      {error ? <div id={errorId} role="alert"><XaSays>{auditDisplayCopy(error)}</XaSays></div> : null}
      <XaField label="Website address" aria-label="Website address" type="text" ref={addressRef} aria-invalid={invalidUrl || undefined} aria-describedby={error ? errorId : undefined} required value={url} onChange={event => setUrl(event.target.value)} placeholder="yourbusiness.com" autoComplete="url" inputMode="url" />
      <XaField label="Business name" id="business-name" ref={businessRef} required autoComplete="organization" value={business} onChange={event => setBusiness(event.target.value)} aria-invalid={invalidBusiness || undefined} aria-describedby={invalidBusiness ? errorId : undefined} hint="Gemini needs your business name to check whether it appears in an answer." />
      <div className={styles.pair}>
        <XaField label="What you do (optional)" value={category} onChange={event => setCategory(event.target.value)} placeholder="Family dentist" />
        <XaField label="City and state (optional)" autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} placeholder="Buffalo, NY" />
      </div>
      <XaButton type="submit" variant="primary" size="lg" block>{state === "error" || (initialError && error === initialError) ? "Check again" : "Check"}</XaButton>
    </form>;

  const idle = <>
    <XaHeadline quiet="And what your website gets wrong. Free, no account.">See whether Gemini names your business.</XaHeadline>
    {form}
    {attributionError ? null : <XaEntryNote>Strelva reads the public website and asks Gemini once when available. Nothing on your site changes, and no monitoring starts.</XaEntryNote>}
  </>;

  // The dominant object once a check lands. Website failed: only Gemini's facts, labelled as Gemini's.
  const page = result
    ? <CheckPage address={host} title={shownBusiness || host} source={aiResult?.signals.length ? `Read from ${host}` : `Read from ${host}. Gemini wasn’t part of this check.`}
      facts={factMarks(aiResult)} fixes={fixMarks(fixes)} note={fixes.length ? undefined : "No fixes were flagged in the checks that completed."} />
    : <CheckPage address={host} title={shownBusiness || host} source="From Gemini’s answer, not your site" label={`${shownBusiness || host}, as Gemini’s answer describes it`}
      facts={factMarks(aiResult, false)} note={aiResult?.signals.length ? undefined : "Gemini’s answer didn’t include the site’s details."} />;

  const missing = aiResult?.signals.filter(signal => !signal.pass).length ?? 0;
  const count = fixes.length;
  const headline = result
    ? count ? `${count} ${count === 1 ? "thing" : "things"} to fix on ${host}.` : `Nothing urgent turned up on ${host}.`
    : `${shownBusiness || host}, as Gemini sees it.`;
  const quiet = result
    ? aiResult ? publicCopy(aiResult.verdict) : "Gemini wasn’t part of this check."
    : `Couldn’t open ${host}, so only Gemini’s answer is here.`;
  const first = fixes[0];

  const done = <>
    <XaLabel>{result ? <>Your website check{checkedAt ? ` · ${checkedAt}` : ""}</> : "Your business check"}</XaLabel>
    <XaHeadline ref={headingRef} quiet={quiet}>{headline}</XaHeadline>
    {embed ? page : <div className={styles.phoneOnly}>{page}</div>}
    {!result && websiteError ? <XaSays>Website check unavailable: {websiteError}</XaSays> : null}
    {first ? <section className={styles.first} aria-labelledby="audit-start">
      <XaLabel as="h2" id="audit-start">Start here · fix 1</XaLabel>
      <p className={styles.firstTitle}>{auditDisplayCopy(first.name)}</p>
      <p className={styles.quiet}>{publicCopy(auditDisplayCopy(first.impact || first.message))}</p>
      {first.guides?.[0] ? <div><XaTextLink href={`/guides/${first.guides[0].slug}`}>How to fix it</XaTextLink></div> : null}
    </section> : !result && aiResult ? <section className={styles.first} aria-labelledby="audit-start">
      <XaLabel as="h2" id="audit-start">Start here</XaLabel>
      <p className={styles.firstTitle}>{publicCopy(aiResult.topFix)}</p>
    </section> : null}
    <div className={styles.actions}>
      {saved ? <XaStatus kind="live">Saved privately for your business</XaStatus>
        : continueHref && (first || !result) ? <XaButtonLink variant="primary" size="lg" href={continueHref} target={continueHref.startsWith("http") ? "_blank" : undefined} rel={continueHref.startsWith("http") ? "noopener noreferrer" : undefined}>{continueLabel}</XaButtonLink> : null}
      {result ? <XaButton variant="secondary" onClick={() => void handleDownloadReport()} busy={reportLoading}>{reportLoading ? "Preparing…" : "Save as PDF"}</XaButton> : null}
    </div>
    {!saved && result && !continueHref ? <XaEntryNote>Saving to an account is unavailable for this result. You can still save it as a PDF.</XaEntryNote> : null}
    {error ? <p role="alert" className={styles.error}>{auditDisplayCopy(error)}</p> : null}
    {result && passed.length ? <p className={styles.quiet}>{joinNames(passed)} {passed.length === 1 ? "looks" : "look"} fine.</p> : null}
    {aiResult ? <section className={styles.answer} aria-labelledby="audit-gemini">
      <XaLabel as="h2" id="audit-gemini">{aiResult.citation.probed ? "What Gemini said, asked once" : "Gemini’s answer"}</XaLabel>
      <p className={styles.quiet}>{publicCopy(aiResult.citation.note)}{missing ? ` It couldn’t read ${missing === 1 ? "one fact" : `${missing} facts`} marked on the page.` : ""}</p>
    </section> : <XaEntryNote>{aiError ? `Gemini check unavailable: ${aiError}` : "Gemini was not included in this saved report. Check again with your business name to include it."}</XaEntryNote>}
    {scanId && !saved ? <AiVisibilityFollowUp scanId={scanId} agencyName={resultAgency?.name} /> : null}
    <p className={styles.links}>
      {result ? <XaTextLink onClick={() => setEveryOpen(!everyOpen)} aria-expanded={everyOpen} aria-controls={everyId}>{everyOpen ? "Hide every check" : "See every check"}</XaTextLink> : null}
      {shareUrl && scanId ? <XaTextLink onClick={() => void handleShare()}>{shared ? "Link copied" : "Send this to whoever runs your site"}</XaTextLink> : null}
      {!saved ? <XaTextLink onClick={handleReset}>{result && !aiResult ? "Run a complete check" : "Check another business"}</XaTextLink> : null}
    </p>
    {result && everyOpen ? <section id={everyId} className={styles.section} aria-label="Every check">
      {result.categories.length ? <ul className={styles.categories} aria-label="Checks by area">{result.categories.map(category => <CategoryChecks key={category.slug} category={category} />)}</ul> : <p className={styles.quiet}>No category checks were returned.</p>}
    </section> : null}
  </>;

  const body = state === "scanning" ? <WebsiteAuditPending url={url} business={business} headingRef={headingRef} /> : state === "done" ? done : idle;
  const scanningPage = <CheckPage address={hostOf(url) || "your site"} title={business.trim() || hostOf(url)} source="Reading now" facts={readingMarks()} />;
  const idlePage = <CheckPage address={hostOf(url) || "yourbusiness.com"} title={business.trim() || "Your business"} source="What the check looks for" facts={LOOKING_FOR.map(([id, label]) => ({ id, label, state: "waiting" as const })).concat([{ id: "health", label: "Speed, search, phones, security and accessibility", state: "waiting" as const }])} label="What the check reads on your site" />;
  const felt: ReactNode = state === "done"
    ? result
      ? <XaEntryFelt object={<>{page}{!aiResult ? <div className={styles.feltLine}><XaEntryPebbleLine>{aiError ? "Gemini didn’t answer this time." : "Gemini wasn’t part of this check."} <XaTextLink onClick={handleReset}>Run a complete check</XaTextLink></XaEntryPebbleLine></div>
        : <div className={styles.feltLine}><XaEntryPebbleLine>{count ? `The numbers match the fixes. Start with 1.` : "Nothing urgent. The page reads clearly."}</XaEntryPebbleLine></div>}</>} />
      : <XaEntryFelt pose="fixing" poseSize={180} object={<>{page}<div className={styles.feltLine}><XaEntryPebbleLine>Couldn’t open {host}. These facts come from Gemini’s answer.</XaEntryPebbleLine></div></>} />
    : state === "scanning"
      ? <XaEntryFelt pose="fixing" poseSize={180} object={<>{scanningPage}<div className={styles.feltLine}><XaEntryPebbleLine>Each fact gets marked here as it’s read.</XaEntryPebbleLine></div></>} />
      : attributionError
        ? <XaEntryFelt pose="fixing" title={agency ? `${agency.name}’s link needs a fix.` : "This agency link needs a fix."}>Nothing was checked, and nothing on any site changed.</XaEntryFelt>
        : error
          ? <XaEntryFelt pose="fixing" title="The check didn’t finish.">Run it again with the same website and business name. Nothing on your site changed.</XaEntryFelt>
          // Before a check: no idle Pebble. The page the check will read, with what it looks for; Pebble arrives to read it once it runs.
          : <XaEntryFelt object={<>{idlePage}<div className={styles.feltLine}><p className={styles.quiet}>Two checks, one answer: website health, then whether Gemini names your business when someone asks.</p></div></>} />;

  if (embed) return <div data-workspace-theme="linen" data-workspace-mode={mode} className={styles.embed}>
    {brand ? <p className={styles.embedBrand} data-agency-brand={brand.agencyId ?? undefined}><span>Prepared by {brand.name}. Runs on Strelva.</span></p> : null}
    <div className={styles.embedColumn}>{state === "scanning" ? <>{body}{scanningPage}</> : body}</div>
  </div>;

  return <XaEntryFrame brand={brand} brandCredit={false} mode={mode} wide={state === "done"} label="Website and business check"
    end={<>{!brand ? <XaTextLink href="/agencies">For agencies</XaTextLink> : null}<XaTextLink href={signedIn ? "/workspace" : "/sign-in"}>{signedIn ? "Your business" : "Sign in"}</XaTextLink></>}
    phoneSays={state === "scanning" ? "Reading the site now. Nothing on it changes." : state !== "done" && (error || attributionError) ? (attributionError ? "This agency link needs a fix." : "The check didn’t finish.") : undefined}
    felt={felt}
    footnote={brand ? `Prepared by ${brand.name}. Runs on Strelva.` : undefined}>
    {body}
  </XaEntryFrame>;
}
