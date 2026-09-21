import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import {
  createCustomApplicationService,
  CustomApplicationAccessError,
  CustomApplicationBuildError,
  CustomApplicationConflictError,
  customApplicationGrantInputSchema,
} from "@/products/custom-applications/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

function failure(error: unknown) {
  if (error instanceof CustomApplicationAccessError) return json({ error: error.message, code: "custom_application_access_denied" }, 403);
  if (error instanceof CustomApplicationConflictError) return json({ error: error.message, code: "custom_application_conflict" }, 409);
  if (error instanceof CustomApplicationBuildError) return json({ error: error.message, code: "custom_application_unavailable" }, 503);
  if (error instanceof z.ZodError) return json({ error: "Check the recipient and expiry." }, 400);
  return json({ error: "Custom application access could not be confirmed." }, 503);
}

async function context(params: Promise<{ workId: string }>) {
  return z.string().uuid().parse((await params).workId);
}

export async function GET(_request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage custom application access." }, 401);
    const id = await context(params);
    return json({ grants: await createCustomApplicationService().listGrants(actor, id), href: `/custom-applications/${id}` });
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
    if (!actor) return json({ error: "Sign in with a confirmed email to manage custom application access." }, 401);
    const input = customApplicationGrantInputSchema.parse(await readWorkspaceBody(request, 32_000));
    return json(await createCustomApplicationService().grant(actor, await context(params), input), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  const denied = workspaceWriteGuard(new Request(request, { method: "POST", headers: request.headers }));
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage custom application access." }, 401);
    const grantId = z.string().uuid().parse(new URL(request.url).searchParams.get("grantId"));
    await createCustomApplicationService().revoke(actor, await context(params), grantId);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
