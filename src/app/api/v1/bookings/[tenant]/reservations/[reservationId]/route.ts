import { isTenantId } from "@/lib/scaffold-contracts";
import { bookingError, bookingJson, bookingOptions, bookingService, bodyObject, stringValue } from "../../../_shared";

function integerValue(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

export async function OPTIONS(): Promise<Response> {
  return bookingOptions();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tenant: string; reservationId: string }> }) {
  const { tenant, reservationId } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  const body = await bodyObject(request);
  if (!body) return bookingJson({ error: "Invalid request body." }, 400);
  const managementToken = stringValue(body.managementToken, 256);
  const capabilityId = stringValue(body.capabilityId, 200);
  const capabilityVersion = integerValue(body.capabilityVersion);
  const slotId = stringValue(body.slotId, 256);
  if (!managementToken || !capabilityId || !capabilityVersion || !slotId || !reservationId) return bookingJson({ error: "The reservation change is incomplete." }, 400);
  try {
    return bookingJson(await bookingService().change({ tenantId: tenant, reservationId, managementToken, capabilityId, capabilityVersion, slotId }));
  } catch (error) {
    return bookingError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tenant: string; reservationId: string }> }) {
  const { tenant, reservationId } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  const body = await bodyObject(request);
  const managementToken = body ? stringValue(body.managementToken, 256) : undefined;
  if (!managementToken || !reservationId) return bookingJson({ error: "The reservation cancellation is incomplete." }, 400);
  try {
    return bookingJson(await bookingService().cancel({ tenantId: tenant, reservationId, managementToken }));
  } catch (error) {
    return bookingError(error);
  }
}
