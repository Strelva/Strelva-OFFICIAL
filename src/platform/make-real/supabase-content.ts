import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { mapPossibilityError, type PossibilitiesDb } from "@/platform/possibilities/supabase-repository";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { MAKE_REAL_CONTENT_KIND, type RevisionContentPort } from "./systems-adapter";

/**
 * Revision content in Postgres (system_revision_contents, content-addressed
 * and business-scoped, immutable). A `make_real_content` revision reads its
 * stored JSON. A revision that names a native pointer (website_document,
 * tenant_content, application_release, schedule, inquiry_config) has no copy
 * here: the System layer never copies what a revision is built from, so its
 * content is the pointer itself. Comparing two of them compares pointers.
 */
export function createSupabaseRevisionContent(actor: WorkspaceActor, db?: PossibilitiesDb): RevisionContentPort {
  const client = (): PossibilitiesDb => {
    if (db) return db;
    const value = getSupabase();
    if (!value) throw new WorkspaceStoreError("Revision content storage is unavailable.");
    return value as unknown as PossibilitiesDb;
  };
  const actorArgs = () => ({
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  });
  return {
    async put(businessId, content) {
      const contentHash = sha256(canonicalJson(content));
      const { error } = await client().rpc("put_system_revision_content", {
        p_workspace_id: z.string().uuid().parse(businessId), ...actorArgs(), p_content_hash: contentHash, p_content: content,
      });
      if (error) mapPossibilityError(error, "The candidate could not be stored.");
      return { kind: MAKE_REAL_CONTENT_KIND, ref: `sha256:${contentHash}`, contentHash };
    },
    async get(businessId, implementation) {
      if (implementation.kind !== MAKE_REAL_CONTENT_KIND) return { native: { kind: implementation.kind, ref: implementation.ref } };
      if (!implementation.contentHash) return null;
      const { data, error } = await client().rpc("read_system_revision_content", {
        p_workspace_id: z.string().uuid().parse(businessId), ...actorArgs(), p_content_hash: implementation.contentHash,
      });
      if (error) mapPossibilityError(error, "The candidate could not be read.");
      return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
    },
  };
}
