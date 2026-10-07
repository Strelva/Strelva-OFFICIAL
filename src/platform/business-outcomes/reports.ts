import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { formatOutcomeLine, type BusinessOutcomeMonth, type OutcomeLine, type OutcomeRpc } from "./index";
import { customerEmailEnabled, emailSendingEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { alert } from "@/platform/infra/monitoring";

export function businessOutcomeReportsEnabled() {
  return process.env.STRELVA_WORKSPACE_RELEASE === "1" && process.env.STRELVA_BUSINESS_OUTCOME_REPORTS === "1";
}
export interface BusinessOutcomeReport {
  workspaceId: string;
  primaryTenantId: string;
  tenantIds: string[];
  line: OutcomeLine;
}
const figure = z.object({ kind: z.enum(["counted", "linked"]), value: z.number().int().nonnegative().nullable(), reason: z.string().nullable().optional() });
const outcome = z.object({
  workspaceId: z.string().uuid(), month: z.string(), sites: z.number().int().nonnegative().nullable(),
  visits: figure, inquiries: figure, answered: figure.extend({ withinDay: z.number().int().nonnegative().nullable() }),
  bookings: figure.extend({ native: z.number().int().nonnegative(), legacy: z.number().int().nonnegative().nullable() }),
  bookingsFromInquiry: figure.extend({ joins: z.array(z.string()) }), reviews: figure,
});
const reports = z.array(z.object({ workspaceId: z.string().uuid(), primaryTenantId: z.string(), tenantIds: z.array(z.string()), outcome }));
function rpc(): OutcomeRpc | null {
  const db = getSupabase();
  return db ? (name, args) => (db as unknown as { rpc: OutcomeRpc }).rpc(name, args) : null;
}

/** Trusted cron read. Null means armed grouping is unavailable: callers must
 * suppress delivery rather than bypass the durable business receipt. */
export async function readBusinessOutcomeReports(tenantIds: string[], month: string, call: OutcomeRpc | null = null): Promise<BusinessOutcomeReport[] | null> {
  if (!businessOutcomeReportsEnabled()) return [];
  const read = call ?? rpc();
  if (!tenantIds.length) return [];
  if (!read || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  try {
    const result = await read("list_business_outcome_reports", { p_tenant_ids: tenantIds, p_month: `${month}-01` });
    const parsed = reports.safeParse(result.data);
    if (result.error || !parsed.success) return null;
    if (parsed.data.some(row => row.outcome.workspaceId !== row.workspaceId || !tenantIds.includes(row.primaryTenantId)
      || !row.tenantIds.includes(row.primaryTenantId))) return null;
    return parsed.data.map(row => ({ workspaceId: row.workspaceId, primaryTenantId: row.primaryTenantId, tenantIds: row.tenantIds, line: formatOutcomeLine(row.outcome as BusinessOutcomeMonth) }));
  } catch { return null; }
}

/** Both existing report transports share one durable business/month receipt.
 * A lost provider result or accepted send with lost settlement never retries. */
export async function deliverBusinessOutcomeReport<T extends { status: "accepted" | "suppressed" }>(
  report: BusinessOutcomeReport, month: string, send: () => Promise<T>, call: OutcomeRpc | null = null,
): Promise<T | { status: "suppressed"; reason: string }> {
  if (!businessOutcomeReportsEnabled() || !emailSendingEnabled() || !customerEmailEnabled()) return { status: "suppressed", reason: "business_outcome_email_disabled" };
  try {
    for (const tenantId of report.tenantIds) if (await getClientEmailOverride(tenantId) === "off") return { status: "suppressed", reason: "client_email_disabled" };
  } catch { return { status: "suppressed", reason: "client_email_gate_unavailable" }; }
  const write = call ?? rpc();
  if (!write) return { status: "suppressed", reason: "business_outcome_receipt_unavailable" };
  const reserved = await write("reserve_business_outcome_report_delivery", { p_workspace_id: report.workspaceId, p_month: `${month}-01` });
  const parsed = z.object({ token: z.string().uuid() }).safeParse(reserved.data);
  if (reserved.error || !parsed.success) return { status: "suppressed", reason: "business_outcome_report_already_reserved_or_unavailable" };
  const settle = (status: "accepted" | "suppressed" | "unknown") => write("record_business_outcome_report_delivery", {
    p_workspace_id: report.workspaceId, p_month: `${month}-01`, p_token: parsed.data.token, p_status: status,
  });
  let result: T;
  try { result = await send(); }
  catch (cause) {
    await settle("unknown").catch(() => undefined);
    alert("business_outcome_report_delivery_unknown", "high", { workspaceId: report.workspaceId, month });
    throw cause;
  }
  try {
    const receipt = await settle(result.status);
    if (receipt.error) throw new Error("receipt_failed");
  } catch {
    alert("business_outcome_report_receipt_failed", "high", { workspaceId: report.workspaceId, month, providerAccepted: result.status === "accepted" });
  }
  return result;
}
