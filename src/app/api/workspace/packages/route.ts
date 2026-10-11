import { bundleTargetsSchema } from "@/platform/system-versions/bundle-contracts";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { VersionAccessError, VersionValidationError, VersionStaleError } from "@/platform/system-versions";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { installPackageFromListing, readPackageCatalog, readPackageCreator, managePackage, readPackageSource, readInstallGrants, manageInstallGrant } from "@/experience/workspace/agency/package-server";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const base = { workspaceId: uuid };
const command = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("grant_install"), agencyWorkspaceId: uuid, revisionId: uuid, commandId: uuid, expiresAt: z.string().datetime() }).strict(),
  z.object({ ...base, action: z.literal("revoke_install"), grantId: uuid }).strict(),
  z.object({ ...base, action: z.literal("install"), source: z.object({ businessId: uuid, systemId: uuid, revisionId: uuid, number: z.number().int().positive() }).strict(), name: z.string().trim().min(1).max(160), commandId: uuid, targets: bundleTargetsSchema.optional() }).strict(),
  z.object({ ...base, action: z.literal("qualify"), revisionId: uuid }).strict(),
  z.object({ ...base, action: z.literal("review"), revisionId: uuid, approve: z.boolean(), note: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...base, action: z.literal("listing"), systemId: uuid, state: z.enum(["private", "clients", "listed"]) }).strict(),
]);
function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: error.message }, 403);
  if (error instanceof VersionValidationError) return workspaceJson({ error: error.message }, 400);
  if (error instanceof VersionStaleError) return workspaceJson({ error: error.message }, 409);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Packages are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const params = new URL(request.url).searchParams;
    const workspaceId = uuid.parse(params.get("workspaceId"));
    if (!(await systemsReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Packages are not enabled." }, 503);
    if (params.has("sourceSystemId")) return workspaceJson(await readPackageSource(actor, workspaceId, uuid.parse(params.get("sourceSystemId"))));
    if (params.has("grantsForRevision")) return workspaceJson({ workspaceId, grants: await readInstallGrants(actor, workspaceId, uuid.parse(params.get("grantsForRevision"))) });
    return workspaceJson(params.has("systemId") ? await readPackageCreator(actor, workspaceId, uuid.parse(params.get("systemId"))) : await readPackageCatalog(actor, workspaceId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Packages are not enabled." }, 503);
  const guarded = workspaceWriteGuard(request); if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const input = command.parse(await readWorkspaceBody(request, 64_000));
    if (!(await systemsReleasedFor(actor, input.workspaceId))) return workspaceJson({ error: "Packages are not enabled." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:packages:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(input.action === "install" ? await installPackageFromListing(actor, input) : input.action === "grant_install" || input.action === "revoke_install" ? await manageInstallGrant(actor, input) : await managePackage(actor, input.workspaceId, input), input.action === "install" ? 201 : 200);
  } catch (error) { return failure(error); }
}
