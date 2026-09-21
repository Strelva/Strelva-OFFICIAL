import { NextResponse } from "next/server";
import { z } from "zod";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

export const privateJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

export function agentAccessFailure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return privateJson({ error: "This integration token is unavailable or not authorized for this work." }, 403);
  if (error instanceof WorkspaceConflictError) return privateJson({ error: error.message }, 409);
  if (error instanceof z.ZodError) return privateJson({ error: "Check the integration request and its limits." }, 400);
  if (error instanceof WorkspaceStoreError) return privateJson({ error: "The integration request could not be confirmed." }, 503);
  return privateJson({ error: "The integration request could not be completed." }, 503);
}

export async function boundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new WorkspaceConflictError("Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new WorkspaceConflictError("Supply an integration request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 50_000) {
        await reader.cancel();
        throw new WorkspaceConflictError("This integration request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new WorkspaceConflictError("Send a valid integration request."); }
}

export function bearerToken(request: Request): string {
  const match = /^Bearer (sta_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
  if (!match) throw new WorkspaceAccessError("The integration token is unavailable.");
  return match[1]!;
}
