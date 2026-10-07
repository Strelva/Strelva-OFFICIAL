import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { websiteRebuildReleasedFor } from "./rebuild-release";
import { createAiRebuildWriter, type RebuildOptions } from "./rebuild-pipeline";
import { makeJevComposer, makeJevVerifier, makeModelComposer, type RebuildProviderAdmission } from "./rebuild-providers";
import { getSupabase } from "@/platform/infra/db/client";

async function reserveCall(input: { actor: WorkspaceActor; workspaceId: string; workId: string }, maximum: number): Promise<void> {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Website model admission is unavailable.");
  const { error } = await db.rpc("reserve_website_model_call", { p_workspace_id: input.workspaceId, p_work_id: input.workId,
    p_user_id: input.actor.userId, p_verified_email: input.actor.verifiedEmail, p_maximum: maximum });
  if (error) throw new WorkspaceConflictError("This rebuild's model allowance could not be admitted. Earlier stages are saved; check access and the remaining call limit.");
}

const live = {
  released: websiteRebuildReleasedFor,
  writer: createAiRebuildWriter,
  jevComposer: makeJevComposer,
  jevVerifier: makeJevVerifier,
  modelComposer: makeModelComposer,
  reserveCall,
};

/** Source-copy rebuilding remains complete with this opt-in off. Keys alone
 * never turn on paid calls. Each attempt rechecks the business release and
 * current membership, and consumes a bounded call allowance, including failed
 * attempts. This is a call cap, not a claimed dollar budget or billed cost. */
export async function configuredWebsiteRebuildOptions(input: {
  actor: WorkspaceActor; workspaceId: string; workId: string; recheck(): Promise<void>;
}, ports: typeof live = live): Promise<RebuildOptions> {
  if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED !== "1") return {};
  if (!(await ports.released(input.actor, input.workspaceId))) throw new WorkspaceConflictError("Website model calls are not enabled for this business.");
  await input.recheck();
  const maxCalls = Number(process.env.STRELVA_WEBSITE_MODEL_MAX_CALLS ?? "48");
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 64) throw new WorkspaceConflictError("Website model call limit must be between 1 and 64.");
  const admit: RebuildProviderAdmission = async (request, run) => {
    if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED !== "1" || !(await ports.released(input.actor, input.workspaceId))) throw new WorkspaceConflictError("Website model authority changed. Reopen the rebuild.");
    await input.recheck();
    if (request.inputBytes > 250_000) throw new WorkspaceConflictError("This website exceeds the model input limit. Rebuild a smaller site.");
    // Reserve durably before invoking any provider. Failed calls, restarts and
    // retries consume the same lifetime work allowance; concurrent attempts
    // cannot oversubscribe it.
    await ports.reserveCall(input, maxCalls);
    return run();
  };
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  return {
    writer: ports.writer({ context: { workspaceId: input.workspaceId }, admit: (model, run, inputBytes) => admit({ model, purpose: "composition", inputBytes: inputBytes ?? 0 }, run) }),
    composers: [
      ...(gatewayKey ? [ports.jevComposer({ apiKey: gatewayKey, admit })] : []),
      ports.modelComposer({ admit, context: { workspaceId: input.workspaceId } }),
    ],
    ...(gatewayKey ? { verifier: ports.jevVerifier({ apiKey: gatewayKey, admit }) } : {}),
  };
}
