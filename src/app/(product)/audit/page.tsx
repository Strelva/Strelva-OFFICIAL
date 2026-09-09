import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import type { Metadata } from "next";
import { getPublicWebsiteAudit } from "@/products/website-audit/server";
import { WebsiteAuditPage } from "@/products/website-audit";
export const metadata: Metadata = { title: "Website audit", description: "Check website health and export the findings. No signup required." };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reportId = typeof params.report === "string" ? params.report : null;
  const result = reportId ? await getPublicWebsiteAudit(reportId) : null;
  return <WebsiteAuditPage workspaceEnabled={workspaceReleaseEnabled()} initialUrl={typeof params.url === "string" ? params.url.slice(0, 2048) : ""}
    initialResult={result || undefined} initialReportId={result ? reportId || undefined : undefined}
    initialError={reportId && !result ? "This report has expired or is unavailable. Run another audit, or open your saved copy in My work." : undefined} />;
}
