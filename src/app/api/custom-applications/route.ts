import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import {
  createCustomApplicationService,
  CustomApplicationAccessError,
  CustomApplicationBuildError,
  CustomApplicationBudgetRecoveryError,
  CustomApplicationConflictError,
  customApplicationCreateInputSchema,
} from "@/products/custom-applications/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

function failure(error: unknown) {
  if (error instanceof CustomApplicationBudgetRecoveryError) return json({
    error: error.message,
    code: "custom_application_budget_recovery",
    draftWorkId: error.workId,
    draftBudget: { maxAuthorizedCents: error.budget.maxAuthorizedCents, estimateCents: error.budget.estimateCents },
  }, 503);
  if (error instanceof CustomApplicationAccessError) return json({ error: error.message, code: "custom_application_access_denied" }, 403);
  if (error instanceof CustomApplicationConflictError) return json({ error: error.message, code: "custom_application_conflict" }, 409);
  if (error instanceof CustomApplicationBuildError) return json({ error: error.message, code: "custom_application_build_unavailable" }, 503);
  if (error instanceof z.ZodError) return json({ error: "Check the application source and budget details." }, 400);
  return json({ error: "The custom application could not be confirmed." }, 503);
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to create custom work." }, 401);
    const body = await readWorkspaceBody(request, 600_000);
    const input = z.object({ workspaceId: z.string().uuid(), application: customApplicationCreateInputSchema }).strict().parse(body);
    const application = await createCustomApplicationService().create(actor, input.workspaceId, input.application);
    return json({ application }, 201);
  } catch (error) {
    return failure(error);
  }
}
