import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  agencyTimeEntrySchema,
  agencyTimeListSchema,
  careReportListSchema,
  careReportSharedSchema,
  careReportViewSchema,
  generateResultSchema,
  ownerCareReportListSchema,
  type AgencyTimeEntry,
  type AgencyTimeList,
  type CareReportList,
  type CareReportShared,
  type CareReportSiteChecks,
  type CareReportView,
  type GenerateResult,
  type OwnerCareReportList,
  type TimeEntryCommand,
} from "./contracts";

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
let override: Rpc | null = null;
/** Test seam. */
export function setCareReportsDb(value: Rpc | null): void { override = value; }

const UNREADABLE = "Care plan reports could not be read. Nothing changed.";

function db(): Rpc {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError(UNREADABLE);
  return client as unknown as Rpc;
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("workspace_access_denied") || detail.includes("care_report_not_found")) throw new WorkspaceAccessError();
    if (detail.includes("care_report_revision_conflict")) throw new WorkspaceConflictError("This report changed since you opened it. Reload, then try again.");
    if (detail.includes("care_report_delivery_exists")) throw new WorkspaceConflictError("This Release was already emailed.");
    if (detail.includes("care_report_not_published")) throw new WorkspaceConflictError("Share the report first.");
    if (detail.includes("care_time_conflict")) throw new WorkspaceConflictError("That time entry was already recorded differently.");
    if (detail.includes("care_report_invalid") || detail.includes("care_time_invalid")) throw new z.ZodError([]);
    throw new WorkspaceStoreError(UNREADABLE);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(UNREADABLE);
  return parsed.data;
}

const actorArgs = (actor: WorkspaceActor) => ({ p_user: actor.userId, p_email: actor.verifiedEmail });
const firstOfMonth = (month: string): string => `${month}-01`;

export async function listCareReports(actor: WorkspaceActor, agencyWorkspaceId: string, month: string): Promise<CareReportList> {
  const list = await call("list_care_reports", { p_agency: agencyWorkspaceId, ...actorArgs(actor), p_month: firstOfMonth(month) }, careReportListSchema);
  if (list.agencyWorkspaceId !== agencyWorkspaceId || list.month !== month) throw new WorkspaceStoreError(UNREADABLE);
  return list;
}

export async function generateCareReports(
  actor: WorkspaceActor,
  input: { agencyWorkspaceId: string; month: string; workspaceIds: string[]; siteChecks: CareReportSiteChecks },
): Promise<GenerateResult> {
  return call("generate_care_reports", {
    p_agency: input.agencyWorkspaceId, ...actorArgs(actor), p_month: firstOfMonth(input.month),
    p_workspace_ids: input.workspaceIds, p_site_checks: input.siteChecks,
  }, generateResultSchema);
}

export async function readCareReport(actor: WorkspaceActor, reportId: string): Promise<CareReportView> {
  const view = await call("read_care_report", { p_report_id: reportId, ...actorArgs(actor) }, careReportViewSchema);
  if (view.report.id !== reportId) throw new WorkspaceStoreError(UNREADABLE);
  return view;
}

export async function saveCareReportNote(actor: WorkspaceActor, reportId: string, note: string, expectedRevision: number): Promise<CareReportView> {
  return call("save_care_report_note", { p_report_id: reportId, ...actorArgs(actor), p_note: note, p_expected_revision: expectedRevision }, careReportViewSchema);
}

const publishedSchema = z.object({ releaseId: z.string().uuid(), number: z.number().int().positive() }).strict();
export async function publishCareReport(actor: WorkspaceActor, reportId: string, expectedRevision: number): Promise<{ releaseId: string; number: number }> {
  return call("publish_care_report", { p_report_id: reportId, ...actorArgs(actor), p_expected_revision: expectedRevision }, publishedSchema);
}

const linkSchema = z.object({ createdAt: z.string() }).strict();
export async function issueCareReportShareLink(actor: WorkspaceActor, reportId: string, tokenHash: string): Promise<{ createdAt: string }> {
  return call("issue_care_report_share_link", { p_report_id: reportId, ...actorArgs(actor), p_token_hash: tokenHash }, linkSchema);
}

const revokedSchema = z.object({ revoked: z.boolean() }).strict();
export async function revokeCareReportShareLink(actor: WorkspaceActor, reportId: string): Promise<{ revoked: boolean }> {
  return call("revoke_care_report_share_link", { p_report_id: reportId, ...actorArgs(actor) }, revokedSchema);
}

/** No actor: the unguessable token is the authority. */
export async function readSharedCareReport(tokenHash: string, release: number | null): Promise<CareReportShared> {
  return call("read_shared_care_report", { p_token_hash: tokenHash, p_number: release }, careReportSharedSchema);
}

const reservedSchema = z.object({ deliveryId: z.string().uuid(), token: z.string().uuid() }).strict();
export async function reserveCareReportDelivery(actor: WorkspaceActor, releaseId: string): Promise<{ deliveryId: string; token: string }> {
  return call("reserve_care_report_delivery", { p_release_id: releaseId, ...actorArgs(actor) }, reservedSchema);
}

const deliveryStatusSchema = z.object({ status: z.enum(["accepted", "suppressed", "unknown"]) }).strict();
export async function recordCareReportDelivery(
  actor: WorkspaceActor,
  releaseId: string,
  delivery: { deliveryId: string; token: string } | null,
  status: "accepted" | "suppressed" | "unknown",
  reason: string | null,
  providerMessageId: string | null,
): Promise<{ status: "accepted" | "suppressed" | "unknown" }> {
  return call("record_care_report_delivery", {
    p_release_id: releaseId, ...actorArgs(actor), p_delivery_id: delivery?.deliveryId ?? null, p_token: delivery?.token ?? null,
    p_status: status, p_reason: reason, p_provider_message_id: providerMessageId,
  }, deliveryStatusSchema);
}

export async function listOwnerCareReports(actor: WorkspaceActor, workspaceId: string): Promise<OwnerCareReportList> {
  return call("list_owner_care_reports", { p_workspace_id: workspaceId, ...actorArgs(actor) }, ownerCareReportListSchema);
}

export async function recordAgencyClientTime(actor: WorkspaceActor, entry: TimeEntryCommand): Promise<AgencyTimeEntry> {
  const { agencyWorkspaceId, workspaceId, ...rest } = entry;
  return call("record_agency_client_time", {
    p_agency: agencyWorkspaceId, p_workspace: workspaceId, ...actorArgs(actor), p_entry: rest,
  }, agencyTimeEntrySchema);
}

const voidedSchema = z.object({ voided: z.literal(true) }).strict();
export async function voidAgencyClientTime(actor: WorkspaceActor, input: { agencyWorkspaceId: string; id: string; reason: string }): Promise<{ voided: true }> {
  return call("void_agency_client_time", { p_agency: input.agencyWorkspaceId, ...actorArgs(actor), p_entry_id: input.id, p_reason: input.reason }, voidedSchema);
}

export async function listAgencyClientTime(actor: WorkspaceActor, input: { agencyWorkspaceId: string; workspaceId: string; month: string }): Promise<AgencyTimeList> {
  return call("list_agency_client_time", {
    p_agency: input.agencyWorkspaceId, p_workspace: input.workspaceId, ...actorArgs(actor), p_month: firstOfMonth(input.month),
  }, agencyTimeListSchema);
}
