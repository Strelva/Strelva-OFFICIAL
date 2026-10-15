import { z } from "zod";
import { connectDb, type RpcDb } from "@/platform/connect";
import { PayLinkConflictError, PayLinkValidationError, type PayLinkConfig } from "@/platform/infra/pay-links";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { agencyPayLinkSchema, moneyDocumentSchema, type AgencyPayLink, type MoneyDocument } from "./types";

export { agencyPayLinksEnabled, payLinkStore } from "./release";
export { formatDocumentNumber, type AgencyPayLink, type MoneyDocument } from "./types";

/** A link that can no longer be paid. `status` is the HTTP status the page or route answers with. */
export class AgencyPayLinkClosedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AgencyPayLinkClosedError";
  }
}

/** Maps the SQL codes to plain words. The SQL message itself is never echoed. */
export function mapPayLinkError(message: string | undefined, slug = ""): Error {
  const code = message ?? "";
  if (code.includes("agency_pay_link_slug_taken") || code.includes("agency_pay_link_conflict")) return new PayLinkConflictError(slug);
  if (code.includes("agency_pay_link_slug_invalid")) return new PayLinkValidationError("Invalid slug. Use lowercase letters, numbers, and hyphens (e.g. acme-coffee).");
  if (code.includes("agency_pay_link_merchant_unavailable")) return new PayLinkValidationError("Finish your agency's Stripe setup before creating payment links. No payment link was created.");
  if (code.includes("agency_pay_link_amount_invalid")) return new PayLinkValidationError("Choose an amount this payment link allows.");
  if (code.includes("agency_pay_link_expired") || code.includes("agency_pay_link_closed")) return new AgencyPayLinkClosedError("This payment link has expired. Ask the agency for a new link. Nothing was charged.", 410);
  if (code.includes("agency_pay_link_paid")) return new AgencyPayLinkClosedError("This payment link is already paid. Nothing was charged.", 409);
  if (code.includes("agency_pay_link_missing")) return new AgencyPayLinkClosedError("This payment link was not found. Nothing was charged.", 404);
  if (code.includes("denied")) return new WorkspaceAccessError();
  return new WorkspaceStoreError("Payment link state could not be confirmed.");
}

/** Like moneyRpc, but keeps the SQL code long enough to map it. */
export async function payLinkRpc<T>(name: string, args: Record<string, unknown>, db: RpcDb | null = connectDb(), slug = ""): Promise<T> {
  if (!db) throw new WorkspaceStoreError("Money storage is unavailable.");
  const result = await db.rpc(name, args);
  if (result.error) throw mapPayLinkError(result.error.message, slug);
  return result.data as T;
}

export interface AgencyPayLinkCommand {
  action: "create" | "revoke";
  agencyWorkspaceId: string;
  idempotencyKey: string;
  fingerprint: string;
  slug: string;
  clientName?: string;
  description?: string;
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
  businessWorkspaceId?: string;
  agencyDisplayName?: string;
}

export async function commandAgencyPayLinkRecord(actor: WorkspaceActor, command: AgencyPayLinkCommand, db: RpcDb | null = connectDb()): Promise<AgencyPayLink> {
  return agencyPayLinkSchema.parse(await payLinkRpc("agency_pay_link_command", { p_command: command, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, db, command.slug));
}

export async function readAgencyPayLinkRecords(actor: WorkspaceActor, agencyId: string, db: RpcDb | null = connectDb()): Promise<AgencyPayLink[]> {
  return z.array(agencyPayLinkSchema).parse(await payLinkRpc("read_agency_pay_links", { p_agency_workspace_id: z.string().uuid().parse(agencyId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }, db));
}

export async function readPublicAgencyPayLink(slug: string, db: RpcDb | null = connectDb()): Promise<AgencyPayLink | null> {
  const row = await payLinkRpc<unknown>("read_public_agency_pay_link", { p_slug: slug }, db, slug);
  return row == null ? null : agencyPayLinkSchema.parse(row);
}

/** Super-admin routes only; the caller gates. */
export async function listAgencyPayLinksForSupport(db: RpcDb | null = connectDb()): Promise<AgencyPayLink[]> {
  return z.array(agencyPayLinkSchema).parse(await payLinkRpc("list_agency_pay_links_for_support", {}, db));
}

export async function issueAgencyPayLinkReceipt(linkId: string, db: RpcDb | null = connectDb()): Promise<MoneyDocument> {
  return moneyDocumentSchema.parse(await payLinkRpc("issue_agency_pay_link_receipt", { p_link_id: linkId }, db));
}

export async function readMoneyDocument(kind: MoneyDocument["kind"], linkId: string, db: RpcDb | null = connectDb()): Promise<MoneyDocument | null> {
  const row = await payLinkRpc<unknown>("read_money_document", { p_kind: kind, p_link_id: linkId }, db);
  return row == null ? null : moneyDocumentSchema.parse(row);
}

/** The legacy page and checkout read this shape, whichever store holds the link. */
export function toLegacyPayLinkConfig(row: AgencyPayLink): PayLinkConfig {
  return {
    slug: row.slug,
    clientName: row.clientName,
    door: row.door ?? "build",
    ...(row.legacyTenantId ? { tenantId: row.legacyTenantId } : {}),
    ...(row.leadSlug ? { leadSlug: row.leadSlug } : {}),
    ...(row.amountCents != null ? { amountCents: row.amountCents } : {}),
    ...(row.minCents != null ? { minCents: row.minCents } : {}),
    ...(row.maxCents != null ? { maxCents: row.maxCents } : {}),
    ...(row.description ? { customCopy: row.description } : {}),
    ...(row.returnUrl ? { returnUrl: row.returnUrl } : {}),
    createdAt: row.createdAt,
    ...(row.agencyWorkspaceId ? { agencyWorkspaceId: row.agencyWorkspaceId } : {}),
    ...(row.agencyDisplayName ? { agencyDisplayName: row.agencyDisplayName } : {}),
    ...(row.businessWorkspaceId ? { businessWorkspaceId: row.businessWorkspaceId } : {}),
    ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
    ...(row.revokedBy ? { revokedBy: row.revokedBy } : {}),
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
  };
}
