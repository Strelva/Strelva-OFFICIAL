import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import {
  createCustomApplicationService,
  CustomApplicationAccessError,
  CustomApplicationBuildError,
  CustomApplicationConflictError,
  customApplicationBudgetSchema,
  customApplicationBuildInputSchema,
  customApplicationReleaseInputSchema,
  customApplicationReviewInputSchema,
  customApplicationReviseInputSchema,
  customApplicationRollbackInputSchema,
} from "@/products/custom-applications/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

function failure(error: unknown) {
  if (error instanceof CustomApplicationAccessError) return json({ error: error.message, code: "custom_application_access_denied" }, 403);
  if (error instanceof CustomApplicationConflictError) return json({ error: error.message, code: "custom_application_conflict" }, 409);
  if (error instanceof CustomApplicationBuildError) return json({ error: error.message, code: "custom_application_build_unavailable" }, 503);
  if (error instanceof z.ZodError) return json({ error: "Check the requested lifecycle change." }, 400);
  return json({ error: "The custom application could not be confirmed." }, 503);
}

async function context(params: Promise<{ workId: string }>) {
  return z.string().uuid().parse((await params).workId);
}

export async function GET(_request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage this custom application." }, 401);
    return json({ application: await createCustomApplicationService().read(actor, await context(params)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage this custom application." }, 401);
    const body = await readWorkspaceBody(request, 600_000);
    const action = z.string().parse((body as { action?: unknown })?.action);
    const id = await context(params);
    const service = createCustomApplicationService();
    if (action === "admit_budget") return json({ application: await service.admitBudget(actor, id, customApplicationBudgetSchema.parse((body as { input?: unknown }).input)) });
    if (action === "revise") return json({ application: await service.revise(actor, id, customApplicationReviseInputSchema.parse((body as { input?: unknown }).input)) });
    if (action === "build") return json({ application: await service.build(actor, id, customApplicationBuildInputSchema.parse((body as { input?: unknown }).input)) });
    if (action === "review") return json({ application: await service.review(actor, id, customApplicationReviewInputSchema.parse((body as { input?: unknown }).input)) });
    if (action === "release") return json({ application: await service.release(actor, id, customApplicationReleaseInputSchema.parse((body as { input?: unknown }).input)) });
    if (action === "rollback") return json({ application: await service.rollback(actor, id, customApplicationRollbackInputSchema.parse((body as { input?: unknown }).input)) });
    if (action === "retire") return json({ application: await service.retire(actor, id) });
    return json({ error: "This lifecycle action is not supported." }, 422);
  } catch (error) {
    return failure(error);
  }
}
