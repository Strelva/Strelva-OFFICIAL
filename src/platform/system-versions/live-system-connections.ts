import type { SystemRef } from "@/platform/systems/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { effectivePackageBehavior } from "./declaration";
import { determineVersionRelease } from "./service";
import { createSupabaseVersionStore, readVersionActor } from "./supabase-store";
import { assertRequiredConnections } from "./required-connections";

/** A generic Possibility cannot bypass an installed System's account needs by
 * moving its spine revision directly, even when it declares no outside effect. */
export async function assertInstalledSystemConnections(actor: WorkspaceActor, ref: SystemRef): Promise<void> {
  const versionActor = await readVersionActor(actor);
  const lineage = await createSupabaseVersionStore().findLineageByVersion(versionActor, ref);
  if (!lineage) return;
  const definition = determineVersionRelease(lineage).definition;
  const declaration = effectivePackageBehavior(definition, lineage.bindings.map(binding => binding.kind));
  await assertRequiredConnections({ actor, workspaceId: ref.businessId, requiredConnections: declaration.requiredConnections,
    connectionRefs: lineage.bindings.map(binding => binding.connectionId) });
}
