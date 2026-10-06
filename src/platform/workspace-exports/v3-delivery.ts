/**
 * Sends a finished export's download link through the one email path
 * (src/lib/email/send.ts). It goes only to the recipient the database chose
 * (the owner, or the owner recipient for an operator-started export) and is
 * subject to the same client-email switches as every other client email:
 * while client email is paused, nothing is sent and the operator is told.
 */
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { alert } from "@/lib/monitoring";
import type { V3Manifest } from "./v3";

export function workspaceExportLink(baseUrl: string, buildId: string, token: string): string {
  const url = new URL("/api/workspace-export/v3/download", baseUrl);
  url.searchParams.set("build", buildId);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function deliverWorkspaceExportLink(input: {
  buildId: string; token: string; deliverTo: string; workspaceId: string; manifest: V3Manifest; baseUrl: string;
}): Promise<"accepted" | "suppressed"> {
  const result = await sendEmailWithReceipt({
    audience: "client",
    to: input.deliverTo,
    subject: "Your Strelva export is ready",
    idempotencyKey: `workspace-export-${input.buildId}`,
    options: {
      preheader: "One download with your business's records. The link works for 7 days.",
      heading: "Your export is ready",
      paragraphs: [
        "This is everything Strelva holds for your business, in one download. The link works for 7 days.",
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
