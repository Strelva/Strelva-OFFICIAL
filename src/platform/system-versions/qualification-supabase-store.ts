import { WorkspaceStoreError } from "@/platform/workspaces/types";
import { mapVersionsError, versionsDb, type VersionsDb } from "./supabase-store";
import { VersionStaleError, VersionValidationError, type VersionActor } from "./types";
import { jsonEqual } from "./compare";
import { parseRevisionQualification } from "./qualification";
import type { RevisionQualificationStore } from "./qualification-store";

export function createSupabaseRevisionQualificationStore(db: VersionsDb = versionsDb()): RevisionQualificationStore {
  function actorArgs(actor: VersionActor) {
    if (!actor.verifiedEmail) throw new VersionValidationError("A verified actor is required for qualification evidence.");
    return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail };
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error?.message?.includes("system_revision_qualification_stale")) throw new VersionStaleError();
    if (error?.message?.includes("system_revision_qualification_invalid")) throw new VersionValidationError("The qualification evidence was refused.");
    if (error) mapVersionsError(error, "Qualification evidence storage is unavailable.");
    return data;
  }
  return {
    async append(actor, revision, record) {
      const checked = parseRevisionQualification(record, revision.source);
      if (checked.evaluatedBy !== actor.userId) throw new VersionValidationError("The qualification actor does not match.");
      const result = await rpc("record_system_revision_qualification", { ...actorArgs(actor), p_revision_id: revision.source.revisionId,
        p_definition: revision.definition, p_requires: revision.requires.bindingKinds, p_record: checked });
      const parsed = parseRevisionQualification(result, revision.source);
      if (parsed.id !== record.id || !jsonEqual(parsed, checked)) {
        throw new WorkspaceStoreError("The qualification receipt did not match the submitted evidence.");
      }
      return parsed;
    },
    async list(actor, source) {
      const data = await rpc("read_system_revision_qualifications", { ...actorArgs(actor), p_revision_id: source.revisionId });
      if (!Array.isArray(data)) throw new WorkspaceStoreError("Qualification evidence could not be read.");
      return data.map(record => parseRevisionQualification(record, source));
    },
  };
}
