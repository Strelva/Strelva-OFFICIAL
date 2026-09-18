import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  applicationAccessService,
  ApplicationUseAccessError,
  ApplicationUseConflictError,
  ApplicationUseInputError,
  ApplicationUseUnavailableError,
} from "@/products/applications/server";
import { workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";

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
  if (error instanceof ApplicationUseAccessError) {
    return json({ error: error.message, code: "application_access_denied" }, 403);
  }
  if (error instanceof ApplicationUseConflictError) {
    return json({ error: error.message, code: "application_use_conflict" }, 409);
  }
  if (error instanceof ApplicationUseInputError) {
    return json({ error: error.message, code: "application_use_invalid" }, 400);
  }
  if (error instanceof ApplicationUseUnavailableError) {
    return json({ error: error.message, code: "application_use_unavailable" }, 503);
  }
  if (error instanceof z.ZodError) {
    return json({ error: "Check the record fields and try again." }, 400);
  }
  return json({ error: "This application could not be confirmed. Try again." }, 503);
}

async function workId(params: Promise<{ workId: string }>): Promise<string> {
  const value = (await params).workId;
  return z.string().uuid().parse(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workId: string }> },
) {
  if (!workspaceReleaseEnabled()) return json({ error: "Applications are not available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email to use this application." }, 401);
    return json(await applicationAccessService.inspect(actor, await workId(params)));
  } catch (error) {
    return failure(error);
  }
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
    if (!actor) return json({ error: "Sign in with a confirmed email to submit a record." }, 401);
    const body = await readWorkspaceBody(request, 120_000);
    const input = z.object({ action: z.literal("submit"), input: z.unknown() }).strict().parse(body);
    if (input.action !== "submit") return json({ error: "This application does not support that action." }, 422);
    return json(await applicationAccessService.submit(actor, await workId(params), input.input));
  } catch (error) {
    return failure(error);
  }
}
