import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { readWorkspaceDocument, saveWorkspaceDocument, editWorkspaceDocument } from "@/products/documents/server";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
function failed(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This document is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: "This document changed or cannot accept this change. Reload it before continuing." }, 409);
  if (error instanceof z.ZodError) return json({ error: "Check the document title and text. Documents support up to 50,000 characters and 200 revisions." }, 400);
  return json({ error: "Document storage is unavailable. Your change has not been confirmed." }, 503);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to open your document." }, 401);
    return json(await readWorkspaceDocument(current, new URL(request.url).searchParams.get("workId") ?? ""));
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to change this document." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to save your document." }, 401);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Supply a document request." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 400000) { await reader.cancel(); return json({ error: "This request is too large." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json({ error: "Send a valid document request." }, 400); }
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), workspaceId: z.string().uuid(), input: z.unknown() }).strict(),
      z.object({ action: z.literal("command"), workId: z.string().uuid(), command: z.unknown() }).strict(),
    ]).parse(body);
    return json(input.action === "create" ? await saveWorkspaceDocument(current, input.workspaceId, input.input) : await editWorkspaceDocument(current, input.workId, input.command));
  } catch (error) { return failed(error); }
}
