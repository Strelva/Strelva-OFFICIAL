import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { VercelSandboxBuildConfiguration } from "./vercel-sandbox-build";

export interface SandboxEvidenceDatabase {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
}
const attemptSchema = z.object({ id: z.string().uuid(), work_id: z.string().uuid(), attempt_name: z.string(), job_id: z.string().uuid(), execution_key: z.string(), maximum_cents: z.number().int().positive() });
const id = z.string().uuid();
const billingSchema = z.object({
  teamId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), currency: z.literal("usd"),
  billableUsd: z.string().max(32).regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/), providerReference: z.string().min(1).max(256),
}).strict();

/** No SDK import, live provider, rate card, default selection or release permission. */
export function createSandboxBuildEvidence(
  db: SandboxEvidenceDatabase, actor: WorkspaceActor,
  target: { workId: string; candidateRevision: number; teamId: string; projectId: string; image: string },
  gates: { enabled: () => boolean; assertListedRuntimeEligibility: () => Promise<void> },
) {
  let attempt: z.infer<typeof attemptSchema> | undefined;
  const command = async (name: string, args: Record<string, unknown>) => {
    const result = await db.rpc(name, args);
    if (result.error) throw new Error("Sandbox build evidence could not be confirmed.", { cause: result.error });
    return result.data;
  };
  const configuration: VercelSandboxBuildConfiguration = {
    image: target.image, enabled: gates.enabled,
    async admit(input, sourceDigest, attemptName) {
      if (!gates.enabled() || input.resourceId !== target.workId) throw new Error("Sandbox build admission is unavailable.");
      // This callback must remain unavailable until a genuine exact-revision
      // custom listed-runtime qualifier exists; bytes alone never qualify it.
      await gates.assertListedRuntimeEligibility();
      attempt = attemptSchema.parse(await command("prepare_sandbox_build_attempt", {
        p_work: target.workId, p_version: input.applicationVersion, p_revision: target.candidateRevision,
        p_digest: sourceDigest, p_name: attemptName, p_team: target.teamId, p_project: target.projectId,
        p_image: target.image, p_user: actor.userId, p_email: actor.verifiedEmail,
      }));
      if (attempt.attempt_name !== attemptName) throw new Error("Sandbox build attempt mismatch.");
      await gates.assertListedRuntimeEligibility();
      if (!gates.enabled()) throw new Error("Sandbox build admission is unavailable.");
      // One durable opportunity to create. A second start is never retry permission.
      await command("begin_sandbox_build_attempt", { p_attempt: attempt.id, p_user: actor.userId, p_email: actor.verifiedEmail });
    },
    async observe(event) {
      if (!attempt || attempt.attempt_name !== event.attemptName) throw new Error("Sandbox build observation has no exact attempt.");
      id.parse(await command("record_sandbox_build_observation", {
        p_attempt: attempt.id, p_team: target.teamId, p_project: target.projectId,
        p_name: event.attemptName, p_kind: event.kind, p_session: event.sessionId, p_payload: event.payload,
      }));
    },
  };
  const read = async (attemptId: string) => {
    const value = await command("read_sandbox_build_attempt", { p_attempt: id.parse(attemptId), p_user: actor.userId, p_email: actor.verifiedEmail });
    const parsed = z.object({ attempt: attemptSchema }).parse(value);
    if (parsed.attempt.work_id !== target.workId) throw new Error("Sandbox build target mismatch.");
    return value;
  };
  return {
    configuration,
    read,
    /**
     * Trusted resolver only. This normalized receipt is a prepared authority
     * interface, not a claim that Vercel's SDK returns per-session dollars.
     * Store evidence in its own transaction before attempting financial closure.
     */
    async reconcileBilling(attemptId: string, resolveTrustedBilling: () => Promise<unknown>) {
      await read(attemptId);
      const receipt = billingSchema.parse(await resolveTrustedBilling());
      if (receipt.teamId !== target.teamId || receipt.projectId !== target.projectId) throw new Error("Sandbox billing scope mismatch.");
      const evidenceId = id.parse(await command("record_sandbox_build_billing_evidence", {
        p_attempt: id.parse(attemptId), p_team: receipt.teamId, p_project: receipt.projectId,
        p_session: receipt.sessionId, p_currency: receipt.currency,
        p_usd: receipt.billableUsd, p_reference: receipt.providerReference,
      }));
      return command("reconcile_sandbox_build_billing", { p_evidence: evidenceId });
    },
  };
}
