import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  acceptPayerJob, commandPayerTransition, readPayerTransitionInbox, readPayerTransitions, PayerTransitionAccessError,
  PayerTransitionConflictError, PayerTransitionNotFoundError,
  PayerTransitionPersistenceError, PayerTransitionValidationError,
} from "@/platform/work-economics/payer-transitions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

async function actor() {
  const user = await getSessionUser();
  return user?.id && user.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
function failure(error: unknown) {
  if (error instanceof PayerTransitionValidationError) return json({ error: error.message }, 400);
  if (error instanceof PayerTransitionAccessError) return json({ error: error.message }, 403);
  if (error instanceof PayerTransitionNotFoundError) return json({ error: error.message }, 404);
  if (error instanceof PayerTransitionConflictError) return json({ error: error.message }, 409);
  if (error instanceof PayerTransitionPersistenceError) return json({ error: error.message }, 503);
  return json({ error: "The payer change could not be confirmed." }, 503);
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Work economics is not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Unauthorized" }, 401);
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    return json(workspaceId ? await readPayerTransitions(current, workspaceId) : await readPayerTransitionInbox(current));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Work economics is not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Unauthorized" }, 401);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to change the payer." }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
    const text = await request.text();
    if (text.length > 16_384) return json({ error: "Request body is too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid request body." }, 400); }
    return json(body && typeof body === "object" && (body as { action?: unknown }).action === "accept_job"
      ? await acceptPayerJob(current, body)
      : await commandPayerTransition(current, body));
  } catch (error) { return failure(error); }
}
