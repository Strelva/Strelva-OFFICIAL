"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { AiVisibilityResultView } from "./AiVisibilityResultView";
import type { AiVisibilityResult } from "./contracts";

type ScanState = "idle" | "scanning" | "done" | "error";

interface AuditResponse extends AiVisibilityResult {
  scanId: string | null;
  shareUrl: string | null;
}

interface AiVisibilityPageProps {
  initialResult?: AiVisibilityResult;
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

export function AiVisibilityPage({ initialResult, scanId: initialScanId, workspaceEnabled = false }: AiVisibilityPageProps) {
  const [business, setBusiness] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<ScanState>(initialResult ? "done" : "idle");
  const [result, setResult] = useState<AiVisibilityResult | null>(initialResult ?? null);
  const [scanId, setScanId] = useState<string | null>(initialScanId ?? null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleScan(event: FormEvent) {
    event.preventDefault();
    const name = business.trim();
    if (!name) {
      setError("Enter your business name to run the audit.");
      return;
    }

    const cleanedUrl = url.trim();
    if (cleanedUrl) {
      const normalized = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
      try {
        new URL(normalized);
      } catch {
        setError("Please enter a valid website URL (e.g., example.com).");
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
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Audit failed (${response.status})`);
      }

      const data: AuditResponse = await response.json();
      setResult(data);
      setScanId(data.scanId);
      setShareUrl(data.shareUrl);
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit failed. Try again.");
      setState("error");
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setScanId(null);
    setShareUrl(null);
    setError("");
  }

  return (
    <div className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto max-w-[760px] pt-20 pb-16">
        <div className="motion-rise mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text">
            <ArrowLeft className="size-4" />
            Strelva
          </Link>
        </div>

        {(state === "idle" || state === "error") && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">Free AI visibility audit</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.94] tracking-normal text-m-text sm:text-5xl md:text-6xl">
              Can AI understand and surface your business?
            </h1>
            <p className="mt-5 max-w-[620px] text-[17px] leading-[1.7] text-m-text-2">
              Check how clearly your website explains your business to AI systems. When available, the result also includes one live Gemini citation check.
            </p>

            <form onSubmit={handleScan} className="mt-8 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="sr-only">Business name</span>
                <input id="business-name" type="text" value={business} onChange={(event) => setBusiness(event.target.value)} placeholder="Business name" autoComplete="organization" className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent" />
              </label>
              <label className="block">
                <span className="sr-only">Website</span>
                <input id="website" type="text" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com" autoComplete="url" inputMode="url" className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent" />
              </label>
              <label className="block">
                <span className="sr-only">Business category</span>
                <input id="business-category" type="text" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category (e.g. HVAC, dentist)" className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent" />
              </label>
              <label className="block">
                <span className="sr-only">City and state</span>
                <input id="city-state" type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="City (e.g. Buffalo, NY)" autoComplete="address-level2" className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent" />
              </label>
              <button type="submit" className="marketing-button-primary h-14 px-8 text-[15px] sm:col-span-2">
                Run my AI audit <ArrowRight className="size-4" />
              </button>
            </form>

            {error && <p role="alert" className="mt-4 rounded-lg border px-4 py-3 text-[13px]" style={{ color: "var(--m-danger)", borderColor: "color-mix(in oklch, var(--m-danger) 38%, transparent)", background: "color-mix(in oklch, var(--m-danger) 10%, transparent)" }}>{error}</p>}
            <p className="mt-4 text-[13px] text-m-text-3">Free. No signup required. Add your website for AI-readiness signals.</p>
          </div>
        )}

        {state === "scanning" && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">Auditing</p>
            <h2 className="mt-4 text-3xl font-semibold text-m-text sm:text-4xl">Checking AI visibility for {business}...</h2>
            <div className="mt-10 flex items-center gap-3 rounded-2xl border border-m-rule-soft bg-m-panel p-6">
              <Loader2 className="size-5 shrink-0 animate-spin text-m-accent" />
              <span className="text-[14px] text-m-text-2">Reading your site and checking AI-crawler access. A live Gemini result will be included when available.</span>
            </div>
          </div>
        )}

        {state === "done" && result && (
          <AiVisibilityResultView result={result} scanId={scanId} shareUrl={shareUrl} workspaceEnabled={workspaceEnabled} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}
