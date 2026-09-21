import { getWork, WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces";
import { assertJobTargetAccess, resolveCreateTarget, type InquiryEconomicsAuthority } from "./adapters";
import { commandJobEconomics, findJobEconomics, readJobEconomics as readStoredJobEconomics } from "./repository";
import {
  MAX_JOB_ECONOMICS_CENTS,
  parseJobEconomicsCommand,
  parseJobEconomicsId,
  JobEconomicsAccessError,
  JobEconomicsNotFoundError,
  JobEconomicsTargetError,
  type JobEconomicsCommand,
  type JobEconomicsInspection,
} from "./types";

function canonicalCreateCommand(command: Extract<JobEconomicsCommand, { action: "create" }>, target: Awaited<ReturnType<typeof resolveCreateTarget>>): Extract<JobEconomicsCommand, { action: "create" }> {
  return {
    action: "create",
    productId: target.productId,
    resourceKind: target.resourceKind,
    ...(target.workspaceId ? {
      workspaceId: target.workspaceId,
      ...(target.workId ? { workId: target.workId } : {}),
    } : {
      tenantId: target.tenantId!,
      businessId: target.businessId!,
      requestId: target.requestId!,
      capabilityId: target.capabilityId!,
    }),
    payerId: command.payerId,
    estimateCents: command.estimateCents,
    maxAuthorizedCents: command.maxAuthorizedCents,
  };
}

async function inspectAndAuthorize(actor: WorkspaceActor, jobId: string, inquiryAuthority?: InquiryEconomicsAuthority): Promise<JobEconomicsInspection> {
  const inspection = await readStoredJobEconomics(actor, jobId);
  if (!inspection) throw new JobEconomicsNotFoundError();
  await assertJobTargetAccess(actor, inspection.job, inquiryAuthority);
  return inspection;
}

/** Execute one static command after resolving or re-checking native work. */
export async function executeJobEconomicsCommand(
  actor: WorkspaceActor,
  input: unknown,
  inquiryAuthority?: InquiryEconomicsAuthority,
): Promise<JobEconomicsInspection> {
  const command = parseJobEconomicsCommand(input);
  if (command.action === "create") {
    const target = await resolveCreateTarget(actor, command, inquiryAuthority);
    const payerId = command.payerId ?? actor.userId;
    if (command.productId === "inquiry" && payerId !== actor.userId) {
      throw new JobEconomicsNotFoundError("The inquiry payer must be the authenticated tenant member.");
    }
    const created = await commandJobEconomics(actor, canonicalCreateCommand({ ...command, payerId }, target));
    return inspectAndAuthorize(actor, created.id, inquiryAuthority);
  }

  const existing = await inspectAndAuthorize(actor, command.jobId, inquiryAuthority);
  await commandJobEconomics(actor, command);
  return inspectAndAuthorize(actor, existing.job.id, inquiryAuthority);
}

export interface JobEconomicsTargetLookup {
  inspection: JobEconomicsInspection | null;
  canManage: boolean;
}

/** Resolve a native target for the reload path without creating a ledger row. */
export async function findJobEconomicsForTarget(
  actor: WorkspaceActor,
  input: unknown,
  inquiryAuthority?: InquiryEconomicsAuthority,
): Promise<JobEconomicsTargetLookup> {
  const value = (input && typeof input === "object" && !Array.isArray(input))
    ? input as Record<string, unknown>
    : {};
  const targetInput = { ...value };
  // The workspace reload contract only needs workspaceId + workId. Resolve
  // product/resource identity from the saved-work authority when omitted.
  if (typeof targetInput.workId === "string"
    && (typeof targetInput.productId !== "string" || typeof targetInput.resourceKind !== "string")) {
    let work;
    try {
      work = await getWork(actor, targetInput.workId);
    } catch (error) {
      if (error instanceof WorkspaceAccessError) throw new JobEconomicsAccessError();
      throw error;
    }
    if (!work || (typeof targetInput.workspaceId === "string" && targetInput.workspaceId !== work.workspaceId)) {
      throw new JobEconomicsTargetError();
    }
    targetInput.productId = work.productId;
    targetInput.resourceKind = work.resourceKind;
    targetInput.workspaceId = targetInput.workspaceId ?? work.workspaceId;
  }
  const command = parseJobEconomicsCommand({
    ...targetInput,
    action: "create",
    payerId: actor.userId,
    estimateCents: null,
    maxAuthorizedCents: MAX_JOB_ECONOMICS_CENTS,
  });
  if (command.action !== "create") throw new JobEconomicsNotFoundError();
  const target = await resolveCreateTarget(actor, command, inquiryAuthority);
  const inspection = await findJobEconomics(target);
  if (!inspection) return { inspection: null, canManage: true };
  await assertJobTargetAccess(actor, inspection.job, inquiryAuthority);
  return { inspection, canManage: inspection.job.payerId === actor.userId };
}

export async function readJobEconomics(
  actor: WorkspaceActor,
  input: unknown,
  inquiryAuthority?: InquiryEconomicsAuthority,
): Promise<JobEconomicsInspection> {
  return inspectAndAuthorize(actor, parseJobEconomicsId(input), inquiryAuthority);
}
