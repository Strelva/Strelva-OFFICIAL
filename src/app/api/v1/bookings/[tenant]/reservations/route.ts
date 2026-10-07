import { bookingAlternativeRange, nativeBookingAlternatives } from "@/platform/bookings/conflicts";
import { agentBookingSchema, agentReceipt, requestAgentBooking } from "@/platform/bookings/native";
import { deliverBookingUpdates } from "@/platform/bookings/updates";
import { isTenantId } from "@/lib/scaffold-contracts";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { agentCallLimited, agentHoldCall, agentIdentityLimitsEnabled, isDisposableEmail } from "@/platform/agent-channel/limits";
import { publicBookingVisitorSchema } from "@/products/scheduling/server";
import { bookingConflictError, bookingJson, bookingOptions, bookingService, bodyObject, stringValue } from "../../_shared";

function integerValue(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

export async function OPTIONS(): Promise<Response> {
  return bookingOptions();
}

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  const body = await bodyObject(request);
  // Assistant holds arrive from shared provider egress; with identity limits
  // on they are counted by business, customer, request and agent, not by IP.
  const agentHold = body?.origin === "agent" && agentIdentityLimitsEnabled();
  try {
    const limited = agentHold
      ? await agentCallLimited(request, agentHoldCall(tenant, body), { legacyPrefix: `v1-bookings:${tenant}` })
      : await isRateLimitedAsync(rateLimitKey(request, `v1-bookings:${tenant}`), 20);
    if (limited) return bookingJson({ error: "Too many booking requests." }, 429);
  } catch {
    // A limiter outage must not make a truthful booking boundary look like an
    // availability outage; the durable idempotency key still protects retries.
  }
  if (!body) return bookingJson({ error: "Invalid request body." }, 400);
  if (body.origin === "agent") {
    const parsed = agentBookingSchema.safeParse(body);
    if (!parsed.success) return bookingJson({ error: "Enter the service, time, agent and customer details." }, 400);
    if (agentHold && isDisposableEmail(parsed.data.customer.email)) return bookingJson({ error: "Use the customer's own email address. The confirmation is sent there." }, 400);
    try {
      const result = await requestAgentBooking(tenant, parsed.data);
      await deliverBookingUpdates(result.booking.id).catch(() => undefined);
      return bookingJson(agentReceipt(result), result.created ? 201 : 200);
    } catch (error) { return bookingConflictError(error, () => nativeBookingAlternatives(tenant, parsed.data.serviceId)); }
  }
  const capabilityId = stringValue(body.capabilityId, 200);
  const capabilityVersion = integerValue(body.capabilityVersion);
  const slotId = stringValue(body.slotId, 256);
  const visitor = publicBookingVisitorSchema.safeParse(body.visitor);
  const requestId = body.requestId === undefined ? undefined : stringValue(body.requestId, 96);
  if (!capabilityId || !capabilityVersion || !slotId || !visitor.success || (body.requestId !== undefined && !requestId)) {
    return bookingJson({ error: "Enter the booking capability, time, and visitor details." }, 400);
  }
  try {
    return bookingJson(await bookingService().reserve({
      tenantId: tenant,
      capabilityId,
      capabilityVersion,
      slotId,
      visitor: visitor.data,
      ...(requestId ? { requestId } : {}),
    }), 201);
  } catch (error) {
    return bookingConflictError(error, () => bookingService().read({ tenantId: tenant, capabilityId, range: bookingAlternativeRange() }));
  }
}
