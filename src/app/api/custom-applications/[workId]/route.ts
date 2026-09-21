import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import {
  createCustomApplicationService,
  CustomApplicationAccessError,
  CustomApplicationBuildError,
  CustomApplicationConflictError,
} from "@/products/custom-applications/server";

export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

function failure(error: unknown) {
  if (error instanceof CustomApplicationAccessError) return json({ error: error.message, code: "custom_application_access_denied" }, 403);
  if (error instanceof CustomApplicationConflictError) return json({ error: error.message, code: "custom_application_conflict" }, 409);
  if (error instanceof CustomApplicationBuildError) return json({ error: error.message, code: "custom_application_unavailable" }, 503);
  if (error instanceof z.ZodError) return json({ error: "The custom application link is invalid." }, 400);
  return json({ error: "This custom application could not be confirmed." }, 503);
}

async function workId(params: Promise<{ workId: string }>) {
  return z.string().uuid().parse((await params).workId);
}

export async function GET(_request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to use this custom application." }, 401);
    return json(await createCustomApplicationService().use(actor, await workId(params)));
  } catch (error) {
    return failure(error);
  }
}
