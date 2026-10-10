import { expect, test } from "@playwright/test";
import { z } from "zod";
import { localSql } from "./support/journeys";
import { requireProviderProofAdmission, sandboxProofAdmissionSchema, claimProviderDispatch, loadProviderOwnerState, verifyProviderOwner, assertProviderReporter, verifyProviderWorkspaceOwner, assertProviderApprovalWindow } from "./support/provider-harness-admission";

// One paid attempt maximum. No fake SDK, dependency install, publication or automatic retry.
test.use({ trace: "off", video: "off", screenshot: "off" });
test.setTimeout(300_000);
test.describe.configure({ retries: 0 });
test("authorized nonproduction sandbox build records actual cleanup and exact billing", async ({ browser }, info) => {
  assertProviderReporter(info.config);
  const scope = requireProviderProofAdmission("sandbox-application", sandboxProofAdmissionSchema);
  const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: loadProviderOwnerState(scope.ownerAuthStatePath) });
  let claim: ReturnType<typeof claimProviderDispatch> | undefined;
  try {
    await verifyProviderOwner(owner, scope);
    const path = `/api/custom-applications/${scope.workId}/manage`;
    const beforeResponse = await owner.request.get(path); expect(beforeResponse.status()).toBe(200);
    const before = z.object({ application: z.object({ workId: z.string(), workspaceId: z.string(), currentReleaseVersion: z.number().nullable(),
      candidate: z.object({ version: z.number(), revision: z.number(), sourceDigest: z.string(), artifact: z.null() }).passthrough(),
      budget: z.object({ jobId: z.string(), maxAuthorizedCents: z.number(), status: z.literal("accepted") }) }).passthrough() }).parse(await beforeResponse.json()).application;
    expect(before).toMatchObject({ workId: scope.workId, workspaceId: scope.workspaceId,
      candidate: { version: scope.candidateVersion, revision: scope.candidateRevision, sourceDigest: scope.sourceDigest },
      budget: { jobId: scope.budgetJobId, maxAuthorizedCents: scope.maximumCents } });
    expect(localSql<number>(`select count(*) from public.sandbox_build_attempts where work_id=:'v1'::uuid and application_version=:'v2'::integer;`, scope.workId, String(scope.candidateVersion))).toBe(0);
    const qualified = localSql<unknown>(`select jsonb_build_object('qualified',public.assert_custom_sandbox_runtime(:'v1'::uuid,:'v2'::integer,:'v3'::integer,:'v4',:'v5',:'v6',:'v7',:'v8',:'v9'::uuid,:'v10'),'id',q.id) from public.custom_sandbox_runtime_qualifications q where q.id=:'v11'::uuid and q.work_id=:'v1'::uuid and q.application_version=:'v2'::integer and q.candidate_revision=:'v3'::integer and q.source_digest=:'v4' and q.team_id=:'v5' and q.project_id=:'v6' and q.image=:'v7' and q.policy_version=:'v8';`,
      scope.workId, String(scope.candidateVersion), String(scope.candidateRevision), scope.sourceDigest, scope.teamId, scope.projectId,
      scope.image, scope.policyVersion, scope.ownerUserId, scope.ownerEmail, scope.runtimeQualificationId);
    expect(qualified).toEqual({ qualified: true, id: scope.runtimeQualificationId });
    claim = claimProviderDispatch(scope, `${scope.workId}:${scope.candidateVersion}`);
    await verifyProviderWorkspaceOwner(owner, scope);
    assertProviderApprovalWindow(scope); // expired approval leaves its claim burned
    const built = await owner.request.post(path, { maxRetries: 0, maxRedirects: 0, headers: { origin: scope.appOrigin }, data: { action: "build", input: { expectedCandidateRevision: scope.candidateRevision } } });
    // HTTP failure/unknown creation is retained and requires operator lookup; never retry here.
    expect(built.status()).toBe(200);
    const app = z.object({ application: z.object({ currentReleaseVersion: z.number().nullable(), candidate: z.object({ artifact: z.object({
      sourceDigest: z.string(), image: z.string(), state: z.literal("built"), artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
      limits: z.object({ network: z.literal("none"), memoryMb: z.literal(2048), cpuCount: z.literal(1), timeoutSeconds: z.literal(30) }) }).passthrough() }).passthrough() }).passthrough() }).parse(await built.json()).application;
    expect(app.currentReleaseVersion).toBe(before.currentReleaseVersion);
    expect(app.candidate.artifact).toMatchObject({ sourceDigest: scope.sourceDigest, image: scope.image });
    const read = () => localSql<unknown>(`select jsonb_agg(public.read_sandbox_build_attempt(a.id,:'v3'::uuid,:'v4')) from public.sandbox_build_attempts a where a.work_id=:'v1'::uuid and a.application_version=:'v2'::integer;`, scope.workId, String(scope.candidateVersion), scope.ownerUserId, scope.ownerEmail);
    const evidenceSchema = z.array(z.object({ attempt: z.object({ id: z.string().uuid(), work_id: z.string(), team_id: z.string(), project_id: z.string(), image: z.string(), source_digest: z.string(), maximum_cents: z.number() }).passthrough(),
      observations: z.array(z.object({ kind: z.string(), session_id: z.string().nullable() }).passthrough()), billingEvidence: z.unknown().nullable(), execution: z.unknown() }).passthrough()).length(1);
    const evidence = evidenceSchema.parse(read())[0]!;
    expect(evidence.attempt).toMatchObject({ workspace_id: scope.workspaceId, admitted_by: scope.ownerUserId, job_id: scope.budgetJobId, application_version: scope.candidateVersion, candidate_revision: scope.candidateRevision, work_id: scope.workId, team_id: scope.teamId, project_id: scope.projectId,
      image: scope.image, source_digest: scope.sourceDigest, maximum_cents: scope.maximumCents });
    expect(localSql<string>(`select to_jsonb(qualification_id) from public.sandbox_build_runtime_bindings where attempt_id=:'v1'::uuid;`, evidence.attempt.id)).toBe(scope.runtimeQualificationId);
    const created = evidence.observations.find(value => value.kind === "created");
    expect(created?.session_id).toBeTruthy();
    expect(evidence.observations.some(value => value.kind === "stopped" && value.session_id === created!.session_id)).toBe(true);
    expect(evidence.observations.some(value => ["cleanup_failed", "creation_unknown", "build_failed"].includes(value.kind))).toBe(false);
    await info.attach("sandbox-provider-attempt", { contentType: "application/json", body: JSON.stringify({ environment: "nonproduction",
      attemptId: evidence.attempt.id, sessionId: created!.session_id,
      sourceDigest: scope.sourceDigest, artifactDigest: app.candidate.artifact.artifactDigest, cleanupObserved: true, fullReleaseQualified: false }) });
    // A separately authorized trusted resolver must persist/reconcile actual session dollars.
    // Stop counters, an estimated bill or zero-cost synthetic receipt cannot satisfy this.
    await expect.poll(() => {
      const current = evidenceSchema.parse(read())[0]!;
      const billing = z.object({ session_id: z.string(), currency: z.literal("usd"), billable_usd: z.string(), provider_reference: z.string().min(1) }).passthrough().safeParse(current.billingEvidence);
      const execution = z.object({ status: z.literal("finished"), effect: z.literal("accepted"), kind: z.literal("provider"), billable_cents: z.number().int().nonnegative() }).passthrough().safeParse(current.execution);
      return billing.success && billing.data.session_id === created!.session_id && execution.success && execution.data.billable_cents <= scope.maximumCents;
    }, { timeout: 60_000, intervals: [1000, 3000, 5000], message: "Exact trusted per-session billing remains held until actual native evidence is reconciled" }).toBe(true);
  } catch { throw new Error("Sandbox provider proof failed/held; inspect private dispatch journal and native attempt evidence. Details withheld."); }
  finally { claim?.close(); await owner.close(); }
});
