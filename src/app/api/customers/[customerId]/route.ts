import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  CustomerAccessError,
  CustomerInputError,
  CustomerScopeChangedError,
  CustomerStoreError,
  CustomerUnavailableError,
  customersReleaseEnabled,
  type CustomerActor,
} from "@/platform/customers";
import { readCustomer } from "@/server/customers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const organizationParam = z.string().uuid();
const customerParam = z.string().uuid();
const VERIFIED_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function errorJson(code: string, message: string, status: number): NextResponse {
  return json({ error: { code, message } }, status);
}

async function actor(): Promise<CustomerActor | null> {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user?.id || !email || !user.email_confirmed_at || !VERIFIED_EMAIL.test(email)) return null;
  return { userId: user.id, verifiedEmail: email };
}

function failure(error: unknown): NextResponse {
  if (error instanceof CustomerInputError) {
    return errorJson("invalid_request", "Check the customer scope and identifier and try again.", 400);
  }
  if (error instanceof CustomerAccessError) {
    return errorJson("organization_forbidden", "This organization is unavailable to your account.", 403);
  }
  if (error instanceof CustomerUnavailableError) {
    return errorJson("customer_unavailable", "This customer is unavailable to your account.", 404);
  }
  if (error instanceof CustomerScopeChangedError) {
    return errorJson("scope_changed", "Customer access changed. Refresh and try again.", 409);
  }
  if (error instanceof CustomerStoreError) {
    return errorJson("source_unavailable", "Customer data is unavailable right now. Try again later.", 503);
  }
  return errorJson("source_unavailable", "Customer data is unavailable right now. Try again later.", 503);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
): Promise<NextResponse> {
  if (!workspaceReleaseEnabled() || !customersReleaseEnabled()) {
    return errorJson("customers_release_closed", "Customers is not enabled for this environment.", 503);
  }

  let current: CustomerActor | null;
  try {
    current = await actor();
  } catch {
    return errorJson("source_unavailable", "Customer data is unavailable right now. Try again later.", 503);
  }
  if (!current) return errorJson("unauthenticated", "Sign in with a confirmed email to view customers.", 401);

  const customerId = (await params).customerId;
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const validOrganization = organizationParam.safeParse(organizationId);
  const validCustomer = customerParam.safeParse(customerId);
  if (!validOrganization.success || !validCustomer.success) {
    return errorJson("invalid_request", "Check the customer scope and identifier and try again.", 400);
  }

  try {
    return json(await readCustomer(current, validOrganization.data, validCustomer.data));
  } catch (error) {
    return failure(error);
  }
}
