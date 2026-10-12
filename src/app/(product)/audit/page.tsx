import { AgencyProspectingError, resolveAgencyAttribution } from "@/platform/agency-prospecting/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import type { Metadata } from "next";
import { getPublicWebsiteAudit } from "@/products/website-audit/server";
import { getAiVisibilityResult } from "@/products/ai-visibility/server";
import { WebsiteAuditPage } from "@/products/website-audit";
export const metadata: Metadata = { title: "Website and business check", description: "Check website health and whether Gemini names your business. No signup required." };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reportId = typeof params.report === "string" ? params.report : null;
  const scanId = typeof params.scan === "string" ? params.scan : null;
  const [websiteRead, aiRead] = await Promise.allSettled([
    reportId ? getPublicWebsiteAudit(reportId) : Promise.resolve(null),
    scanId ? getAiVisibilityResult(scanId) : Promise.resolve(null),
  ]);
  const result = websiteRead.status === "fulfilled" ? websiteRead.value : null;
  const aiStored = aiRead.status === "fulfilled" ? aiRead.value : null;
  let agency = result?.agency ?? aiStored?.result.agency;
  let attributionError: string | undefined;
  // Requested attribution is checked even when an existing report is supplied.
  // A foreign report cannot silently override the agency in an acquisition link.
  try {
    const requested = await resolveAgencyAttribution(params.agency);
    if (requested && ((result && (requested.workspaceId !== result.agency?.workspaceId || requested.slug !== result.agency?.slug))
      || (aiStored && (requested.workspaceId !== aiStored.result.agency?.workspaceId || requested.slug !== aiStored.result.agency?.slug)))) {
      throw new AgencyProspectingError("This report belongs to a different agency check.", 400);
    }
    if (result && aiStored && (result.agency?.workspaceId !== aiStored.result.agency?.workspaceId || result.agency?.slug !== aiStored.result.agency?.slug || aiStored.result.url && new URL(result.url).href !== new URL(aiStored.result.url).href)) {
      throw new AgencyProspectingError("These reports do not belong to the same business check.", 400);
    }
    agency = agency ?? requested;
  } catch (error) {
    attributionError = error instanceof AgencyProspectingError ? error.message : "This agency check is temporarily unavailable.";
  }
  const text = (key: string, max = 2048) => typeof params[key] === "string" ? params[key].slice(0, max) : "";
  return <WebsiteAuditPage agency={agency} attributionError={attributionError} workspaceEnabled={workspaceReleaseEnabled()}
    initialUrl={text("url") || result?.url || aiStored?.result.url || ""}
    initialBusiness={text("business", 200) || aiStored?.result.business || ""} initialCategory={text("category", 200)} initialCity={text("city", 200)}
    initialResult={!attributionError ? result || undefined : undefined} initialReportId={!attributionError && result ? reportId || undefined : undefined}
    initialAiResult={!attributionError ? aiStored?.result : undefined} initialScanId={!attributionError && aiStored ? scanId || undefined : undefined}
    initialError={(reportId && !result) || (scanId && !aiStored) ? "Part of this saved check has expired or is unavailable. Run another check, or open your saved copy in your workspace." : undefined} />;
}
