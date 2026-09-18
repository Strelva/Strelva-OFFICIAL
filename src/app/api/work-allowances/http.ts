import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import {
  WorkAllowanceAccessError,
  WorkAllowanceConflictError,
  WorkAllowanceNotFoundError,
  WorkAllowancePayerError,
  WorkAllowancePersistenceError,
  WorkAllowanceValidationError,
} from "@/platform/work-economics/allowances";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const MAX_BODY_BYTES = 32 * 1024;

export const allowanceJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: HEADERS });

export async function allowanceActor() {
  const user = await getSessionUser();
  if (!user?.id || !user.email || !user.email_confirmed_at) return null;
  return { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
}

export function validMutationRequest(request: Request): NextResponse | null {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return allowanceJson({ error: "Open Strelva directly to change an allowance." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return allowanceJson({ error: "Send a JSON request." }, 415);
  }
  return null;
}

export async function readAllowanceBody(request: Request): Promise<Record<string, unknown> | NextResponse> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return allowanceJson({ error: "Request body is too large." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return allowanceJson({ error: "Supply an allowance command." }, 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return allowanceJson({ error: "Request body is too large." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    return allowanceJson({ error: "Send a valid allowance command." }, 400);
  }
}

export function allowanceFailure(error: unknown): NextResponse {
  if (error instanceof WorkAllowanceValidationError) return allowanceJson({ error: error.message }, 400);
  if (error instanceof WorkAllowancePayerError || error instanceof WorkAllowanceAccessError) return allowanceJson({ error: error.message }, 403);
  if (error instanceof WorkAllowanceNotFoundError) return allowanceJson({ error: error.message }, 404);
  if (error instanceof WorkAllowanceConflictError) return allowanceJson({ error: error.message }, 409);
  if (error instanceof WorkAllowancePersistenceError) return allowanceJson({ error: error.message }, 503);
  return allowanceJson({ error: "The allowance change could not be confirmed." }, 503);
}
