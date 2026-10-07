import { notFound } from "next/navigation";
import { resolveAgencyAttribution } from "@/platform/agency-prospecting/server";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { getAiVisibilityResult } from "@/products/ai-visibility/server";
import { WebsiteAuditPage } from "@/products/website-audit";
import { getPublicWebsiteAudit } from "@/products/website-audit/server";

export default async function AgencyEmbed({ params, searchParams }: {
  params: Promise<{ slug: string; tool: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, tool } = await params;
  const query = await searchParams;
  const agency = await resolveAgencyAttribution(slug).catch(() => notFound());
  if (!agency || !["ai-visibility", "audit"].includes(tool)) notFound();
  if (tool === "ai-visibility") {
    const stored = typeof query.scan === "string" ? await getAiVisibilityResult(query.scan) : null;
    if (query.scan && (!stored || stored.result.agency?.workspaceId !== agency.workspaceId)) notFound();
    return <AiVisibilityPage agency={agency} embedded initialResult={stored?.result} scanId={stored?.id} />;
  }
  const report = typeof query.report === "string" ? await getPublicWebsiteAudit(query.report) : null;
  if (query.report && (!report || report.agency?.workspaceId !== agency.workspaceId)) notFound();
  return <WebsiteAuditPage agency={agency} initialResult={report ?? undefined} initialReportId={typeof query.report === "string" ? query.report : undefined} />;
}
