import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { productLearningEnabled, createWorkspaceLearning, readWorkspaceLearning, changeWorkspaceLearning, collectWorkspaceLearning } from "@/products/product-learning/server";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
function failed(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "Internal research access and workspace membership are required." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  if (error instanceof z.ZodError) return json({ error: "Some research evidence is incomplete or outside its supported limits.", fields: error.issues.map(issue => issue.path.join(".")).slice(0, 20) }, 400);
  return json({ error: "Research storage is unavailable. The change has not been confirmed." }, 503);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !productLearningEnabled()) return json({ error: "Internal research is not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to open internal research." }, 401);
    return json(await readWorkspaceLearning(current, new URL(request.url).searchParams.get("workId") ?? ""));
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !productLearningEnabled()) return json({ error: "Internal research is not enabled." }, 503);
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to change internal research." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to change internal research." }, 401);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Supply a research request." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 200000) { await reader.cancel(); return json({ error: "This request is too large." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json({ error: "Send a valid research request." }, 400); }
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), workspaceId: z.string().uuid(), input: z.unknown() }).strict(),
      z.object({ action: z.literal("command"), workId: z.string().uuid(), command: z.unknown() }).strict(),
      z.object({ action: z.literal("collect"), workId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }).strict(),
    ]).parse(body);
    if (input.action === "create") return json(await createWorkspaceLearning(current, input.workspaceId, input.input));
    if (input.action === "collect") return json(await collectWorkspaceLearning(current, input.workId, input.expectedRevision));
    return json(await changeWorkspaceLearning(current, input.workId, input.command));
  } catch (error) { return failed(error); }
}
