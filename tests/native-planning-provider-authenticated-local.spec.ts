import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { localSql } from "./support/journeys";
import { planningProviderAdmission } from "./support/money-agent-provider-contracts";
import { assertProviderReporter, parseProviderProofAdmission, requireProviderProofAdmission, loadProviderOwnerState, verifyProviderWorkspaceOwner, claimProviderDispatch } from "./support/provider-harness-admission";
test.use({ trace: "off", screenshot: "off", video: "off" }); test.setTimeout(180_000); test.describe.configure({ retries: 0 });
test("actual funded planning settles exact provider dollars and accepts one native output", async ({ browser }, info) => {
 assertProviderReporter(info.config); const scope = requireProviderProofAdmission("native-planning-provider", planningProviderAdmission);
 const owner = await browser.newContext({ baseURL: scope.appOrigin, storageState: loadProviderOwnerState(scope.ownerAuthStatePath) });
 let claim: ReturnType<typeof claimProviderDispatch> | undefined;
 try {
  await verifyProviderWorkspaceOwner(owner, scope);
  expect(createHash("sha256").update(scope.intent).digest("hex")).toBe(scope.originalIntentDigest);
  expect(localSql<boolean>(`select exists(select 1 from public.job_economics where id=:'v1'::uuid and workspace_id=:'v2'::uuid and payer_id=:'v3'::uuid and accepted_by=:'v3'::uuid and accepted_at is not null and status='accepted' and product_id='work_plans' and max_authorized_cents=:'v4'::integer);`, scope.jobId, scope.workspaceId, scope.ownerUserId, String(scope.maximumCents))).toBe(true);
  expect(localSql<number>(`select count(*) from public.job_economics_executions where job_id=:'v1'::uuid and execution_key=:'v2';`, scope.jobId, scope.executionKey)).toBe(0);
  parseProviderProofAdmission(planningProviderAdmission, scope);
  await verifyProviderWorkspaceOwner(owner, scope);
  parseProviderProofAdmission(planningProviderAdmission, scope);
  claim = claimProviderDispatch(scope, `${scope.jobId}:${scope.executionKey}`);
  const response = await owner.request.post("/api/work-plans", { maxRetries: 0, maxRedirects: 0, headers: { origin: scope.appOrigin }, data: { workspaceId: scope.workspaceId, userGoal: scope.intent, evidence: [], planningEconomics: { jobId: scope.jobId, executionKey: scope.executionKey, maximumCents: scope.maximumCents, approvedModelLabels: scope.approvedModelLabels } } });
  expect(response.status()).toBe(201);
  const plan = z.object({ work: z.object({ id: z.string().uuid(), workspaceId: z.string(), createdBy: z.string() }), plan: z.object({ metadata: z.object({ revision: z.number() }), proposedOutputs: z.array(z.object({ id: z.string(), nativeOperationIds: z.array(z.string()) }).passthrough()) }).passthrough() }).parse(await response.json());
  expect(plan.work).toMatchObject({ workspaceId: scope.workspaceId, createdBy: scope.ownerUserId }); claim.recordRequest(plan.work.id);
  const billed = () => localSql<boolean>(`select exists(select 1 from public.work_provider_receipts r join public.job_economics_executions e on e.job_id=r.job_id and e.execution_key=r.execution_key where r.job_id=:'v1'::uuid and r.execution_key=:'v2' and r.maximum_cents=:'v3'::integer and r.provider=:'v4' and r.kind='model' and r.attribution='normal' and r.request_id<>'' and r.evidence_reference<>'' and e.kind='model' and e.attribution='normal' and e.created_by=:'v5'::uuid and r.billable_cents<=r.maximum_cents and e.status='finished' and e.effect='accepted' and e.billable_cents=r.billable_cents);`, scope.jobId, scope.executionKey, String(scope.maximumCents), scope.billingProvider, scope.ownerUserId);
  await expect.poll(billed, { timeout: 60_000 }).toBe(true);
  expect(localSql<string>(`select to_jsonb(input->>'userGoal') from public.saved_product_work where id=:'v1'::uuid and workspace_id=:'v2'::uuid;`, plan.work.id, scope.workspaceId)).toBe(scope.intent);
  const output = plan.plan.proposedOutputs.find(o => o.nativeOperationIds.includes(scope.outputOperationId)); expect(output).toBeTruthy();
  parseProviderProofAdmission(planningProviderAdmission, scope);
  await verifyProviderWorkspaceOwner(owner, scope);
  parseProviderProofAdmission(planningProviderAdmission, scope);
  const accepted = await owner.request.post("/api/work-plans/execute", { maxRetries: 0, maxRedirects: 0, headers: { origin: scope.appOrigin }, data: { workspaceId: scope.workspaceId, planWorkId: plan.work.id, outputId: output!.id, expectedPlanRevision: plan.plan.metadata.revision, operationId: scope.outputOperationId } });
  expect(accepted.status()).toBe(201);
  const execution = z.object({ status: z.literal("completed"), nativeWorkId: z.string().uuid(), nativeProductId: z.string(), nativeResourceKind: z.string(), receipt: z.object({ planWorkId: z.string(), outputId: z.string(), planRevision: z.number(), operationId: z.string(), actorId: z.string(), nativeWorkId: z.string() }).passthrough() }).passthrough().parse(await accepted.json());
  expect(execution.receipt).toMatchObject({ planWorkId: plan.work.id, outputId: output!.id, planRevision: plan.plan.metadata.revision, operationId: scope.outputOperationId, actorId: scope.ownerUserId, nativeWorkId: execution.nativeWorkId });
  expect(localSql<boolean>(`select exists(select 1 from public.saved_product_work where id=:'v1'::uuid and workspace_id=:'v2'::uuid and product_id=:'v3' and resource_kind=:'v4' and created_by=:'v5'::uuid);`, execution.nativeWorkId, scope.workspaceId, execution.nativeProductId, execution.nativeResourceKind, scope.ownerUserId)).toBe(true);
  expect(localSql<number>(`select count(*) from public.work_plan_output_executions where plan_work_id=:'v1'::uuid and output_id=:'v2' and operation_id=:'v3' and actor_id=:'v4'::uuid and status='completed';`, plan.work.id, output!.id, scope.outputOperationId, scope.ownerUserId)).toBe(1);
 } catch { throw new Error("Planning provider proof held/failed; inspect private dispatch/native receipts. Details withheld."); }
 finally { claim?.close(); await owner.close(); }
});
