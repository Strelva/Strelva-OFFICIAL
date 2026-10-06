import { CONTROL_PLANE_URL } from "@/lib/brand";
import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/lib/email/send";
import { systemsReleaseEnabled, systemsReleasedFor } from "@/platform/systems-release";
import { workspaceReleaseOn } from "@/platform/release-flags/resolve";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { ApplicationRecord, ApplicationSpec, applicationLinkInputSchema } from "./contracts";
import type { z } from "zod";

/**
 * Internal tools that point at the business record
 * (docs/product/specs/systems-catalog.md section 3.1, items 6 to 8).
 *
 * A `contact` field becomes a business_contacts id and an `assigned_person`
 * field a business_people id before the record is saved. After the save, the
 * assigned person gets one email naming the tool, the record title and the
 * one missing item, with a sign-in link and nothing else from the record.
 * Every send, suppression or failure leaves a receipt in
 * internal_tool_notices. All of it sits behind STRELVA_SYSTEMS_RELEASE.
 */

type LinkInput = z.infer<typeof applicationLinkInputSchema>;
type LinkDb = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> };
type LinkField = ApplicationSpec["fields"][number] & { type: "contact" | "assigned_person" };

const LINK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function linkFields(spec: ApplicationSpec): LinkField[] {
  return spec.fields.filter((field): field is LinkField => field.type === "contact" || field.type === "assigned_person");
}

/**
 * Link fields are a Systems feature. Off, a tool cannot be given them.
 * `enabled` defaults to the env-only rule (exactly `1`); callers that know the
 * workspace pass `await linkFieldsReleasedFor(...)` so `workspace` mode works
 * per business.
 */
export function assertLinkFieldsReleased(spec: ApplicationSpec, enabled = systemsReleaseEnabled()): void {
  if (!enabled && linkFields(spec).length) {
    throw new WorkspaceConflictError("Contact and assigned-person fields are not available yet.");
  }
}

/**
 * Systems for this workspace and actor. Only reads the flag row when a spec
 * actually has link fields, so tools without them never pay the read.
 */
export async function linkFieldsReleasedFor(spec: ApplicationSpec, actor: { userId: string }, workspaceId: string): Promise<boolean> {
  if (!linkFields(spec).length) return true;
  // No workspace release means no rows: the env-only rule stands.
  if (!workspaceReleaseOn()) return systemsReleaseEnabled();
  return systemsReleasedFor(actor, workspaceId);
}

function failure(error: { message?: string; code?: string }, field?: LinkField): never {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("workspace_membership_required") || detail.includes("application_access_denied")) throw new WorkspaceAccessError();
  if (detail.includes("application_record_person_unknown")) {
    throw new WorkspaceConflictError(`${field?.label ?? "Assigned person"}: that email isn't on this business's staff.`);
  }
  if (detail.includes("application_record_link_denied")) throw new WorkspaceConflictError("Contacts and staff come from this business only.");
  if (detail.includes("application_record_invalid") || detail.includes("business_record_patch_invalid")) {
    throw new WorkspaceConflictError("Check the email or phone in this record.");
  }
  if (detail.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("This business has stopped new work.");
  throw new WorkspaceStoreError("The record's contacts could not be confirmed.");
}

/**
 * Turn what the submitter typed into business record ids. A value that is
 * already an id is left for the database trigger to check. Returns the record
 * to save and the labels of contact fields where the email and the phone
 * matched different contacts (the email match was kept).
 */
export async function resolveRecordLinks(
  db: LinkDb,
  actor: WorkspaceActor,
  target: { workspaceId: string; workId: string },
  spec: ApplicationSpec,
  record: ApplicationRecord,
  links: Record<string, LinkInput> = {},
): Promise<{ record: ApplicationRecord; conflicts: string[] }> {
  const requests: Array<Record<string, unknown>> = [];
  const fields = new Map<string, LinkField>();
  for (const field of linkFields(spec)) {
    const value = record.values[field.id];
    const typed = links[field.id];
    if (!typed && (typeof value !== "string" || !value.trim() || LINK_ID.test(value))) continue;
    const text = typeof value === "string" && !LINK_ID.test(value) ? value.trim() : "";
    fields.set(field.id, field);
    if (field.type === "assigned_person") {
      requests.push({ fieldId: field.id, kind: field.type, email: typed?.email || text });
    } else {
      const fallback = text.includes("@") ? { email: text } : text ? { phone: text } : {};
      requests.push({ fieldId: field.id, kind: field.type, ...fallback, ...typed });
    }
  }
  if (!requests.length) return { record, conflicts: [] };
  const { data, error } = await db.rpc("resolve_internal_tool_links", {
    p_workspace_id: target.workspaceId,
    p_work_id: target.workId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_links: requests,
  });
  if (error) failure(error, requests.length === 1 ? fields.get(String(requests[0]!.fieldId)) : undefined);
  const resolved = (data && typeof data === "object" ? data : {}) as Record<string, { id?: unknown; conflict?: unknown }>;
  const values = { ...record.values };
  const conflicts: string[] = [];
  for (const [fieldId, field] of fields) {
    const id = resolved[fieldId]?.id;
    if (typeof id !== "string" || !LINK_ID.test(id)) throw new WorkspaceStoreError("The record's contacts could not be confirmed.");
    values[fieldId] = id;
    if (resolved[fieldId]?.conflict === true) conflicts.push(field.label);
  }
  return { record: { ...record, values }, conflicts };
}

function oneLine(value: string, max = 120): string {
  const line = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The record's title: its first filled text field, else its id. */
export function recordTitle(spec: ApplicationSpec, record: ApplicationRecord): string {
  for (const field of spec.fields) {
    const value = record.values[field.id];
    if (field.type === "text" && typeof value === "string" && value.trim()) return oneLine(value);
  }
  return oneLine(record.id);
}

/** The one missing item: the first optional field left empty or unchecked. */
export function missingItem(spec: ApplicationSpec, record: ApplicationRecord): string | null {
  for (const field of spec.fields) {
    if (field.type === "assigned_person" || field.required) continue;
    const value = record.values[field.id];
    if (value === undefined || value === "" || value === false) return oneLine(field.label, 80);
  }
  return null;
}

export function toolSignInUrl(workspaceId: string, workId: string, base = process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL): string {
  const next = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=applications&work=${encodeURIComponent(workId)}`;
  return new URL(`/sign-in?next=${encodeURIComponent(next)}`, base).toString();
}

/** The email body. Nothing from the record beyond its title and the missing item. */
export function assignedPersonEmail(input: {
  toolTitle: string;
  title: string;
  missing: string | null;
  personName: string | null;
  signInUrl: string;
}): Pick<SendEmailInput, "subject" | "options"> & { options: NonNullable<SendEmailInput["options"]> } {
  const tool = oneLine(input.toolTitle, 80);
  const firstName = input.personName?.trim().split(/\s+/)[0];
  return {
    subject: oneLine(`${tool}: ${input.title}`, 150),
    options: {
      preheader: input.missing ? `Still missing: ${input.missing}` : `You're assigned to ${input.title}.`,
      heading: `You're assigned to ${input.title}`,
      paragraphs: [
        ...(firstName ? [`Hi ${firstName},`] : []),
        `A new record in ${tool} names you as the person handling it.`,
        input.missing ? `Still missing: ${input.missing}.` : "Next step: open it and confirm nothing is missing.",
        "Sign in to see the full record. This email doesn't include its details.",
      ],
      button: { label: "Sign in to open it", url: input.signInUrl },
      footerNote: `Sent by Strelva for ${tool}.`,
    },
  };
}

export type AssignedPersonNoticeStatus = "none" | "duplicate" | "skipped" | "sent" | "suppressed" | "failed";

/**
 * One email per submitted record, with a receipt. Never throws: the record is
 * already saved, so a failed notice is recorded, not surfaced as a failed
 * submit.
 */
export async function notifyAssignedPerson(
  db: LinkDb,
  actor: WorkspaceActor,
  input: { workspaceId: string; workId: string; toolTitle: string; spec: ApplicationSpec; record: ApplicationRecord },
  deps: { send: (input: SendEmailInput) => Promise<SendEmailResult> } = { send: sendEmailWithReceipt },
): Promise<{ status: AssignedPersonNoticeStatus; noticeId?: string }> {
  const field = linkFields(input.spec).find((item) => item.type === "assigned_person");
  const value = field ? input.record.values[field.id] : undefined;
  if (!field || typeof value !== "string" || !LINK_ID.test(value)) return { status: "none" };
  try {
    const claim = await db.rpc("claim_internal_tool_notice", {
      p_workspace_id: input.workspaceId,
      p_work_id: input.workId,
      p_record_id: input.record.id,
      p_field_id: field.id,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
    });
    if (claim.error) throw new Error(claim.error.message || "notice claim failed");
    const claimed = (claim.data ?? {}) as { claimed?: boolean; noticeId?: string; status?: string; recipientEmail?: string; personName?: string };
    if (!claimed.claimed || !claimed.noticeId || !claimed.recipientEmail) {
      return { status: claimed.status === "skipped" ? "skipped" : "duplicate", noticeId: claimed.noticeId };
    }
    const title = recordTitle(input.spec, input.record);
    const email = assignedPersonEmail({
      toolTitle: input.toolTitle,
      title,
      missing: missingItem(input.spec, input.record),
      personName: claimed.personName ?? null,
      signInUrl: toolSignInUrl(input.workspaceId, input.workId),
    });
    let status: "sent" | "suppressed" | "failed";
    let detail: string | null = null;
    let providerMessageId: string | null = null;
    try {
      const result = await deps.send({
        audience: "client",
        to: claimed.recipientEmail,
        subject: email.subject,
        options: email.options,
        idempotencyKey: `internal-tool-notice:${claimed.noticeId}`,
        tags: { kind: "internal_tool_notice" },
      });
      if (result.status === "accepted") { status = "sent"; providerMessageId = result.providerMessageId; }
      else { status = "suppressed"; detail = result.reason; }
    } catch (error) {
      status = "failed";
      detail = oneLine(error instanceof Error ? error.message : "send failed", 300);
    }
    const finish = await db.rpc("finish_internal_tool_notice", {
      p_notice_id: claimed.noticeId,
      p_workspace_id: input.workspaceId,
      p_status: status,
      p_detail: detail,
      p_provider_message_id: providerMessageId,
    });
    if (finish.error) console.error("[internal-tool-notice] receipt not recorded", { noticeId: claimed.noticeId, status });
    return { status, noticeId: claimed.noticeId };
  } catch (error) {
    console.error("[internal-tool-notice] notice not claimed", { workId: input.workId, error: error instanceof Error ? error.message : "unknown" });
    return { status: "failed" };
  }
}
