import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { listPublicWebsiteBookingGrants, publishPublicWebsiteBookingGrant, revokePublicWebsiteBookingGrant } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

const publishInput = z.object({
  action: z.literal("publish"),
  businessId: z.string().uuid(),
  tenantId: z.string().trim().min(1).max(80),
  workId: z.string().uuid(),
  capabilityId: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  capabilityVersion: z.number().int().positive(),
  inquiryCapabilityId: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  inquiryVersion: z.number().int().positive(),
  provider: z.enum(["outlook", "google"]),
  displayName: z.string().trim().min(1).max(160),
  timeZone: z.string().trim().min(1).max(128),
}).strict();

const revokeInput = z.object({
  action: z.literal("revoke"),
  businessId: z.string().uuid(),
  grantId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to manage public booking." }, 401);
    const businessId = z.string().uuid().parse(new URL(request.url).searchParams.get("businessId"));
    return workspaceJson({ grants: await listPublicWebsiteBookingGrants(actor, businessId) });
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
    if (!actor) return workspaceJson({ error: "Sign in to publish public booking." }, 401);
    const input = publishInput.parse(await readWorkspaceBody(request, 30_000));
    const { action: _action, ...grant } = input;
    return workspaceJson({ grant: await publishPublicWebsiteBookingGrant(actor, grant) }, 201);
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function DELETE(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to revoke public booking." }, 401);
    const input = revokeInput.parse(await readWorkspaceBody(request, 30_000));
    return workspaceJson({ grant: await revokePublicWebsiteBookingGrant(actor, input) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
