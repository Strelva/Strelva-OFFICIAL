import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import {
  businessContactSchema,
  businessPolicyPatchSchema,
  businessRecordPatchSchema,
  businessRecordRevisionSchema,
  businessRecordSchema,
  businessRecordWriteResultSchema,
  businessRecordWriteSourceSchema,
  confirmedBusinessFactsSchema,
  contactBatchSchema,
  conversionReceiptSchema,
  ownerRecipientSchema,
  tenantOwnerRecipientSchema,
  patchVerificationAllowed,
  tenantImportPayloadSchema,
  tenantLinkStateSchema,
  tenantUnlinkPreviewSchema,
  tenantUnlinkReceiptSchema,
  type BusinessContact,
  type BusinessRecord,
  type BusinessRecordRevision,
  type BusinessRecordWriteResult,
  type ConfirmedBusinessFacts,
  type ConversionReceipt,
  type OwnerRecipient,
  type TenantOwnerRecipient,
  type TenantImportPayload,
  type TenantLinkState,
  type TenantUnlinkPreview,
  type TenantUnlinkReceipt,
} from "./contracts";
import { actorArgs, BusinessRecordValidationError, callBusinessRecord } from "./repository";
import { canonicalJson, sha256, type TenantUnlinkCommand } from "./tenant-import";

import { selectBusinessPolicies, type BusinessPolicies } from "./policies";

const workspaceId = z.string().uuid();
const commandId = z.string().uuid();

/** Each write carries a command id (reuse it to retry safely) and is bound to
 * a digest of exactly what it asks for. */
export interface WriteOptions {
  source: unknown;
  commandId?: string;
}

function command(options: WriteOptions, body: unknown) {
  const source = businessRecordWriteSourceSchema.parse(options.source);
  const id = commandId.parse(options.commandId ?? randomUUID());
  return { source, id, digest: sha256(canonicalJson({ source, body })) };
}

export async function readBusinessRecord(actor: WorkspaceActor, workspace: string): Promise<BusinessRecord> {
  return callBusinessRecord("read_business_record", { p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor) },
    businessRecordSchema, "The business record could not be loaded.");
}

/** What client sites may show: the owner's own writes and owner-decided changes only. */
export async function readConfirmedBusinessFacts(actor: WorkspaceActor, workspace: string): Promise<ConfirmedBusinessFacts> {
  return callBusinessRecord("read_confirmed_business_facts", { p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor) },
    confirmedBusinessFactsSchema, "The confirmed business details could not be loaded.");
}

/** Exact same membership/agency read boundary as the business record. */
export async function readBusinessPolicies(actor: WorkspaceActor, workspace: string): Promise<BusinessPolicies> {
  return selectBusinessPolicies(await readBusinessRecord(actor, workspace));
}

export async function patchBusinessRecord(
  actor: WorkspaceActor, workspace: string, expectedRevision: number, rawPatch: unknown, options: WriteOptions,
): Promise<BusinessRecordWriteResult> {
  const patch = businessRecordPatchSchema.parse(rawPatch);
  const revision = z.number().int().min(0).parse(expectedRevision);
  const { source, id, digest } = command(options, { kind: "patch", expectedRevision: revision, patch });
  if (!patchVerificationAllowed(patch, source)) {
    throw new BusinessRecordValidationError("business_record_source_invalid", "Only an owner or Strelva operator can mark facts verified.");
  }
  return callBusinessRecord("patch_business_record", {
    p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor), p_source: source,
    p_expected_revision: revision, p_patch: patch, p_command_id: id, p_command_digest: digest,
  }, businessRecordWriteResultSchema, "The business record could not be saved.");
}

/** Same revision, idempotency, provenance and confirmation rules as all facts.
 * Remove a policy with null; undo with undoBusinessRecordRevision. */
export async function patchBusinessPolicies(
  actor: WorkspaceActor, workspace: string, expectedRevision: number, rawPolicies: unknown, options: WriteOptions,
): Promise<BusinessRecordWriteResult> {
  return patchBusinessRecord(actor, workspace, expectedRevision, { facts: businessPolicyPatchSchema.parse(rawPolicies) }, options);
}

export async function undoBusinessRecordRevision(
  actor: WorkspaceActor, workspace: string, sequence: number, options: WriteOptions,
): Promise<BusinessRecordWriteResult> {
  const target = z.number().int().positive().parse(sequence);
  const { source, id, digest } = command(options, { kind: "undo", sequence: target });
  return callBusinessRecord("undo_business_record_revision", {
    p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor), p_source: source,
    p_sequence: target, p_command_id: id, p_command_digest: digest,
  }, businessRecordWriteResultSchema, "The revision could not be undone.");
}

export async function upsertBusinessContacts(
  actor: WorkspaceActor, workspace: string, rawContacts: unknown, options: WriteOptions,
): Promise<BusinessRecordWriteResult> {
  const contacts = contactBatchSchema.parse(rawContacts);
  const { source, id, digest } = command(options, { kind: "contacts", contacts });
  return callBusinessRecord("upsert_business_contacts", {
    p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor), p_source: source,
    p_contacts: contacts, p_command_id: id, p_command_digest: digest,
  }, businessRecordWriteResultSchema, "The contacts could not be saved.");
}

/** Direct members only; an agency is refused (contacts are not its work). */
export async function readBusinessContacts(actor: WorkspaceActor, workspace: string, limit = 100): Promise<BusinessContact[]> {
  return callBusinessRecord("read_business_contacts", {
    p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor), p_limit: z.number().int().min(1).max(500).parse(limit),
  }, z.array(businessContactSchema), "The contacts could not be loaded.");
}

/** An agency sees only revisions that touched no contact; it cannot undo the others. */
export async function readBusinessRecordHistory(actor: WorkspaceActor, workspace: string, limit = 50): Promise<BusinessRecordRevision[]> {
  return callBusinessRecord("read_business_record_history", {
    p_workspace_id: workspaceId.parse(workspace), ...actorArgs(actor), p_limit: z.number().int().min(1).max(200).parse(limit),
  }, z.array(businessRecordRevisionSchema), "The business record history could not be loaded.");
}

/** Who Strelva would notify for this business. Server-only: the caller must
 * already hold its own authority. It resolves an address and sends nothing. */
export async function resolveOwnerRecipient(workspace: string): Promise<OwnerRecipient | null> {
  return callBusinessRecord("resolve_business_owner_recipient", { p_workspace_id: workspaceId.parse(workspace) },
    ownerRecipientSchema.nullable(), "The owner recipient could not be resolved.");
}

/** The owner-recipient rule for one tenant (record contact, then the tenant's
 * own owner_email, then the business's first site). Server-only; sends nothing. */
export async function resolveTenantOwnerRecipient(tenantId: string): Promise<TenantOwnerRecipient | null> {
  return callBusinessRecord("resolve_tenant_owner_recipient", { p_tenant_id: z.string().min(1).max(120).parse(tenantId) },
    tenantOwnerRecipientSchema.nullable(), "The owner recipient could not be resolved.");
}

export async function readTenantWorkspaceLink(operatorEmail: string, tenantId: string): Promise<TenantLinkState> {
  return callBusinessRecord("read_tenant_workspace_link", {
    p_operator_email: z.string().email().parse(operatorEmail.trim().toLowerCase()), p_tenant_id: z.string().min(1).parse(tenantId),
  }, tenantLinkStateSchema, "The tenant link could not be read.");
}

export async function convertTenantToBusiness(
  operatorEmail: string, payload: TenantImportPayload, plan: { commandId: string; digest: string },
): Promise<ConversionReceipt> {
  const parsed = tenantImportPayloadSchema.parse(payload);
  if (sha256(canonicalJson(parsed)) !== plan.digest) {
    throw new BusinessRecordValidationError("tenant_conversion_invalid", "The plan digest does not match its payload.");
  }
  return callBusinessRecord("convert_tenant_to_business", {
    p_operator_email: z.string().email().parse(operatorEmail.trim().toLowerCase()),
    p_tenant_id: parsed.tenantId,
    p_import: parsed,
    p_command_id: commandId.parse(plan.commandId),
    p_command_digest: plan.digest,
  }, conversionReceiptSchema, "The tenant conversion failed.");
}

/** Operator preview of unlinking a converted tenant. Writes nothing. */
export async function previewTenantUnlink(operatorEmail: string, tenantId: string): Promise<TenantUnlinkPreview> {
  return callBusinessRecord("preview_tenant_unlink", {
    p_operator_email: z.string().email().parse(operatorEmail.trim().toLowerCase()), p_tenant_id: z.string().min(1).parse(tenantId),
  }, tenantUnlinkPreviewSchema, "The unlink preview could not be read.");
}

/** Reverse one conversion (see unlink_tenant_from_business for the rule). */
export async function unlinkTenantFromBusiness(operatorEmail: string, command: TenantUnlinkCommand): Promise<TenantUnlinkReceipt> {
  return callBusinessRecord("unlink_tenant_from_business", {
    p_operator_email: z.string().email().parse(operatorEmail.trim().toLowerCase()),
    p_tenant_id: z.string().min(1).parse(command.tenantId),
    p_workspace_id: workspaceId.parse(command.workspaceId),
    p_command_id: commandId.parse(command.commandId),
    p_command_digest: z.string().regex(/^[0-9a-f]{64}$/).parse(command.digest),
  }, tenantUnlinkReceiptSchema, "The tenant unlink failed.");
}

/** Server-only public projection for a linked tenant. No contacts or secrets. */
export async function readTenantBusinessContext(tenantId: string) {
  const facts = z.object({
    display_name: z.string().optional(), legal_name: z.string().optional(), description: z.string().optional(),
    phone: z.string().optional(), email: z.string().email().optional(),
    address: z.object({ formatted: z.string().optional(), line1: z.string().optional(), line2: z.string().optional(), city: z.string().optional(), region: z.string().optional(), postalCode: z.string().optional(), country: z.string().optional() }).optional(),
    hours: z.object({ timezone: z.string(), weekly: z.array(z.object({ day: z.number().int().min(0).max(6), opens: z.string(), closes: z.string() })) }).optional(),
    links: z.array(z.object({ kind: z.string(), url: z.string().url() })).optional(),
  });
  const schema = z.object({ revision: z.number().int().nonnegative(), facts, services: z.array(z.object({ id: z.string().uuid(), name: z.string(), description: z.string().nullable(), priceText: z.string().nullable() })) });
  return callBusinessRecord("read_tenant_business_context", { p_tenant_id: z.string().min(1).max(120).parse(tenantId) }, schema.nullable(), "Business facts could not be loaded.");
}
