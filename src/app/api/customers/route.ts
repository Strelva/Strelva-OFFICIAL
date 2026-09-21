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
import { listCustomers } from "@/server/customers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const listParams = z.object({
  organizationId: z.string().uuid(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
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
    return errorJson("invalid_request", "Check the customer scope, search, or cursor and try again.", 400);
  }
  if (error instanceof CustomerAccessError) {
    return errorJson("organization_forbidden", "This organization is unavailable to your account.", 403);
  }
  if (error instanceof CustomerUnavailableError) {
    // Do not distinguish a missing relationship from one outside the actor's
    // assignments.  The response cannot be used to enumerate private IDs.
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

export async function GET(request: Request): Promise<NextResponse> {
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

  const params = new URL(request.url).searchParams;
  const parsed = listParams.safeParse({
    organizationId: params.get("organizationId") || undefined,
    q: params.get("q") || undefined,
    cursor: params.get("cursor") || undefined,
    limit: params.get("limit") || undefined,
  });
  if (!parsed.success) {
    return errorJson("invalid_request", "Check the customer scope, search, or cursor and try again.", 400);
  }

  try {
    return json(await listCustomers(current, parsed.data.organizationId, {
      ...(parsed.data.q !== undefined ? { query: parsed.data.q } : {}),
      ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    }));
  } catch (error) {
    return failure(error);
  }
}
