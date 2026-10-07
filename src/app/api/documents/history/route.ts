import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/platform/infra/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { documentHistoryEnabled, readWorkspaceDocumentHistory } from "@/products/documents/server";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: {
  "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
} });

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !documentHistoryEnabled()) return json({ error: "Document history is not enabled." }, 503);
  try {
    const user = await getSessionUser();
    if (!user?.email || !user.email_confirmed_at) return json({ error: "Sign in to open your document history." }, 401);
    const params = new URL(request.url).searchParams;
    const workId = z.string().uuid().parse(params.get("workId"));
    const rawBefore = params.get("beforeRevision");
    const before = rawBefore === null ? undefined : z.coerce.number().int().positive().max(2147483647).parse(rawBefore);
    return json(await readWorkspaceDocumentHistory({ userId: user.id, verifiedEmail: user.email.trim().toLowerCase() }, workId, before));
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return json({ error: "This document is unavailable to your account." }, 403);
    if (error instanceof z.ZodError) return json({ error: "Choose a valid document and history revision." }, 400);
    return json({ error: "Document history is unavailable. Try again." }, 503);
  }
}
