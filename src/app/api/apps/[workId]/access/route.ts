import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import {
  applicationAccessService,
  applicationUseGrantInputSchema,
  ApplicationUseAccessError,
  ApplicationUseConflictError,
  ApplicationUseInputError,
  ApplicationUseUnavailableError,
} from "@/products/applications/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(error: unknown) {
  if (error instanceof ApplicationUseAccessError) return json({ error: error.message, code: "application_access_denied" }, 403);
  if (error instanceof ApplicationUseConflictError) return json({ error: error.message, code: "application_use_conflict" }, 409);
  if (error instanceof ApplicationUseInputError) return json({ error: error.message, code: "application_use_invalid" }, 400);
  if (error instanceof ApplicationUseUnavailableError) return json({ error: error.message, code: "application_use_unavailable" }, 503);
  if (error instanceof z.ZodError) return json({ error: "Check the recipient, permissions, and expiry." }, 400);
  return json({ error: "Application access could not be confirmed." }, 503);
}

async function context(params: Promise<{ workId: string }>) {
  return z.string().uuid().parse((await params).workId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
) {
  if (!workspaceReleaseEnabled()) return json({ error: "Applications are not available yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage application access." }, 401);
    const body = await readWorkspaceBody(request, 32_000);
    const input = applicationUseGrantInputSchema.parse(body);
    return json(await applicationAccessService.grant(actor, await context(params), input), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workId: string }> },
) {
  if (!workspaceReleaseEnabled()) return json({ error: "Applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage application access." }, 401);
    const workId = await context(params);
    const grants = await applicationAccessService.list(actor, workId);
    return json({ grants, href: `/apps/${workId}` });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
) {
  if (!workspaceReleaseEnabled()) return json({ error: "Applications are not available yet." }, 503);
  const denied = workspaceWriteGuard(new Request(request, { method: "POST" }));
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to manage application access." }, 401);
    const grantId = z.string().uuid().parse(new URL(request.url).searchParams.get("grantId"));
    await applicationAccessService.revoke(actor, await context(params), grantId);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
