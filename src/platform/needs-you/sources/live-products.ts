/**
 * The real ports for the application, work plan, money and exit sources.
 * Each port calls the lifecycle's own service; the adapters never write.
 */
import { readBusinessBilling } from "@/platform/business-billing";
import { listWork } from "@/platform/workspaces";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces/types";
import { readJobEconomics } from "@/platform/work-economics";
import { acceptWorkAllowanceCap, inspectWorkAllowances } from "@/platform/work-economics/allowances-service";
import { acceptPayerJob, commandPayerTransition, readPayerTransitionInbox, readPayerTransitions } from "@/platform/work-economics/payer-transitions";
import { publishWorkspaceApplication, readWorkspaceApplication } from "@/products/applications/server";
import { CUSTOM_APPLICATION_PRODUCT, CUSTOM_APPLICATION_RESOURCE_KIND, createCustomApplicationService, type CustomApplication } from "@/products/custom-applications/server";
import { WORK_PLAN_PRODUCT_ID, WORK_PLAN_RESOURCE_KIND, executeWorkPlanOutput, listWorkPlanOutputs, readWorkPlan, workPlanSchema, type WorkPlan } from "@/products/work-plans";
import type { SourceAdapter } from "../adapters";
import { applicationReleaseAdapter, type CustomAppView, type NativeAppView } from "./application-release";
import { workMoneyAdapter } from "./work-money";
import { workPlanAdapter, type WorkPlanView } from "./work-plan";
import { workspaceExitAdapter } from "./workspace-exit";

const LIST_LIMIT = 50;

async function nativeView(actor: WorkspaceActor, id: string): Promise<NativeAppView | null> {
  const app = await readWorkspaceApplication(actor, id);
  const candidate = app.payload.candidate;
  if (!candidate) return null;
  return {
    id: app.id,
    workspaceId: app.workspaceId,
    title: app.title ?? candidate.spec.title,
    candidate: { designRevision: candidate.designRevision, specVersion: candidate.specVersion, spec: candidate.spec, rehearsal: candidate.rehearsal },
    release: app.payload.release ? { version: app.payload.release.version, spec: app.payload.release.spec } : null,
  };
}

function customView(app: CustomApplication): CustomAppView {
  return {
    workId: app.workId,
    workspaceId: app.workspaceId,
    title: app.title,
    status: app.status,
    candidate: { revision: app.candidate.revision, version: app.candidate.version, artifact: app.candidate.artifact ? { artifactDigest: app.candidate.artifact.artifactDigest, review: app.candidate.artifact.review } : null },
    currentReleaseVersion: app.currentReleaseVersion,
    releases: app.releases.map(release => ({ version: release.version, artifactDigest: release.artifactDigest })),
  };
}

async function planView(actor: WorkspaceActor, workspaceId: string, work: SavedWork, plan: WorkPlan): Promise<WorkPlanView> {
  const executed = await listWorkPlanOutputs({ actor, workspaceId, planWorkId: work.id });
  return {
    workId: work.id,
    workspaceId: work.workspaceId,
    status: plan.status,
    userGoal: plan.userGoal,
    revision: plan.metadata.revision,
    requiredDecisions: plan.requiredDecisions.map(decision => ({ id: decision.id })),
    hasRequiredInputs: plan.neededInputs.some(input => input.required),
    outputs: plan.proposedOutputs.map(output => ({ id: output.id, title: output.title, description: output.description, hasDraft: Boolean(output.draft) })),
    executedOutputIds: executed.map(row => row.outputId),
  };
}

const byKind = (rows: SavedWork[], productId: string, resourceKind: string) =>
  rows.filter(row => row.productId === productId && row.resourceKind === resourceKind).slice(0, LIST_LIMIT);

export function productSourceAdapters(): SourceAdapter[] {
  const custom = createCustomApplicationService();
  return [
    applicationReleaseAdapter({
      async listNative(actor, workspaceId) {
        const rows = byKind(await listWork(actor, workspaceId), "applications", "application");
        return (await Promise.all(rows.map(row => nativeView(actor, row.id)))).flatMap(view => view ?? []);
      },
      async listCustom(actor, workspaceId) {
        const rows = byKind(await listWork(actor, workspaceId), CUSTOM_APPLICATION_PRODUCT, CUSTOM_APPLICATION_RESOURCE_KIND);
        return (await Promise.all(rows.map(row => custom.read(actor, row.id)))).map(customView);
      },
      readNative: nativeView,
      readCustom: async (actor, id) => customView(await custom.read(actor, id)),
      publishNative: (actor, id, input) => publishWorkspaceApplication(actor, id, input),
      releaseCustom: (actor, id, input) => custom.release(actor, id, input),
    }),
    workPlanAdapter({
      async list(actor, workspaceId) {
        const rows = byKind(await listWork(actor, workspaceId), WORK_PLAN_PRODUCT_ID, WORK_PLAN_RESOURCE_KIND);
        const views: WorkPlanView[] = [];
        for (const row of rows) {
          const plan = workPlanSchema.safeParse(row.payload);
          if (plan.success && plan.data.status === "ready") views.push(await planView(actor, workspaceId, row, plan.data));
        }
        return views;
      },
      async read(actor, workspaceId, planWorkId) {
        const record = await readWorkPlan({ actor, workspaceId, workId: planWorkId });
        return planView(actor, workspaceId, record.work, record.plan);
      },
      execute: (actor, input) => executeWorkPlanOutput({ actor, ...input }),
    }),
    workMoneyAdapter({
      billing: readBusinessBilling,
      allowances: async (actor, workspaceId) => (await inspectWorkAllowances(actor, { workspaceId })).allowances,
      inbox: async (actor) => {
        const inbox = await readPayerTransitionInbox(actor);
        return { jobs: inbox.jobs ?? [], transitions: inbox.transitions };
      },
      readJob: async (actor, jobId) => {
        const { job } = await readJobEconomics(actor, jobId);
        return job.workspaceId ? { id: job.id, workspaceId: job.workspaceId, status: job.status, productId: job.productId, estimateCents: job.estimateCents, maxAuthorizedCents: job.maxAuthorizedCents } : null;
      },
      payerChanges: async (actor, workspaceId) => (await readPayerTransitions(actor, workspaceId)).transitions,
      acceptAllowanceCap: (actor, allowanceId) => acceptWorkAllowanceCap(actor, { action: "accept_spending_cap", allowanceId }),
      acceptJob: (actor, jobId) => acceptPayerJob(actor, { action: "accept_job", jobId }),
      acceptPayerChange: (actor, transitionId) => commandPayerTransition(actor, { action: "accept", transitionId }),
    }),
    workspaceExitAdapter(),
  ];
}
