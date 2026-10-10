import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { CustomApplication } from "./contracts";
import type { CustomBuildAdmission } from "./lifecycle";
import { createSandboxBuildEvidence, type SandboxEvidenceDatabase } from "./sandbox-build-evidence";
import { createVercelSandboxBuilder } from "./vercel-sandbox-build";
import { createSandboxHttpPort } from "./sandbox-http";
const configurationSchema = z.object({
  teamId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  image: z.string().max(256).regex(/^[a-zA-Z0-9_./:-]+@sha256:[a-f0-9]{64}$/), policyVersion: z.string().min(1).max(100),
});
export function sandboxRuntimeSelected() { return process.env.STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER === "vercel-sandbox"; }
/** No flag establishes reviewer, resource, commercial or spending acceptance.
 * Exact source qualification and accepted current payer authority remain SQL gates. */
export function configureSandboxApplicationRuntime(actor: WorkspaceActor, app: CustomApplication, db: SandboxEvidenceDatabase,
  fetcher: typeof fetch = fetch) {
  const selected = () => sandboxRuntimeSelected() && process.env.STRELVA_SANDBOX_RUNTIME_APPROVED === "1"
    && process.env.STRELVA_SANDBOX_2048MB_CONTRACT_APPROVED === "1";
  if (!selected()) throw new Error("Sandbox runtime configuration requires approval.");
  const config = configurationSchema.parse({ teamId: process.env.STRELVA_SANDBOX_TEAM_ID, projectId: process.env.STRELVA_SANDBOX_PROJECT_ID,
    image: process.env.STRELVA_SANDBOX_BUILD_IMAGE, policyVersion: process.env.STRELVA_SANDBOX_POLICY_VERSION });
  const evidence = createSandboxBuildEvidence(db, actor, { ...config, workId: app.workId, candidateRevision: app.candidate.revision }, {
    enabled: selected,
    async assertListedRuntimeEligibility() {
      const result = await db.rpc("assert_custom_sandbox_runtime", { p_work: app.workId, p_version: app.candidate.version, p_revision: app.candidate.revision,
        p_digest: app.candidate.sourceDigest, p_team: config.teamId, p_project: config.projectId, p_image: config.image, p_policy: config.policyVersion,
        p_user: actor.userId, p_email: actor.verifiedEmail });
      if (result.error || result.data !== true) throw new Error("The exact custom application runtime is not qualified.");
    },
  });
  const port = createSandboxHttpPort({ ...config, approved: selected, token: () => process.env.VERCEL_OIDC_TOKEN || process.env.STRELVA_SANDBOX_PROVIDER_TOKEN || "" }, fetcher);
  // The Sandbox admission owns the provider ledger claim/start and full-cap
  // reservation. Do not wrap it in the Docker zero-cost tool execution as well.
  const execute: CustomBuildAdmission["execute"] = async (caller, target, perform, recheck) => {
    if (caller.userId !== actor.userId || caller.verifiedEmail !== actor.verifiedEmail || target.workId !== app.workId || target.version !== app.candidate.version
      || target.jobId !== app.budget?.jobId || target.maximumCents !== app.budget!.maxAuthorizedCents) throw new Error("Sandbox execution target changed.");
    await recheck?.();
    if (app.candidate.artifact) return { disposition: "replayed" };
    return { disposition: "performed", value: await perform() };
  };
  return { build: createVercelSandboxBuilder(port, evidence.configuration), execute, evidence };
}
