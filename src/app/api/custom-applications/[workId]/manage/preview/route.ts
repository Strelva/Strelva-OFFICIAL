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
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function failure(error: unknown) {
  if (error instanceof CustomApplicationAccessError) return json({ error: error.message }, 403);
  if (error instanceof CustomApplicationConflictError) return json({ error: error.message }, 409);
  if (error instanceof CustomApplicationBuildError) return json({ error: error.message }, 503);
  if (error instanceof z.ZodError) return json({ error: "The custom application identifier is invalid." }, 400);
  return json({ error: "The custom application preview could not be confirmed." }, 503);
}

export async function GET(_request: Request, { params }: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return json({ error: "Custom applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to preview this custom application." }, 401);
    const workId = z.string().uuid().parse((await params).workId);
    return json({ preview: await createCustomApplicationService().preview(actor, workId) });
  } catch (error) {
    return failure(error);
  }
}
