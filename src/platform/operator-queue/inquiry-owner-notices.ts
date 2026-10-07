import { inquiryRecordsEnabled, inquiryRecordsRpc } from "@/platform/infra/inquiry-records";
import type { QueueItemRaw } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";

/** A projection for the operator's queue; no lead contents, new send, or
 * provider call. The queue's existing operator authorization is the boundary. */
export async function readInquiryOwnerNoticeIssues(tenantIds: string[], read = inquiryRecordsRpc): Promise<SourceRead> {
  const source = "Inquiry owner notices";
  if (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1") return { kind: "ops_alert", source, ok: true, rows: [] };
  try {
    const [tenantData, connectedData] = await Promise.all([
      read("list_inquiry_owner_notices_not_told", { p_tenant_ids: tenantIds }),
      inquiryRecordsEnabled() ? read("list_connected_inquiry_owner_notices_not_told", {}) : Promise.resolve([]),
    ]);
    if (!Array.isArray(tenantData) || !Array.isArray(connectedData)) throw new Error("Owner notices could not be read");
    const data = [...tenantData, ...connectedData];
    if (!Array.isArray(data)) throw new Error("Owner notices could not be read");
    const rows: QueueItemRaw[] = data.map((raw: Record<string, unknown>) => {
      if ((raw.tenantId !== null && typeof raw.tenantId !== "string") || typeof raw.inquiryId !== "string" || typeof raw.at !== "string"
        || (raw.tenantId === null && typeof raw.workspaceId !== "string")) throw new Error("Owner notice evidence is malformed");
      return { kind: "ops_alert", sourceRef: `inquiry-owner:${raw.tenantId ?? raw.connectedSiteId}:${raw.inquiryId}`, tenantId: raw.tenantId as string | null,
        workspaceId: typeof raw.workspaceId === "string" ? raw.workspaceId : null,
        title: raw.status === "bounced" || raw.status === "failed" ? "Owner not told: email bounced or failed" : "Owner not told: inquiry notice did not send",
        openedAt: raw.at, facts: { severity: "high" }, href: raw.tenantId ? `/admin/clients/${encodeURIComponent(String(raw.tenantId))}#needs-you`
          : `/workspace/inquiries?workspaceId=${encodeURIComponent(String(raw.workspaceId))}` };
    });
    return { kind: "ops_alert", source, ok: true, rows };
  } catch {
    return { kind: "ops_alert", source, ok: false, reason: "Inquiry owner notice evidence unavailable" };
  }
}
