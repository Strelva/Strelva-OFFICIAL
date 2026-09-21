import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  CustomerAccessError,
  CustomerInputError,
  CustomerScopeChangedError,
  CustomerSourceError,
  CustomerStoreError,
  CustomerUnavailableError,
  customersReleaseEnabled,
  CUSTOMER_INSTALLATION_VIEWS,
  type CustomerActor,
} from "@/platform/customers";
import { readCustomerInstallation } from "@/server/customers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MAX_OPAQUE_LENGTH = 2_048;
const VERIFIED_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const customerParam = z.string().uuid();
const resourceParam = z.string().uuid();

const installationQuery = z.object({
  organizationId: z.string().uuid(),
  view: z.enum(CUSTOMER_INSTALLATION_VIEWS).default("summary"),
  cursor: z.string().min(1).max(MAX_OPAQUE_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  reference: z.string().min(1).max(MAX_OPAQUE_LENGTH).optional(),
}).superRefine((value, context) => {
  if (value.view === "receipt" && value.reference === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "receipt reference required" });
  }
  if (value.view !== "receipts" && (value.cursor !== undefined || value.limit !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["limit"], message: "pagination is only valid for receipt lists" });
  }
  if (value.view !== "receipt" && value.reference !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "reference is only valid for one receipt" });
  }
});

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
    return errorJson("invalid_request", "Check the installation scope, view, or pagination and try again.", 400);
  }
  if (error instanceof CustomerAccessError) {
    return errorJson("organization_forbidden", "This organization is unavailable to your account.", 403);
  }
  if (error instanceof CustomerUnavailableError) {
    // Missing, revoked, and unassigned resources intentionally share one
    // response so an ID cannot be used to probe another customer's mappings.
    return errorJson("resource_unavailable", "This resource is unavailable to your account.", 404);
  }
  if (error instanceof CustomerScopeChangedError) {
    return errorJson("scope_changed", "Customer access changed. Refresh and try again.", 409);
  }
  if (error instanceof CustomerSourceError || error instanceof CustomerStoreError) {
    return errorJson("source_unavailable", "Customer data is unavailable right now. Try again later.", 503);
  }
  return errorJson("source_unavailable", "Customer data is unavailable right now. Try again later.", 503);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string; resourceId: string }> },
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

  const routeParams = await params;
  const validCustomer = customerParam.safeParse(routeParams.customerId);
  const validResource = resourceParam.safeParse(routeParams.resourceId);
  const query = new URL(request.url).searchParams;
  const parsed = installationQuery.safeParse({
    organizationId: query.get("organizationId") || undefined,
    view: query.has("view") ? query.get("view") : undefined,
    cursor: query.has("cursor") ? query.get("cursor") : undefined,
    limit: query.has("limit") ? query.get("limit") : undefined,
    reference: query.has("reference") ? query.get("reference") : undefined,
  });
  if (!validCustomer.success || !validResource.success || !parsed.success) {
    return errorJson("invalid_request", "Check the installation scope, view, or pagination and try again.", 400);
  }

  try {
    return json(await readCustomerInstallation(
      current,
      parsed.data.organizationId,
      validCustomer.data,
      validResource.data,
      parsed.data.view,
      {
        ...(parsed.data.cursor === undefined ? {} : { cursor: parsed.data.cursor }),
        ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
        ...(parsed.data.reference === undefined ? {} : { reference: parsed.data.reference }),
      },
    ));
  } catch (error) {
    return failure(error);
  }
}
