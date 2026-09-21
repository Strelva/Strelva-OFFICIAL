import { getAuthUserId, hasTenantAccess } from "@/lib/auth";
import {
  getWork,
  listWorkspaces,
  WorkspaceAccessError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces";
import {
  JobEconomicsAccessError,
  JobEconomicsNotFoundError,
  JobEconomicsTargetError,
  type CreateJobEconomicsCommand,
  type JobEconomicsRecord,
} from "./types";

export interface ResolvedJobTarget {
  workspaceId: string | null;
  workId: string | null;
  productId: CreateJobEconomicsCommand["productId"];
  resourceKind: CreateJobEconomicsCommand["resourceKind"];
  tenantId: string | null;
  businessId: string | null;
  requestId: string | null;
  capabilityId: string | null;
}

function targetNotFound(): never {
  throw new JobEconomicsTargetError();
}

function matchesSavedWork(command: CreateJobEconomicsCommand, work: SavedWork): boolean {
  if (command.productId === "tracker") {
    return work.productId === "tracker" && work.resourceKind === "tracker";
  }
  if (command.productId === "operations") return work.productId === "operations" && work.resourceKind === "responsibility";
  if (command.productId === "custom-applications") return work.productId === "custom-applications" && work.resourceKind === "custom-application";
  return work.productId === "ai_visibility"
    && (work.resourceKind === "private_ai_visibility_work" || work.resourceKind === "ai_visibility_assessment");
}

async function requireDirectWorkspaceMember(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  const workspaces = await listWorkspaces(actor);
  const workspace = workspaces.find((item) => item.id === workspaceId && item.access === "member");
  if (!workspace) throw new JobEconomicsAccessError();
}

export interface InquiryEconomicsAuthority {
  containsTarget(tenantId: string, businessId: string, requestId: string, capabilityId: string): Promise<boolean>;
}

async function resolveInquiryTarget(
  actor: WorkspaceActor,
  command: CreateJobEconomicsCommand,
  inquiryAuthority?: InquiryEconomicsAuthority,
): Promise<ResolvedJobTarget> {
  if (!command.tenantId || !command.businessId || !command.requestId || !command.capabilityId) targetNotFound();
  if ((await getAuthUserId()) !== actor.userId) throw new JobEconomicsAccessError();
  if (!(await hasTenantAccess(command.tenantId))) throw new JobEconomicsAccessError();
  if (!inquiryAuthority || !(await inquiryAuthority.containsTarget(command.tenantId, command.businessId, command.requestId, command.capabilityId))) targetNotFound();
  return {
    workspaceId: null,
    workId: null,
    productId: command.productId,
    resourceKind: command.resourceKind,
    tenantId: command.tenantId,
    businessId: command.businessId,
    requestId: command.requestId,
    capabilityId: command.capabilityId,
  };
}

async function resolveWorkspaceTarget(
  actor: WorkspaceActor,
  command: CreateJobEconomicsCommand,
): Promise<ResolvedJobTarget> {
  if (!command.workspaceId) targetNotFound();
  if (command.productId === "work_plans") {
    if (command.resourceKind !== "plan" || (command.workId !== undefined && command.workId !== null)) targetNotFound();
    await requireDirectWorkspaceMember(actor, command.workspaceId);
    return {
      workspaceId: command.workspaceId,
      workId: null,
      productId: command.productId,
      resourceKind: command.resourceKind,
      tenantId: null,
      businessId: null,
      requestId: null,
      capabilityId: null,
    };
  }
  if (!command.workId) targetNotFound();
  let work: SavedWork | null;
  try {
    work = await getWork(actor, command.workId);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw new JobEconomicsAccessError();
    throw error;
  }
  if (!work || work.workspaceId !== command.workspaceId || !matchesSavedWork(command, work)) targetNotFound();
  await requireDirectWorkspaceMember(actor, command.workspaceId);
  return {
    workspaceId: command.workspaceId,
    workId: command.workId,
    productId: command.productId,
    resourceKind: command.resourceKind,
    tenantId: null,
    businessId: null,
    requestId: null,
    capabilityId: null,
  };
}

/** Resolve a browser-supplied reference through its product's native authority. */
export async function resolveCreateTarget(
  actor: WorkspaceActor,
  command: CreateJobEconomicsCommand,
  inquiryAuthority?: InquiryEconomicsAuthority,
): Promise<ResolvedJobTarget> {
  if (command.productId === "inquiry") return resolveInquiryTarget(actor, command, inquiryAuthority);
  return resolveWorkspaceTarget(actor, command);
}

async function assertInquiryRecordAccess(actor: WorkspaceActor, job: JobEconomicsRecord, inquiryAuthority?: InquiryEconomicsAuthority): Promise<void> {
  if (!job.tenantId || !job.businessId || !job.requestId || !job.capabilityId) throw new JobEconomicsNotFoundError();
  if ((await getAuthUserId()) !== actor.userId) throw new JobEconomicsAccessError();
  if (!(await hasTenantAccess(job.tenantId))) throw new JobEconomicsAccessError();
  if (!inquiryAuthority || !(await inquiryAuthority.containsTarget(job.tenantId, job.businessId, job.requestId, job.capabilityId))) throw new JobEconomicsTargetError();
}

/** Re-check the native reference on every read and existing-job command. */
export async function assertJobTargetAccess(actor: WorkspaceActor, job: JobEconomicsRecord, inquiryAuthority?: InquiryEconomicsAuthority): Promise<void> {
  if (job.productId === "inquiry") {
    await assertInquiryRecordAccess(actor, job, inquiryAuthority);
    return;
  }
  if (job.productId === "work_plans") {
    if (job.resourceKind !== "plan" || !job.workspaceId || job.workId) throw new JobEconomicsTargetError();
    await requireDirectWorkspaceMember(actor, job.workspaceId);
    return;
  }
  if (!job.workId || !job.workspaceId
    || (job.productId === "operations" && job.resourceKind !== "responsibility")
    || (job.productId === "tracker" && (job.resourceKind !== "tracker"))
    || (job.productId === "custom-applications" && job.resourceKind !== "custom-application")
    || (job.productId === "ai_visibility"
      && job.resourceKind !== "private_ai_visibility_work"
      && job.resourceKind !== "ai_visibility_assessment")) {
    throw new JobEconomicsTargetError();
  }
  let work: SavedWork | null;
  try {
    work = await getWork(actor, job.workId);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw new JobEconomicsAccessError();
    throw error;
  }
  if (!work || work.workspaceId !== job.workspaceId || !matchesSavedWork({
    action: "create",
    productId: job.productId,
    resourceKind: job.resourceKind,
    workspaceId: job.workspaceId,
    workId: job.workId,
    payerId: job.payerId,
    estimateCents: job.estimateCents,
    maxAuthorizedCents: job.maxAuthorizedCents,
  }, work)) throw new JobEconomicsTargetError();
}
