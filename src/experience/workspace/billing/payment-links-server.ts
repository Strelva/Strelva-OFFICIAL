import { z } from "zod";
import { getRedis } from "@/platform/infra/redis";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readCheckoutAvailability } from "@/platform/connect/checkout-availability";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { getPayLink, listPayLinks, normalizePayLinkSlug, PayLinkValidationError, revokePayLink } from "@/platform/infra/pay-links";
import { listBuildPayments } from "@/platform/infra/revenue";

import { strelvaAgencyWorkspaceId } from "@/platform/workspaces/strelva-agency";

const uuid = z.string().uuid();
export async function paymentLinkAgency(actor: WorkspaceActor, id: string) {
  const agency = (await listMemberAgencies(actor)).find(item => item.id === uuid.parse(id));
  if (!agency || (agency.role !== "owner" && agency.role !== "admin")) throw new WorkspaceAccessError();
  return agency;
}

async function currentMerchantAgency(actor: WorkspaceActor, id: string) {
  const agency = await paymentLinkAgency(actor, id);
  if (agency.id !== strelvaAgencyWorkspaceId()) throw new WorkspaceAccessError();
  return agency;
}

async function merchantDisplayName(id: string) {
  const brand = await resolveOwnerBrand(id);
  if (brand.agencyId !== id) throw new WorkspaceStoreError("The charging agency's identity could not be confirmed.");
  return brand.name;
}

export async function readAgencyPaymentLinks(actor: WorkspaceActor, agencyWorkspaceId: string) {
  const agency = await paymentLinkAgency(actor, agencyWorkspaceId);
  const legacyMerchant = agency.id === strelvaAgencyWorkspaceId();
  const checkoutAvailability = await readCheckoutAvailability(agency.id);
  if (!legacyMerchant) return { agency, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, payLinks: [], paidPayments: {}, paymentStatusAvailable: true, clients: [] };
  if (!getRedis()) throw new WorkspaceStoreError("Payment link storage is unavailable.");
  const [links, displayName] = await Promise.all([listPayLinks(), merchantDisplayName(agency.id)]);
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
  return { agency: { ...agency, name: displayName }, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, clients: [], payLinks, paidPayments, paymentStatusAvailable };
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
  // No agency can mint new links on the platform's legacy Stripe account.
  // Historic records remain readable and revocable through their existing owner.
  if (input.action === "create") throw new PayLinkValidationError("Payment links · Coming soon. New payment links need your agency's Stripe Connect account. No payment link was created.");
  if (agency.id !== strelvaAgencyWorkspaceId()) throw new WorkspaceAccessError();
  if (input.action === "revoke") {
    const slug = normalizePayLinkSlug(input.slug);
    if (!slug || (slug === "rohlax" || slug === "index")) throw new PayLinkValidationError("Choose an existing payment link.");
    const link = await getPayLink(slug);
    if (!link || (link.agencyWorkspaceId && link.agencyWorkspaceId !== agency.id)) throw new WorkspaceAccessError();
    await currentMerchantAgency(actor, agency.id);
    return revokePayLink(slug, agency.id, actor.userId, input.idempotencyKey);
  }
}
