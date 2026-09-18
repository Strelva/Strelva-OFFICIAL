import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
function failed(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "You do not have current access for this work action." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  if (error instanceof z.ZodError) return json({ error: "Check the work request and its limits." }, 400);
  return json({ error: "This change could not be confirmed. Reload the work before trying again." }, 503);
}
export function workAuthorityRoute(read: (actor: WorkspaceActor, workId: string, url: URL) => Promise<unknown>, change: (actor: WorkspaceActor, workId: string, command: unknown) => Promise<unknown>) {
  async function actor() {
    const user = await getSessionUser();
    return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
  }
  return {
    async GET(request: Request) {
      if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
      try {
        const current = await actor();
        if (!current) return json({ error: "Sign in to open this work." }, 401);
        const url = new URL(request.url);
        return json(await read(current, z.string().uuid().parse(url.searchParams.get("workId")), url));
      } catch (error) { return failed(error); }
    },
    async POST(request: Request) {
      if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
      if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to change work access." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
      try {
        const current = await actor();
        if (!current) return json({ error: "Sign in to change this work." }, 401);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "Supply a work request." }, 400);
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 100000) { await reader.cancel(); return json({ error: "This request is too large." }, 413); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json({ error: "Send a valid work request." }, 400); }
        const input = z.object({ workId: z.string().uuid(), command: z.unknown() }).strict().parse(body);
        return json(await change(current, input.workId, input.command));
      } catch (error) { return failed(error); }
    },
  };
}
