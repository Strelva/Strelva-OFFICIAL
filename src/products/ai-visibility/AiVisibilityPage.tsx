"use client";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { StPage, StHead, StPill, StTextField, StCopy, StNotice, StSteps, StSection } from "@/components/ui/strelva/Kit";
import styles from "./answer-check.module.css";
import { AiVisibilityResultView } from "./AiVisibilityResultView";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import type { AiVisibilityResult } from "./contracts";
import { workspaceHistoryState } from "@/platform/workspaces/location";

type ScanState = "idle" | "scanning" | "done" | "error";

interface AuditResponse extends AiVisibilityResult {
  scanId: string | null;
  shareUrl: string | null;
}

interface AiVisibilityPageProps {
  initialResult?: AiVisibilityResult;
  agency?: AgencyAttribution;
  embedded?: boolean;
  scanId?: string;
  /** The server decides whether private workspace continuation is open. */
  workspaceEnabled?: boolean;
}

function acquisitionSource(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const campaign = params.get("utm_source") || params.get("ref");
  if (campaign) return campaign;
  if (!document.referrer) return undefined;
  try {
    return new URL(document.referrer).hostname;
  } catch {
    return undefined;
  }
}

export function AiVisibilityPage({ initialResult, scanId: initialScanId, workspaceEnabled = false, agency, embedded = false }: AiVisibilityPageProps) {
  const [business, setBusiness] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<ScanState>(initialResult ? "done" : "idle");
  const [result, setResult] = useState<AiVisibilityResult | null>(initialResult ?? null);
  const [scanId, setScanId] = useState<string | null>(initialScanId ?? null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"business" | "url" | null>(null);
  const errorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const businessRef = useRef<HTMLInputElement>(null);
  const previousState = useRef(state);
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    if (state === "scanning" || state === "done") headingRef.current?.focus();
    else businessRef.current?.focus();
  }, [state]);

  async function handleScan(event: FormEvent) {
    event.preventDefault();
    setInvalidField(null);
    const name = business.trim();
    if (!name) {
      setError("Enter your business name to run the check.");
      setInvalidField("business");
      return;
    }

    const cleanedUrl = url.trim();
    if (cleanedUrl) {
      const normalized = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
      try {
        new URL(normalized);
      } catch {
        setError("Please enter a valid website URL (e.g., example.com).");
        setInvalidField("url");
        return;
      }
    }

    setState("scanning");
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ai-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: name,
          url: cleanedUrl || undefined,
          category: category.trim() || undefined,
          city: city.trim() || undefined,
          source: acquisitionSource(),
          ...(agency ? { agency: agency.slug } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Check failed (${response.status})`);
      }

      const data: AuditResponse = await response.json();
      setResult(data);
      setScanId(data.scanId);
      if (data.scanId && /^scan_[a-z0-9]+$/i.test(data.scanId)) {
        const location = new URL(window.location.href);
        if (embedded) location.searchParams.set("scan", data.scanId);
        else {
          location.pathname = `/ai-visibility/${encodeURIComponent(data.scanId)}`;
          if (!agency) location.search = "";
        }
        window.history.replaceState(workspaceHistoryState(window.history.state), "", `${location.pathname}${location.search}`);
      }
      setShareUrl(data.shareUrl);
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check failed. Try again.");
      setState("error");
    }
  }

  function handleReset() {
    const location = new URL(window.location.href);
    if (embedded) location.searchParams.delete("scan");
    else { location.pathname = "/ai-visibility"; if (!agency) location.search = ""; }
    if (agency) location.searchParams.set("agency", agency.slug);
    window.history.replaceState(workspaceHistoryState(window.history.state), "", `${location.pathname}${location.search}`);
    setState("idle");
    setResult(null);
    setScanId(null);
    setShareUrl(null);
    setError("");
    setInvalidField(null);
  }

  return <StPage width={state === "done" ? "wide" : "column"} className={state === "idle" || state === "error" ? styles.entry : undefined}>
    {agency && state !== "done" ? <OwnerBrandIdentity brand={{ ...STRELVA_BRAND, agencyId: agency.workspaceId, name: agency.name, logoUrl: agency.brand.logoUrl, accentColor: agency.brand.accentColor ?? STRELVA_BRAND.accentColor, replyTo: agency.replyTo ?? null }} /> : null}
    {(state === "idle" || state === "error") ? <>
      <StHead title="Ask Gemini about your business." meta="See whether it names your business, and what your website makes readable. Free, no account." />
      <form onSubmit={handleScan} className={styles.form} aria-describedby={error ? errorId : undefined}>
        <div className={styles.address}><StTextField label="Website" id="website" inputMode="url" autoComplete="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="example.com" aria-invalid={invalidField === "url" || undefined} aria-describedby={invalidField === "url" ? errorId : undefined} /><StPill type="submit" size="lg">Check</StPill></div>
        <StTextField label="Business name" id="business-name" ref={businessRef} required autoComplete="organization" value={business} onChange={event => setBusiness(event.target.value)} aria-invalid={invalidField === "business" || undefined} aria-describedby={error && invalidField !== "url" ? errorId : undefined} description="Gemini needs your business name to check whether it appears in an answer." />
        <details><summary>Make the question more specific</summary><div className={styles.details}><StTextField label="Business category" value={category} onChange={event => setCategory(event.target.value)} placeholder="Your service" /><StTextField label="City and state" autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} /></div></details>
        {error ? <div id={errorId}><StNotice tone="critical">{error}</StNotice></div> : null}
        <StCopy muted>Strelva reads your website and asks Gemini once when the live check is available. The result says which checks completed.</StCopy>
      </form>
      <StSection title="What you get back"><StCopy>What your website makes readable, whether Gemini names you in one sampled answer, and the one fix to start with.</StCopy></StSection>
    </> : null}
    {state === "scanning" ? <><StHead titleRef={headingRef} title={`Checking ${business}`} meta="Your website stays unchanged." /><StSteps label="Business check" steps={[{ title: "Reading the public website", state: "active" }, { title: "Checking one Gemini answer when available", state: "pending" }, { title: "Finding the first fix", state: "pending" }]} /></> : null}
    {state === "done" && result ? <AiVisibilityResultView headingRef={headingRef} result={result} scanId={scanId} shareUrl={shareUrl} workspaceEnabled={workspaceEnabled} onReset={handleReset} /> : null}
  </StPage>;
}
