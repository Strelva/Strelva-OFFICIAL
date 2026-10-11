import { z } from "zod";
import { getLeadById } from "@/lib/leads";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { assertWorkspaceCalendarManager } from "@/products/scheduling/server";
import { bookingInquiryOffersEnabled, bookingOfferEmailOptions, prepareInquiryBookingOffer, requireInquiryBookingOffers } from "@/platform/bookings/inquiry-offers";
import { bookingCustomerEmailAllowed } from "@/platform/bookings/updates";
import { readInquiryProposalOptions } from "@/products/bookings/server";
import { PublicBookingError } from "@/platform/bookings/errors";
import { readBookingContext } from "@/platform/bookings/store";
const schema = z.object({ workspaceId: z.string().uuid(), tenantId: z.string().regex(/^[a-z0-9-]+$/), inquiryId: z.string().min(1).max(200), serviceId: z.string().min(1).max(200), starts: z.array(z.string().datetime({ offset: true })).min(1).max(3), expectedCustomerEmail: z.string().email().max(320).optional() }).strict();
function failure(error: unknown) {
  if (error instanceof PublicBookingError) return workspaceJson({ error: error.message }, error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid" ? 400 : 503);
  return workspaceHttpFailure(error);
}
const query = schema.omit({ starts: true, expectedCustomerEmail: true }).extend({ serviceId: z.string().min(1).max(200).optional() });
/** Discovery for an owner-selected reply. Read-only; no public agent flag is needed. */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !bookingInquiryOffersEnabled()) return workspaceJson({ error: "Booking suggestions are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to propose times." }, 401);
    await requireInquiryBookingOffers();
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (await isRateLimitedWindowedAsync(`inquiry-offer-read:${actor.userId}`, 30, 60000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readInquiryProposalOptions(actor, input));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !bookingInquiryOffersEnabled()) return workspaceJson({ error: "Booking suggestions are not enabled." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to propose times." }, 401);
    const input = schema.parse(await readWorkspaceBody(request, 4000));
    await assertWorkspaceCalendarManager(actor, input.workspaceId);
    const ctx = await readBookingContext(input.tenantId);
    if (ctx?.workspaceId !== input.workspaceId) return workspaceJson({ error: "Inquiry unavailable." }, 404);
    if (await isRateLimitedWindowedAsync(`inquiry-offer:${actor.userId}`, 20, 60000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const inquiry = await getLeadById(input.tenantId, input.inquiryId);
    if (!inquiry?.email) return workspaceJson({ error: "Inquiry has no customer email." }, 404);
    if (input.expectedCustomerEmail && inquiry.email.trim().toLowerCase() !== input.expectedCustomerEmail.trim().toLowerCase()) return workspaceJson({ error: "The customer's email changed. Reload the inquiry before sending." }, 409);
    const offer = await prepareInquiryBookingOffer({ tenantId: input.tenantId, inquiryId: input.inquiryId, serviceId: input.serviceId, starts: input.starts, source: "owner", customer: { name: inquiry.name, email: inquiry.email } });
    if (!offer) return workspaceJson({ error: "No request-mode times are available." }, 409);
    let delivery: "accepted" | "suppressed" | "unavailable" = "suppressed";
    if (await bookingCustomerEmailAllowed(input.tenantId)) {
      try {
        const sent = await sendEmailWithReceipt({ audience: "customer", tenantId: input.tenantId, to: inquiry.email,
          fromAddress: "bookings@mail.strelva.com", subject: `Suggested times: ${offer.serviceName}`,
          idempotencyKey: `inquiry-offer:${offer.id}`, options: { heading: "Choose a time to request", paragraphs: ["The business suggested these times. Choose one to request it. The business will confirm your request."], ...bookingOfferEmailOptions(offer) } });
        delivery = sent.status;
      } catch { delivery = "unavailable"; }
    }
    return workspaceJson({ offer, delivery });
  } catch (error) { return failure(error); }
}
