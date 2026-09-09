import { createHash } from "node:crypto";
import { getAuditReport } from "@/lib/audit-report-store";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { runWorkspaceOperation, type WorkspaceActor } from "@/platform/workspaces";
import { parseWebsiteAudit } from "./work";

export async function getPublicWebsiteAudit(resultId: string) {
  if (!/^audit_[a-f0-9]{32}$/.test(resultId)) return null;
  return parseWebsiteAudit((await getAuditReport(resultId.slice(6)))?.result);
}

export async function savePublicWebsiteAudit({ actor, workspaceId, resultId }: { actor: WorkspaceActor; workspaceId: string; resultId: string }) {
  if (!/^audit_[a-f0-9]{32}$/.test(resultId)) throw new Error("Invalid audit report");
  const hash = createHash("sha256").update(JSON.stringify([actor.userId, workspaceId, resultId])).digest("hex");
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return runWorkspaceOperation({ actor, workspaceId, id,
    work: { productId: "website_audit", resourceKind: "website_audit_report", title: "Website audit", input: { sourceReportId: resultId } },
    run: async () => {
      const result = await getPublicWebsiteAudit(resultId);
      if (!result) { const error = new Error("Report unavailable"); error.name = "PublicWebsiteAuditUnavailableError"; throw error; }
      if (await isRateLimitedWindowedAsync(`workspace:public-import:${actor.userId}`, 10, 86400000)) { const error = new Error("Daily save limit reached"); error.name = "PublicAiVisibilityImportRateLimitError"; throw error; }
      return result;
    },
  });
}
