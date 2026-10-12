import { getAiVisibilityResult, parseAiVisibilityAssessmentPayload } from "@/products/ai-visibility/server";
import { getPublicWebsiteAudit } from "@/products/website-audit/server";

function checkAsk(summary: string, url: string | undefined, id: string): string {
  const source = `\n${url ? `Website: ${url}\n` : ""}Saved check: ${id}`;
  const room = 3000 - source.length;
  return `${summary.length > room ? `${summary.slice(0, room - 1)}…` : summary}${source}`;
}
export async function readSetupCheck(id: string): Promise<{ businessName: string; request: string } | null> {
  if (/^scan_[a-z0-9]{1,251}$/i.test(id)) {
    const stored = await getAiVisibilityResult(id);
    const result = stored?.id === id ? parseAiVisibilityAssessmentPayload(stored.result) : null;
    if (!result) return null;
    return { businessName: result.business.slice(0, 120), request: checkAsk(`Start with this fix for ${result.business}: ${result.topFix}`, result.url, id) };
  }
  if (/^audit_[a-f0-9]{32}$/.test(id)) {
    const result = await getPublicWebsiteAudit(id);
    if (!result) return null;
    const checks = result.categories.flatMap(category => category.checks).filter(check => check.status !== "pass");
    const first = checks.find(check => check.priority === "high") ?? checks[0];
    return { businessName: "", request: checkAsk(`Start with this website fix: ${first ? `${first.name}. ${first.message}` : "Review the saved website check and choose the next improvement."}`, result.url, id) };
  }
  return null;
}
