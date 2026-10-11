import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { websiteRebuildReleasedFor } from "./rebuild-release";
import { createAiRebuildWriter, type RebuildOptions } from "./rebuild-pipeline";
import { makeJevComposer, makeJevRisk, makeJevVerifier, makeModelComposer, type RebuildProviderAdmission } from "./rebuild-providers";
import { getSupabase } from "@/platform/infra/db/client";
import { applySitePatch, type SitePatchRisk } from "./site-operations";
import { siteDocumentHash, type SiteDocument } from "./site-document";

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
interface WebsiteProviderContext { actor: WorkspaceActor; workspaceId: string; workId: string; recheck(): Promise<void> }
async function configuredAdmission(input: WebsiteProviderContext, ports: Pick<typeof live, "released" | "reserveCall">): Promise<RebuildProviderAdmission | null> {
  if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED !== "1") return null;
  if (!(await ports.released(input.actor, input.workspaceId))) throw new WorkspaceConflictError("Website model calls are not enabled for this business.");
  await input.recheck();
  const maxCalls = Number(process.env.STRELVA_WEBSITE_MODEL_MAX_CALLS ?? "48");
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 64) throw new WorkspaceConflictError("Website model call limit must be between 1 and 64.");
  return async (request, run) => {
    if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED !== "1" || !(await ports.released(input.actor, input.workspaceId))) throw new WorkspaceConflictError("Website model authority changed. Reopen the rebuild.");
    await input.recheck();
    if (request.inputBytes > 250_000) throw new WorkspaceConflictError("This website exceeds the model input limit. Rebuild a smaller site.");
    // All rebuild and edit calls share one durable lifetime work allowance.
    // Failed calls and concurrent attempts consume it before any provider call.
    await ports.reserveCall(input, maxCalls);
    return run();
  };
}

/** Source-copy rebuilding remains complete with this opt-in off. Keys alone
 * never turn on paid calls. Each attempt rechecks the business release and
 * current membership, and consumes a bounded call allowance, including failed
 * attempts. This is a call cap, not a claimed dollar budget or billed cost. */
export async function configuredWebsiteRebuildOptions(input: WebsiteProviderContext, ports: typeof live = live): Promise<RebuildOptions> {
  const admit = await configuredAdmission(input, ports);
  if (!admit) return {};
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

const patchLive = { released: websiteRebuildReleasedFor, reserveCall, jevRisk: makeJevRisk, jevVerifier: makeJevVerifier };
export interface WebsitePatchRuntimeOptions {
  risk?: SitePatchRisk;
  verify?(document: SiteDocument, changedNodeIds: string[]): Promise<SiteDocument>;
}
/** Advisory model evidence only. It never grants auto mode, clears an owner
 * decision or rewrites sources. Missing configuration or failed calls keep
 * the existing reviewed edit path. At most 12 changed claims are checked per
 * patch, within the same durable rebuild allowance. */
export async function configuredWebsitePatchOptions(input: WebsiteProviderContext & { document: SiteDocument; ops: unknown }, ports: typeof patchLive = patchLive): Promise<WebsitePatchRuntimeOptions> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED !== "1" || !apiKey) return {};
  const after = applySitePatch(input.document, input.ops);
  if (siteDocumentHash(after) === siteDocumentHash(input.document)) return {};
  let admit: RebuildProviderAdmission | null;
  try { admit = await configuredAdmission(input, ports); } catch { return {}; }
  if (!admit) return {};
  const options = { apiKey, admit };
  let risk: SitePatchRisk | undefined;
  try { risk = await ports.jevRisk(options)({ before: input.document, after, ops: input.ops }); } catch { /* Review stays required. */ }
  let verifier: ReturnType<typeof makeJevVerifier>;
  try { verifier = ports.jevVerifier(options); } catch { return risk ? { risk } : {}; }
  return { ...(risk ? { risk } : {}), verify: async (document, changedNodeIds) => {
    let checked = 0;
    for (const id of changedNodeIds) {
      const node = document.nodes[id];
      if (!node?.factIds.length) continue;
      // The proposed copy is not its own evidence. Only earlier supported
      // sources or owner-confirmed facts can support a changed sentence.
      const evidence = (input.document.nodes[id]?.factIds ?? []).flatMap(factId => {
        const fact = input.document.facts[factId];
        return fact && (fact.origin === "owner_confirmed" || fact.origin === "source" && fact.verification?.supported && fact.verification.confidence >= .85)
          ? [{ id: factId, text: fact.text, quotes: fact.sources.map(source => source.quote), origin: fact.origin }] : [];
      });
      if (!evidence.length) continue;
      let supported = true; let confidence = 1;
      for (const factId of node.factIds) {
        const fact = document.facts[factId];
        if (!fact || checked >= 12) { supported = false; confidence = 0; break; }
        checked++;
        try {
          const result = await verifier({ sentence: fact.text, facts: evidence });
          supported &&= result.supported && result.confidence >= .85;
          confidence = Math.min(confidence, result.confidence);
        } catch { supported = false; confidence = 0; }
      }
      // Source associations and new fact decisions remain untouched. A model
      // score cannot turn proposed copy into an owner's confirmed statement.
      node.verification = { supported, confidence, highRisk: true, needsReview: true };
    }
    return document;
  } };
}
