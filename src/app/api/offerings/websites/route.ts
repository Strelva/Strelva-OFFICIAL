import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import {
  OfferingAccessError,
  OfferingConflictError,
  OfferingNotFoundError,
  OfferingService,
  OfferingStoreError,
  OfferingValidationError,
  PostgresOfferingStore,
  type OfferingActor,
} from "@/platform/offerings";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

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

async function actor(): Promise<OfferingActor | null> {
  const user = await getSessionUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user?.id || !email || !user.email_confirmed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { userId: user.id, verifiedEmail: email };
}

function failure(error: unknown): NextResponse {
  if (error instanceof OfferingValidationError) return json({ error: { code: "invalid_request", message: error.message } }, 400);
  if (error instanceof OfferingAccessError) return json({ error: { code: "business_forbidden", message: error.message } }, 403);
  if (error instanceof OfferingNotFoundError) return json({ error: { code: "binding_not_found", message: error.message } }, 404);
  if (error instanceof OfferingConflictError) return json({ error: { code: "binding_conflict", message: error.message } }, 409);
  if (error instanceof OfferingStoreError) return json({ error: { code: "source_unavailable", message: error.message } }, 503);
  return json({ error: { code: "source_unavailable", message: "Website attachment data is unavailable right now." } }, 503);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!workspaceReleaseEnabled()) return json({ error: { code: "offerings_release_closed", message: "Offerings are not enabled for this environment." } }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: { code: "invalid_origin", message: "Open Strelva directly to attach a website." } }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "invalid_content_type", message: "Send a JSON request." } }, 415);
  }
  let current: OfferingActor | null;
  try {
    current = await actor();
  } catch {
    return json({ error: { code: "source_unavailable", message: "Website attachment data is unavailable right now." } }, 503);
  }
  if (!current) return json({ error: { code: "unauthenticated", message: "Sign in with a confirmed email to attach a website." } }, 401);
  try {
    const websiteBinding = await new OfferingService(new PostgresOfferingStore()).executeWebsiteBinding(
      current,
      await readWorkspaceBody(request, 20_000),
    );
    return json({ websiteBinding });
  } catch (error) {
    return failure(error);
  }
}
