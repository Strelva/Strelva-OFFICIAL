import type { AuditResult } from "@/platform/infra/audit-contracts";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import type { AiVisibilityResult } from "@/products/ai-visibility/client";
import { parseAiVisibilityAssessmentPayload } from "@/products/ai-visibility/client";
import { parseWebsiteAudit } from "./work";

/** One customer check, using the existing public transports and retained reports. */
export async function runPublicBusinessCheck(input: {
  url: string; business: string; category?: string; city?: string; agency?: AgencyAttribution;
}) {
  const attribution = input.agency ? { agency: input.agency.slug } : {};
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source") || params.get("ref") || undefined;
  async function post(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Check failed (${response.status})`);
    if (!data || typeof data !== "object") throw new Error("The check returned an unreadable result. Please try again.");
    // An attributed check must never silently become an unattributed report.
    if (input.agency && (data.agency?.slug !== input.agency.slug || data.agency?.workspaceId !== input.agency.workspaceId)) {
      throw new Error("The agency identity could not be confirmed. Ask the agency for a working check link.");
    }
    return data;
  }
  const [website, ai] = await Promise.allSettled([
    post("/api/audit/scan", { url: input.url, ...attribution }).then(data => {
      if (!parseWebsiteAudit(data)) throw new Error("The website check returned an unreadable result.");
      return data as AuditResult & { reportId?: string };
    }),
    post("/api/ai-visibility", { business: input.business, url: input.url, category: input.category || undefined, city: input.city || undefined, source, ...attribution }).then(data => {
      if (!parseAiVisibilityAssessmentPayload(data)) throw new Error("The Gemini check returned an unreadable result.");
      return data as AiVisibilityResult & { scanId?: string };
    }),
  ]);
  const websiteResult = website.status === "fulfilled" ? website.value : null;
  const aiResult = ai.status === "fulfilled" ? ai.value : null;
  const message = (reason: unknown) => reason instanceof Error ? reason.message : "This part of the check could not complete. Please try again.";
  return {
    website: websiteResult,
    ai: aiResult,
    reportId: websiteResult?.reportId && /^audit_[a-f0-9]{32}$/.test(websiteResult.reportId) ? websiteResult.reportId : null,
    scanId: aiResult?.scanId && /^scan_[a-z0-9]+$/i.test(aiResult.scanId) ? aiResult.scanId : null,
    websiteError: website.status === "rejected" ? message(website.reason) : "",
    aiError: ai.status === "rejected" ? message(ai.reason) : "",
  };
}

/** Preserve acquisition, input and attribution parameters on old entry links. */
export function businessCheckHref(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value)) for (const entry of value) query.append(key, entry);
  }
  return `/audit${query.size ? `?${query}` : ""}`;
}
