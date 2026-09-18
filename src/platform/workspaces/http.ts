import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { WorkspaceAccessError, WorkspaceConflictError } from "./types";
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
export async function readWorkspaceBody(request: Request, maximum = 150000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new z.ZodError([]);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new z.ZodError([]); }
      chunks.push(next.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new z.ZodError([]); }
  } finally { reader.releaseLock(); }
}
export function workspaceHttpFailure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This work is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
  return workspaceJson({ error: "The operation could not be confirmed. Reload its current state before trying again." }, 503);
}
