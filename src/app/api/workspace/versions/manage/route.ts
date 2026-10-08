import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { VersionAccessError, VersionConflictError, VersionIncompatibleError, VersionStaleError, VersionValidationError, VERSION_CONTEXT_KINDS } from "@/platform/system-versions";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { createBusinessVersion, manageBusinessVersion, readVersionCreationChoices, readVersionManagement } from "@/experience/workspace/agency/version-server";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const ref = z.object({ workspaceId: uuid, systemId: uuid, versionId: uuid, rowRevision: z.number().int().positive() });
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), agencyWorkspaceId: uuid, workspaceId: uuid,
    source: z.object({ businessId: uuid, systemId: uuid, revisionId: uuid, number: z.number().int().positive() }).strict(),
    context: z.object({ kind: z.enum(VERSION_CONTEXT_KINDS), label: z.string().trim().min(1).max(200) }).strict(),
    name: z.string().trim().min(1).max(160), commandId: uuid }).strict(),
  ref.extend({ action: z.literal("override"), path: z.string().min(1).max(300), value: z.json().optional(), clear: z.boolean().optional() }).strict(),
  ref.extend({ action: z.literal("bind"), kind: z.string().trim().min(1).max(80), connectionId: z.string().regex(/^(calendar|tenant):[0-9a-f-]{36}$/i) }).strict(),
  ref.extend({ action: z.literal("restore"), releaseNumber: z.number().int().positive() }).strict(),
  ref.extend({ action: z.literal("prepare_release") }).strict(),
]);
function failure(error: unknown) {
  if (error instanceof VersionAccessError) return workspaceJson({ error: error.message }, 403);
  if (error instanceof VersionStaleError || error instanceof VersionConflictError || error instanceof VersionIncompatibleError) return workspaceJson({ error: error.message }, 409);
  if (error instanceof VersionValidationError) return workspaceJson({ error: error.message }, 400);
  return workspaceHttpFailure(error);
}
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Versions are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const query = new URL(request.url).searchParams;
    if (query.has("workspaceId")) {
      const workspaceId = uuid.parse(query.get("workspaceId")), systemId = uuid.parse(query.get("systemId"));
      if (!(await systemsReleasedFor(actor, workspaceId))) return workspaceJson({ error: "Versions are not enabled." }, 503);
      return workspaceJson(await readVersionManagement(actor, workspaceId, systemId));
    }
    const agencyWorkspaceId = uuid.parse(query.get("agencyWorkspaceId"));
    if (!(await systemsReleasedFor(actor, agencyWorkspaceId))) return workspaceJson({ error: "Versions are not enabled." }, 503);
    return workspaceJson(await readVersionCreationChoices(actor, agencyWorkspaceId));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !systemsReleaseMayBeOn()) return workspaceJson({ error: "Versions are not enabled. Nothing changed." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in to continue." }, 401);
    const input = command.parse(await readWorkspaceBody(request, 128_000));
    if (!(await systemsReleasedFor(actor, input.workspaceId)) || (input.action === "create" && !(await systemsReleasedFor(actor, input.agencyWorkspaceId)))) return workspaceJson({ error: "Versions are not enabled for this business. Nothing changed." }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:version-manage:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(input.action === "create" ? await createBusinessVersion(actor, input) : await manageBusinessVersion(actor, input), input.action === "create" ? 201 : 200);
  } catch (error) { return failure(error); }
}
