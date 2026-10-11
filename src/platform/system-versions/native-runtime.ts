import { z } from "zod";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { mapVersionsError, type VersionsDb } from "./supabase-store";
import type { VersionLineage } from "./types";
const appRuntime = z.object({ kind: z.literal("internal_app"), workId: z.string().uuid(), releaseNumber: z.number().int().positive().nullable(), designRevision: z.number().int().nonnegative() }).strict();
const runtime=z.union([appRuntime,z.object({kind:z.enum(["inquiry_pattern","website_section"]),workId:z.string().uuid(),releaseNumber:z.number().int().positive().nullable(),designRevision:z.number().int().nonnegative(),status:z.enum(["draft","verified","unverified"]),reviewHref:z.string().regex(/^\/workspace\?/)}).strict()]);


/** A definition snapshot cannot claim a running product. Native adapters
 * check the destination's own runtime, never the source's records/accounts. */
export async function readVersionRuntime(actor: WorkspaceActor, lineage: VersionLineage, db: VersionsDb) {
  const { data, error } = await db.rpc("read_version_native_runtime", { p_workspace_id: lineage.version.businessId,
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_version_id: lineage.id });
  if (error) mapVersionsError(error, "The Version's running System could not be verified. Nothing went live.");
  if (data === null) return null;
  const parsed = runtime.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("The Version's running System could not be verified. Nothing went live.");
  if (parsed.data.releaseNumber !== lineage.currentRelease) throw new WorkspaceStoreError("The running System changed outside this Version. Reconcile it before preparing a release.");
  return parsed.data;
}
export async function requireVersionRuntime(actor: WorkspaceActor, lineage: VersionLineage, db: VersionsDb) {
  const value = await readVersionRuntime(actor, lineage, db);
  if(value&&value.kind!=="internal_app")throw new WorkspaceStoreError("This Version uses its business’s native inquiry or website review. Generic release approval cannot publish it.");
  if (!value) throw new WorkspaceStoreError("This Version needs operator-prepared work to change its running System. A lineage snapshot cannot make it live.");
  return value;
}
