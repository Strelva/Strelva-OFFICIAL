import { assertGoogleReviewArchiveCurrent } from "@/platform/google-review-content";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { WorkspaceActor } from "@/platform/workspaces";
import { WorkspaceExportV3Error, type V3Rpc } from "./v3";

export const exportBuildIdSchema = z.string().uuid();
const statusSchema = z.object({ status: z.enum(["building", "ready", "failed", "expired", "stalled"]) });
const partSchema = z.object({ body: z.string(), partCount: z.number().int().positive() });

function databaseRpc(): V3Rpc {
  const db = getSupabase() as unknown as { rpc: V3Rpc } | null;
  if (!db) throw new WorkspaceExportV3Error("unavailable", "Export is unavailable.");
  return (name, args) => db.rpc(name, args);
}

/** A paused email pipeline does not prevent the verified business owner downloading. */
export async function readOwnerExportStatus(actor: WorkspaceActor, buildId: string, rpc = databaseRpc()) {
  const result = await rpc("read_workspace_export_owner_status", { p_build_id: exportBuildIdSchema.parse(buildId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (result.error) throw new WorkspaceExportV3Error("denied", "This export is unavailable to this owner.");
  return statusSchema.parse(result.data);
}

export async function readOwnerExportBody(actor: WorkspaceActor, buildId: string, rpc = databaseRpc()) {
  exportBuildIdSchema.parse(buildId);
  const parts: string[] = [];
  let count = 1;
  for (let part = 0; part < count; part++) {
    // Membership, confirmed email, readiness and expiry are rechecked on every part.
    const result = await rpc("read_workspace_export_owner_part", { p_build_id: buildId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_part: part });
    if (result.error) throw new WorkspaceExportV3Error("denied", "This export is unavailable to this owner.");
    const row = partSchema.parse(result.data);
    if (part > 0 && row.partCount !== count) throw new WorkspaceExportV3Error("unavailable", "The export changed while being read.");
    count = row.partCount; parts.push(row.body);
  }
  const body = parts.join("");
  try { assertGoogleReviewArchiveCurrent(body); } catch { throw new WorkspaceExportV3Error("denied", "This export must be rebuilt before download."); }
  return body;
}
