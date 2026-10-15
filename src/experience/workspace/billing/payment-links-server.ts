import { z } from "zod";
import { getRedis } from "@/platform/infra/redis";
import { listMemberAgencies } from "@/platform/workspaces/agency-onboarding";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { readCheckoutAvailability } from "@/platform/connect/checkout-availability";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";
import { getPayLink, listPayLinks, normalizePayLinkSlug, payLinkDigest, PayLinkConflictError, PayLinkValidationError, revokePayLink, type PayLinkConfig } from "@/platform/infra/pay-links";
import { agencyPayLinksEnabled, commandAgencyPayLinkRecord, payLinkStore, readAgencyPayLinkRecords, readPublicAgencyPayLink, toLegacyPayLinkConfig } from "@/platform/agency-pay-links";
import { expireOpenAgencyPayLinkCheckouts } from "@/platform/agency-pay-links/checkout";
import { canonicalJson } from "@/platform/client-records/mirror";
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

const CREATION_REASON = { coming_soon: "off", ready: "ready", setup_required: "setup_required", unavailable: "unavailable" } as const;

export async function readAgencyPaymentLinks(actor: WorkspaceActor, agencyWorkspaceId: string) {
  const agency = await paymentLinkAgency(actor, agencyWorkspaceId);
  const checkoutAvailability = await readCheckoutAvailability(agency.id);
  const enabled = agencyPayLinksEnabled();
  const postgres = payLinkStore() === "postgres";
  const creation = { enabled, reason: enabled ? CREATION_REASON[checkoutAvailability.status] : "off" as const };
  const rows = enabled || postgres ? await readAgencyPayLinkRecords(actor, agency.id) : [];
  const connectedLinks = enabled ? rows.filter(row => row.rail === "connected_account") : [];
  let payLinks: PayLinkConfig[];
  let legacyMerchant: boolean;
  if (postgres) {
    // Backfilled legacy links belong to whichever agency owns them. No agency is special here.
    payLinks = rows.filter(row => row.rail === "platform_legacy").map(toLegacyPayLinkConfig);
    legacyMerchant = payLinks.length > 0;
  } else {
    // TODO: remove this Strelva Agency check once STRELVA_PAY_LINK_STORE=postgres is the only store.
    legacyMerchant = agency.id === strelvaAgencyWorkspaceId();
    payLinks = [];
  }
  if (!legacyMerchant) return { agency, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, payLinks: [], paidPayments: {}, paymentStatusAvailable: true, clients: [], connectedLinks, creation };
  if (!postgres && !getRedis()) throw new WorkspaceStoreError("Payment link storage is unavailable.");
  const displayName = await merchantDisplayName(agency.id);
  if (!postgres) {
    const links = await listPayLinks();
    payLinks = links.filter(link => link.agencyWorkspaceId === agency.id || !link.agencyWorkspaceId);
  }
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
  return { agency: { ...agency, name: displayName }, currentActorId: actor.userId, legacyMerchant, checkoutAvailability, clients: [], payLinks, paidPayments, paymentStatusAvailable, connectedLinks, creation };
}

const cents = z.number().int().min(5000).max(1000000).multipleOf(5000);
// An invoice amount the agency sets for this link. Strelva sets no floor price.
const invoiceCents = z.number().int().min(100).max(100000000);
export const paymentLinkCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), agencyWorkspaceId: uuid, idempotencyKey: uuid, expectedActorId: uuid.optional(),
    clientName: z.string().trim().min(1).max(160), businessWorkspaceId: uuid.optional(),
    slug: z.string().trim().min(1).max(100).optional(), description: z.string().trim().min(1).max(1000),
    amountCents: invoiceCents.optional(), minCents: cents.optional(), maxCents: cents.optional(),
  }).strict().superRefine((value, ctx) => {
    const range = value.minCents !== undefined || value.maxCents !== undefined;
    if ((value.amountCents !== undefined) === range) ctx.addIssue({ code: "custom", message: "Provide one amount, or a minimum and maximum." });
    else if (range && (value.minCents === undefined || value.maxCents === undefined || value.minCents > value.maxCents || (value.maxCents - value.minCents) % 5000 !== 0)) ctx.addIssue({ code: "custom", message: "A range needs a minimum, a maximum and whole $50 steps between them." });
  }),
  z.object({ action: z.literal("revoke"), agencyWorkspaceId: uuid, idempotencyKey: uuid, expectedActorId: uuid.optional(), slug: z.string().min(1).max(100) }).strict(),
]);

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function commandAgencyPaymentLink(actor: WorkspaceActor, raw: unknown) {
  const input = paymentLinkCommandSchema.parse(raw);
  if (input.expectedActorId && input.expectedActorId !== actor.userId) throw new WorkspaceAccessError();
  const agency = await paymentLinkAgency(actor, input.agencyWorkspaceId);
  if (input.action === "create") {
    // Off: new links wait for the agency's own Stripe account, exactly as before.
    if (!agencyPayLinksEnabled()) throw new PayLinkValidationError("Payment links · Coming soon. New payment links need your agency's Stripe Connect account. No payment link was created.");
    if ((await readCheckoutAvailability(agency.id)).status !== "ready") throw new PayLinkValidationError("Finish your agency's Stripe setup before creating payment links. No payment link was created.");
    // Deterministic per request key, so a replay sends the identical command.
    const slug = input.slug ? normalizePayLinkSlug(input.slug) : `${slugify(input.clientName).slice(0, 60) || "payment"}-${input.idempotencyKey.slice(0, 6)}`;
    if (!slug || slug === "index" || slug === "rohlax") throw new PayLinkValidationError("Choose a link address with lowercase letters, numbers and hyphens.");
    if (payLinkStore() === "redis" && await getPayLink(slug)) throw new PayLinkConflictError(slug);
    const fingerprint = payLinkDigest(canonicalJson({ action: "create", agencyWorkspaceId: agency.id, clientName: input.clientName, description: input.description, slug: input.slug ?? null, amountCents: input.amountCents ?? null, minCents: input.minCents ?? null, maxCents: input.maxCents ?? null, businessWorkspaceId: input.businessWorkspaceId ?? null }));
    return commandAgencyPayLinkRecord(actor, {
      action: "create", agencyWorkspaceId: agency.id, idempotencyKey: input.idempotencyKey, fingerprint, slug, clientName: input.clientName, description: input.description,
      amountCents: input.amountCents, minCents: input.minCents, maxCents: input.maxCents, businessWorkspaceId: input.businessWorkspaceId, agencyDisplayName: await merchantDisplayName(agency.id),
    });
  }
  const slug = normalizePayLinkSlug(input.slug);
  if (!slug || (slug === "rohlax" || slug === "index")) throw new PayLinkValidationError("Choose an existing payment link.");
  const postgres = payLinkStore() === "postgres";
  const connected = !postgres && agencyPayLinksEnabled() ? (await readPublicAgencyPayLink(slug).catch(() => null))?.rail === "connected_account" : false;
  if (postgres || connected) {
    const link = await commandAgencyPayLinkRecord(actor, { action: "revoke", agencyWorkspaceId: agency.id, idempotencyKey: input.idempotencyKey, slug, fingerprint: payLinkDigest(`revoke:${slug}`) });
    if (link.rail !== "connected_account") return link;
    const { closed, unconfirmed } = await expireOpenAgencyPayLinkCheckouts(link.id);
    return { ...link, checkoutsClosed: closed, checkoutsUnconfirmed: unconfirmed };
  }
  // Redis-held legacy links: only the legacy merchant (Strelva Agency) owns this data.
  if (agency.id !== strelvaAgencyWorkspaceId()) throw new WorkspaceAccessError();
  const link = await getPayLink(slug);
  if (!link || (link.agencyWorkspaceId && link.agencyWorkspaceId !== agency.id)) throw new WorkspaceAccessError();
  await currentMerchantAgency(actor, agency.id);
  return revokePayLink(slug, agency.id, actor.userId, input.idempotencyKey);
}
