import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  createAgencyApplicationDraftAccessService,
} from "@/platform/offerings";
import {
  readWorkspaceBody,
  workspaceHttpActor,
  workspaceHttpFailure,
  workspaceJson,
  workspaceWriteGuard,
} from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

const service = () => createAgencyApplicationDraftAccessService();

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to inspect draft access." }, 401);
    const workId = z.string().uuid().parse(new URL(request.url).searchParams.get("workId"));
    return workspaceJson({ grant: await service().read(actor, workId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to change draft access." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("grant"), deliveryId: z.string().uuid(), workId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("revoke"), grantId: z.string().uuid() }).strict(),
    ]).parse(await readWorkspaceBody(request, 20_000));
    if (input.action === "grant") return workspaceJson({ grant: await service().grant(actor, input.deliveryId, input.workId) }, 201);
    return workspaceJson({ grant: await service().revoke(actor, input.grantId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

