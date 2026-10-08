import { z } from "zod";
import { businessRecordDb, actorArgs } from "@/platform/business-record/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { nativeFactMappingInputSchema, nativeMappedFactsSchema, type NativeFactMappingInput } from "./native-fact-mappings";

export function createNativeFactMappingStore(db = businessRecordDb) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await db().rpc(name, args);
    if (result.error) {
      const message = result.error.message ?? "";
      if (/access_denied/.test(message)) throw new WorkspaceAccessError();
      if (/revision_conflict/.test(message)) throw new WorkspaceConflictError("These website mappings changed. Reload before saving again.");
      if (/mapping_invalid/.test(message)) throw new z.ZodError([{ code: "custom", path: [], message: "Check the selected website and service fields." }]);
      throw new WorkspaceStoreError("Website fact mappings could not be confirmed.");
    }
    return nativeMappedFactsSchema.parse(result.data);
  }
  const identity = (actor: WorkspaceActor, workspaceId: string, tenantId: string) => ({ ...actorArgs(actor), p_workspace_id: z.string().uuid().parse(workspaceId), p_tenant_id: z.string().min(1).max(120).parse(tenantId) });
  return {
    read: (actor: WorkspaceActor, workspaceId: string, tenantId: string) => rpc("read_native_website_fact_mapping", identity(actor, workspaceId, tenantId)),
    save: (actor: WorkspaceActor, workspaceId: string, tenantId: string, expectedRevision: number, input: NativeFactMappingInput) => rpc("save_native_website_fact_mapping", {
      ...identity(actor, workspaceId, tenantId), p_expected_revision: z.number().int().nonnegative().parse(expectedRevision), p_mapping: nativeFactMappingInputSchema.parse(input),
    }),
  };
}
