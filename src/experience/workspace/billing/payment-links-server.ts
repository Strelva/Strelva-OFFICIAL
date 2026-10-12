import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readCheckoutAvailability } from "@/platform/connect/checkout-availability";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { buildPayLinkConfig, createAgencyPayLink, getPayLink, listPayLinks, normalizePayLinkSlug, payLinkDigest, PayLinkValidationError, revokePayLink } from "@/platform/infra/pay-links";
import { listBuildPayments } from "@/platform/infra/revenue";

const uuid = z.string().uuid();
const clientsSchema = z.array(z.object({ customerWorkspaceId: uuid, name: z.string().min(1) }));
export function legacyMerchantAgencyId() { return process.env.STRELVA_LEGACY_MERCHANT_AGENCY_WORKSPACE_ID?.trim() || null; }

export async function paymentLinkAgency(actor: WorkspaceActor, id: string) {
  const agency = (await listMemberAgencies(actor)).find(item => item.id === uuid.parse(id));
  if (!agency || (agency.role !== "owner" && agency.role !== "admin")) throw new WorkspaceAccessError();
  return agency;
}

async function currentMerchantAgency(actor: WorkspaceActor, id: string) {
  const agency = await paymentLinkAgency(actor, id);
  if (agency.id !== legacyMerchantAgencyId()) throw new WorkspaceAccessError();
  return agency;
}

async function merchantDisplayName(id: string) {
  const brand = await resolveOwnerBrand(id);
  if (brand.agencyId !== id) throw new WorkspaceStoreError("The charging agency's identity could not be confirmed.");
  return brand.name;
}

async function agencyClients(actor: WorkspaceActor, agencyWorkspaceId: string) {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Agency clients are unavailable.");
  const { data, error } = await db.rpc("read_agency_provider_seats", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: agencyWorkspaceId,
  });
  if (error) throw new WorkspaceStoreError("Agency clients could not be confirmed.");
  return clientsSchema.parse(data);
}

export async function readAgencyPaymentLinks(actor: WorkspaceActor, agencyWorkspaceId: string) {
  const agency = await paymentLinkAgency(actor, agencyWorkspaceId);
  const legacyMerchant = agency.id === legacyMerchantAgencyId();
  const checkoutAvailability = await readCheckoutAvailability(agency.id);
  if (!legacyMerchant) return { agency, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, payLinks: [], paidPayments: {}, paymentStatusAvailable: true, clients: [] };
  if (!getRedis()) throw new WorkspaceStoreError("Payment link storage is unavailable.");
  const [links, clients, displayName] = await Promise.all([listPayLinks(), agencyClients(actor, agency.id), merchantDisplayName(agency.id)]);
  const payLinks = links.filter(link => link.agencyWorkspaceId === agency.id || !link.agencyWorkspaceId);
  // Only return money records belonging to the exact links this agency can see.
  let paymentStatusAvailable = true;
  const payments = await listBuildPayments(200, { readOnly: true, strict: true }).catch(() => { paymentStatusAvailable = false; return []; });
  const slugs = new Set(payLinks.map(link => link.slug));
  const paidPayments: Record<string, { amountCents: number; customerEmail?: string; paidAt: string }> = {};
  for (const payment of payments) {
    if (!payment.paySlug || !slugs.has(payment.paySlug)) continue;
    if (!paidPayments[payment.paySlug] || payment.createdAt > paidPayments[payment.paySlug]!.paidAt) {
      paidPayments[payment.paySlug] = { amountCents: payment.amountCents, customerEmail: payment.customerEmail, paidAt: payment.createdAt };
    }
  }
  return { agency: { ...agency, name: displayName }, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, clients, payLinks, paidPayments, paymentStatusAvailable };
}

const cents = z.number().int().min(5000).max(1000000).multipleOf(5000);
export const paymentLinkCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), agencyWorkspaceId: uuid, idempotencyKey: uuid, expectedActorId: uuid.optional(),
    clientName: z.string().trim().min(1).max(160), businessWorkspaceId: uuid.optional(),
    slug: z.string().trim().min(1).max(100).optional(), description: z.string().trim().min(1).max(1000),
    amountCents: cents.optional(), minCents: cents.optional(), maxCents: cents.optional(),
  }).strict(),
  z.object({ action: z.literal("revoke"), agencyWorkspaceId: uuid, idempotencyKey: uuid, expectedActorId: uuid.optional(), slug: z.string().min(1).max(100) }).strict(),
]);

export async function commandAgencyPaymentLink(actor: WorkspaceActor, raw: unknown) {
  const input = paymentLinkCommandSchema.parse(raw);
  if (input.expectedActorId && input.expectedActorId !== actor.userId) throw new WorkspaceAccessError();
  const agency = await paymentLinkAgency(actor, input.agencyWorkspaceId);
  if (agency.id !== legacyMerchantAgencyId()) throw new WorkspaceAccessError("Use your agency's Connect payment agreements.");
  if (input.action === "revoke") {
    const slug = normalizePayLinkSlug(input.slug);
    if (!slug || (slug === "rohlax" || slug === "index")) throw new PayLinkValidationError("Choose an existing payment link.");
    const link = await getPayLink(slug);
    if (!link || (link.agencyWorkspaceId && link.agencyWorkspaceId !== agency.id)) throw new WorkspaceAccessError();
    await currentMerchantAgency(actor, agency.id);
    return revokePayLink(slug, agency.id, actor.userId, input.idempotencyKey);
  }
  let clientName = input.clientName;
  if (input.businessWorkspaceId) {
    const client = (await agencyClients(actor, agency.id)).find(item => item.customerWorkspaceId === input.businessWorkspaceId);
    if (!client) throw new WorkspaceAccessError();
    clientName = client.name;
  }
  const generated = input.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "payment";
  const slug = input.slug ?? `${generated}-${payLinkDigest(`${agency.id}:${actor.userId}:${input.idempotencyKey}`).slice(0, 12)}`;
  if (normalizePayLinkSlug(slug) === "rohlax") throw new PayLinkValidationError("This payment address is reserved.");
  const config = buildPayLinkConfig({ slug, clientName, door: "build", amountCents: input.amountCents,
    minCents: input.minCents, maxCents: input.maxCents, customCopy: input.description,
    // Workspace-only clients have no trusted legacy tenant mapping. The existing
    // paySlug money trail remains authoritative; never accept a caller tenantId.
    leadSlug: input.businessWorkspaceId ? `business-${input.businessWorkspaceId}` : slug,
    createdBy: actor.userId,
  });
  const fingerprint = payLinkDigest(JSON.stringify({ ...input, slug: config.slug }));
  const displayName = await merchantDisplayName(agency.id);
  // Recheck ordinary owner/admin membership after the async client read. SQL
  // authority and Redis storage still have separate transaction boundaries.
  await currentMerchantAgency(actor, agency.id);
  return createAgencyPayLink({ ...config, createdBy: actor.userId, agencyWorkspaceId: agency.id, agencyDisplayName: displayName,
    ...(input.businessWorkspaceId ? { businessWorkspaceId: input.businessWorkspaceId } : {}),
  }, input.idempotencyKey, fingerprint);
}
