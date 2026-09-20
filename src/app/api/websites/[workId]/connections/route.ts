import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import {
  connectWebsiteCapabilities,
  listWebsiteCapabilityOptions,
  WebsiteConflictError,
  WebsiteUnavailableError,
} from "@/products/websites/server";
import { connectWebsiteCapabilitiesInputSchema } from "@/products/websites/contracts";

export const dynamic = "force-dynamic";

function workIdFrom(params: { workId: string }): string {
  return z.string().uuid().parse(params.workId);
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return workspaceJson({ error: "This website work is unavailable to your account." }, 403);
  if (error instanceof WebsiteConflictError || error instanceof WorkspaceConflictError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the website connection selection." }, 400);
  if (error instanceof WebsiteUnavailableError || error instanceof WorkspaceStoreError) return workspaceJson({ error: error.message }, 503);
  return workspaceJson({ error: "The website connections could not be confirmed. Reload and try again." }, 503);
}

export async function GET(_request: Request, context: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to open website connections." }, 401);
  try {
    return workspaceJson(await listWebsiteCapabilityOptions(current, workIdFrom(await context.params)));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ workId: string }> }) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request);
  if (guard) return guard;
  const current = await workspaceHttpActor();
  if (!current) return workspaceJson({ error: "Sign in to change website connections." }, 401);
  try {
    const workId = workIdFrom(await context.params);
    const input = connectWebsiteCapabilitiesInputSchema.parse(await readWorkspaceBody(request));
    return workspaceJson(await connectWebsiteCapabilities(current, workId, input));
  } catch (error) {
    return failure(error);
  }
}
