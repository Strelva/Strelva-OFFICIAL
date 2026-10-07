/**
 * Sends a finished export's download link through the one email path
 * (src/lib/email/send.ts). It goes only to the recipient the database chose
 * (the owner, or the owner recipient for an operator-started export) and is
 * subject to the same client-email switches as every other client email:
 * while client email is paused, nothing is sent and the operator is told.
 */
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { alert } from "@/platform/infra/monitoring";
import type { V3Manifest } from "./v3";

export function workspaceExportLink(baseUrl: string, buildId: string, token: string): string {
  const url = new URL("/api/workspace-export/v3/download", baseUrl);
  url.searchParams.set("build", buildId);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function deliverWorkspaceExportLink(input: {
  buildId: string; token: string; deliverTo: string; workspaceId: string; tenantIds: string[]; manifest: V3Manifest; baseUrl: string;
}): Promise<"accepted" | "suppressed"> {
  // New export sends are separately armed, then obey both global gates and
  // every linked site's kill switch. A per-tenant "on" cannot bypass rollout.
  let reason: string | null = null;
  if (process.env.STRELVA_EXPORT_LINK_EMAIL !== "1" || !emailSendingEnabled() || !customerEmailEnabled()) {
    reason = "export_link_email_disabled";
  } else {
    try {
      for (const tenantId of [...new Set(input.tenantIds)]) {
        if (await getClientEmailOverride(tenantId) === "off") { reason = "client_email_disabled"; break; }
      }
    } catch { reason = "client_email_gate_unavailable"; }
  }
  if (reason) {
    alert("workspace_export_link_not_sent", "high", { buildId: input.buildId, workspaceId: input.workspaceId, reason });
    return "suppressed";
  }
  const result = await sendEmailWithReceipt({
    audience: "client",
    to: input.deliverTo,
    subject: "Your Strelva export is ready",
    idempotencyKey: `workspace-export-${input.buildId}`,
    options: {
      preheader: "One download with your business's records. The link works for 7 days.",
      heading: "Your export is ready",
      paragraphs: [
        "Your business records are ready in one download. The manifest lists included and unavailable categories. The link works for 7 days.",
        "Passwords, tokens and card details are never included.",
      ],
      bullets: input.manifest.included.map((c) => ({ title: c.category.replace(/_/g, " "), text: `${c.count}` })),
      rows: input.manifest.unavailable.map((c) => ({ label: `Not included: ${c.category.replace(/_/g, " ")}`, value: c.reason })),
      button: { label: "Download your export", url: workspaceExportLink(input.baseUrl, input.buildId, input.token) },
    },
  });
  if (result.status !== "accepted") {
    alert("workspace_export_link_not_sent", "high", { buildId: input.buildId, workspaceId: input.workspaceId, reason: result.reason });
    return "suppressed";
  }
  return "accepted";
}
