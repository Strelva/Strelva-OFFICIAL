import { getWork, type WorkspaceActor } from "@/platform/workspaces";
import { WORK_PLAN_PRODUCT_ID, WORK_PLAN_RESOURCE_KIND, workPlanSchema, type WorkPlanRecord } from "./contracts";
import { WorkPlanNotFoundError } from "./errors";

export async function readWorkPlan(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  workId: string;
}): Promise<WorkPlanRecord> {
  const work = await getWork(input.actor, input.workId);
  if (!work || work.workspaceId !== input.workspaceId ||
    work.productId !== WORK_PLAN_PRODUCT_ID || work.resourceKind !== WORK_PLAN_RESOURCE_KIND) {
    throw new WorkPlanNotFoundError();
  }
  const plan = workPlanSchema.safeParse(work.payload);
  if (!plan.success) throw new WorkPlanNotFoundError("The saved plan is malformed or unavailable");
  return { work, plan: plan.data };
}
