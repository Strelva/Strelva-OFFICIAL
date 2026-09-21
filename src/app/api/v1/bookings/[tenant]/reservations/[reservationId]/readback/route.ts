import { isTenantId } from "@/lib/scaffold-contracts";
import { recoverPublicWebsiteBooking } from "@/products/scheduling/server";
import { bookingError, bookingJson, bookingOptions, bodyObject, stringValue } from "../../../../_shared";

export async function OPTIONS(): Promise<Response> {
  return bookingOptions();
}

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string; reservationId: string }> }) {
  const { tenant, reservationId } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  const body = await bodyObject(request);
  const managementToken = body ? stringValue(body.managementToken, 2_048) : undefined;
  if (!managementToken || !reservationId) return bookingJson({ error: "The booking recovery request is incomplete." }, 400);
  try {
    return bookingJson(await recoverPublicWebsiteBooking({ tenantId: tenant, reservationId, managementToken }));
  } catch (error) {
    return bookingError(error);
  }
}
