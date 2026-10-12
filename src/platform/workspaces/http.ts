import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceMakeSystemsError } from "./types";
export const workspaceJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
export async function workspaceHttpActor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
export function workspaceWriteGuard(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return workspaceJson({ error: "Open Strelva directly to change this work." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return workspaceJson({ error: "Send a JSON request." }, 415);
  return null;
}
/**
 * Thrown when a request body passes its byte limit. It is still a ZodError so
 * callers that only know "bad input" keep failing closed; callers that know
 * this class answer 413.
 */
const BODY_TOO_LARGE = Symbol.for("strelva.workspaceBodyTooLarge");
export class WorkspaceBodyTooLargeError extends z.ZodError {
  readonly [BODY_TOO_LARGE] = true;
  constructor() { super([]); }
}
/**
 * Zod 4 brands its errors, so `instanceof` on a ZodError subclass matches
 * every ZodError. Check the own marker instead.
 */
export function isWorkspaceBodyTooLarge(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[BODY_TOO_LARGE] === true;
}
/** Reject on a declared Content-Length over the limit, before reading anything. */
export function assertDeclaredBodyWithin(request: Request, maximum: number) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new WorkspaceBodyTooLargeError();
}
/** Read at most `maximum` bytes, including chunked requests without Content-Length. */
export async function readBoundedBody(request: Request, maximum: number): Promise<Buffer> {
  assertDeclaredBodyWithin(request, maximum);
  const reader = request.body?.getReader();
  if (!reader) throw new z.ZodError([]);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new WorkspaceBodyTooLargeError(); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export async function readWorkspaceBody(request: Request, maximum = 150000): Promise<unknown> {
  const raw = await readBoundedBody(request, maximum);
  try { return JSON.parse(raw.toString("utf8")); } catch { throw new z.ZodError([]); }
}
export function workspaceHttpFailure(error: unknown) {
  // Owners, admins and members can file the tool as a Request instead.
  if (error instanceof WorkspaceMakeSystemsError) return workspaceJson({ error: error.message, code: error.code }, 403);
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This work is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message }, 409);
  if (isWorkspaceBodyTooLarge(error)) return workspaceJson({ error: "This request is too large." }, 413);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
  return workspaceJson({ error: "The operation could not be confirmed. Reload its current state before trying again." }, 503);
}
