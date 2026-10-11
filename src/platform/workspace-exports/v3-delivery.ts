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
import type { V3Manifest, V3Category } from "./v3";

/** Archive keys stay in the manifest; mail uses the owner's names. */
export const EXPORT_EMAIL_LABELS = {
  business_record: "Business details", systems: "Systems", linked_sites: "Websites", leads: "Inquiries", spam_held: "Held spam",
  inquiry_timelines: "Inquiry history", inquiry_first_replies: "Inquiry replies", business_payments: "Payments", payment_events: "Payment history",
  revenue_splits: "Payment sharing", split_payouts: "Shared payments", connected_merchant: "Payment account", payment_requests: "Quotes and deposits",
  payment_actions: "Payment actions", refund_requests: "Refund requests", transfer_receipts: "Transfer receipts", transfer_reversals: "Transfer reversals",
  platform_collections: "Platform payments", platform_collection_terms: "Platform payment terms", creator_version_paid_periods: "Paid Version periods",
  recovery_payouts: "Recovered payments", booking_config: "Booking rules", bookings: "Bookings", reviews: "Reviews", content: "Website content",
  billing: "Billing", orders: "Orders", reward_members: "Rewards members", reward_transactions: "Rewards history", threads: "Conversations",
  tenant_settings: "Website settings", provider_metadata: "Connections", system_history: "History", system_connections: "Connections",
  system_outputs: "System results", versions: "Versions for other businesses", investigation_history: "Saved check history", saved_system_work: "Saved work",
  native_records: "Business records", website_documents: "Website content", website_legacy_archives: "Earlier website content", business_bookings: "Bookings",
  booking_settings: "Booking rules", inquiry_events: "Inquiry history", inquiry_delivery: "Inquiry replies and delivery evidence", enterprise_units: "Business units",
  enterprise_unit_versions: "Business unit Versions", enterprise_unit_history: "Business unit history", home_finder_installations: "Home search Systems",
  home_finder_receipts: "Home search results", home_finder_history: "Home search history", assets_manifest: "Photos and files",
  workspace_snapshot_schema_2: "Saved work and business details", credentials: "Passwords and access keys", provider_connection_secrets: "Connection access keys",
  card_data: "Card details", booking_management_tokens: "Private booking links", inquiry_delivery_routing: "Private delivery controls",
  operator_notes: "Private support notes", calendly_bookings_not_imported: "Bookings held in Calendly",
} satisfies Record<V3Category, string> & Record<string, string>;
export function exportEmailLabel(category: string): string {
  return (EXPORT_EMAIL_LABELS as Record<string, string>)[category] ?? "Other business records";
}
function exportEmailReason(category: string, reason: string): string {
  if (category === "workspace_snapshot_schema_2") return "Saved work is included only in an export requested by the business owner.";
  if (category === "inquiry_delivery_routing") return "Private delivery links are excluded. Replies and delivery evidence are included where available.";
  if (category === "operator_notes") return "Private support notes belong to the support team.";
  return reason;
}

export function workspaceExportLink(baseUrl: string, buildId: string, token: string): string {
  const url = new URL("/api/workspace-export/v3/download", baseUrl);
  url.searchParams.set("build", buildId);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function deliverWorkspaceExportLink(input: {
  businessName?: string; buildId: string; token: string; deliverTo: string; workspaceId: string; tenantIds: string[]; manifest: V3Manifest; baseUrl: string;
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
    workspaceId: input.workspaceId,
    to: input.deliverTo,
    subject: input.businessName ? `Your export of ${input.businessName} is ready` : "Your business export is ready",
    idempotencyKey: `workspace-export-${input.buildId}`,
    options: {
      preheader: "One download with your business's records. The link works for 7 days.",
      heading: input.businessName ? `Your export of ${input.businessName} is ready` : "Your business export is ready",
      paragraphs: [
        "Your business records are ready in one download. The manifest lists included and unavailable categories. The link works for 7 days.",
        "Passwords, tokens and card details are never included.",
      ],
      bullets: input.manifest.included.map((c) => ({ title: exportEmailLabel(c.category), text: `${c.count}` })),
      rows: [...input.manifest.omitted, ...input.manifest.unavailable].map((c) => ({ label: `Not included: ${exportEmailLabel(c.category)}`, value: exportEmailReason(c.category, c.reason) })),
      button: { label: "Download your export", url: workspaceExportLink(input.baseUrl, input.buildId, input.token) },
    },
  });
  if (result.status !== "accepted") {
    alert("workspace_export_link_not_sent", "high", { buildId: input.buildId, workspaceId: input.workspaceId, reason: result.reason });
    return "suppressed";
  }
  return "accepted";
}
