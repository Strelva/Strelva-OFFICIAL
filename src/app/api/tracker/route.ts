import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server-client";
import { isSuperAdmin } from "@/lib/auth";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { previewTracker, readSavedTracker, readTrackerCoordinationOptions, saveNewTracker, editSavedTracker, recordTrackerExperiment } from "@/products/tracker/server";
import { TrackerConflictError, TrackerValidationError } from "@/products/tracker/contracts";
import { z } from "zod";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
async function actor() {
  const user = await getSessionUser();
  return user?.email && user.email_confirmed_at ? { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() } : null;
}
function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This tracker is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError || error instanceof TrackerConflictError) return json({ error: "This work changed. Reload it before saving another edit." }, 409);
  if (error instanceof TrackerValidationError) return json({ error: error.message }, 400);
  if (error instanceof z.ZodError) return json({ error: "Check the file and supplied information." }, 400);
  if (error instanceof WorkspaceStoreError) return json({ error: "Saved work is temporarily unavailable. Nothing has been confirmed." }, 503);
  return json({ error: "The tracker request could not be completed." }, 503);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to open your tracker." }, 401);
    const query = new URL(request.url).searchParams;
    const workId = query.get("workId") ?? "";
    return json({ ...await readSavedTracker(current, workId), canRecordExperiment: await isSuperAdmin(),
      ...(query.get("coordination") === "1" ? { coordinationOptions: await readTrackerCoordinationOptions(current, workId) } : {}) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in to create or edit a tracker." }, 401);
    if ((request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Strelva directly to make this change." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Supply a tracker request." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); return json({ error: "The request exceeds the 2 MB limit." }, 413); }
      chunks.push(value);
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request." }, 400);
    if (body.action === "preview") return json({ preview: await previewTracker(current, String(body.workspaceId ?? ""), body.input) });
    if (body.action === "create") return json(await saveNewTracker(current, body));
    if (body.action === "command") return json(await editSavedTracker(current, String(body.workId ?? ""), body.command));
    if (body.action === "experiment") {
      if (!(await isSuperAdmin())) return json({ error: "Internal R&D access is required." }, 403);
      return json(await recordTrackerExperiment(current, String(body.workId ?? ""), body.input));
    }
    return json({ error: "Unsupported tracker action." }, 400);
  } catch (error) { return failure(error); }
}
