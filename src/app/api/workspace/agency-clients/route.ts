import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { VersionAccessError } from "@/platform/system-versions";
import { isWorkspaceBodyTooLarge as isBodyTooLarge, readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { readAgencyClientsPage } from "@/experience/workspace/agency-server";
import { addAgencyClient, agencyAddClientReleaseEnabled, agencyClientActionSchema, AgencyClientError, issueAgencyClientOwnerClaim } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";

const query = z.object({ workspaceId: z.string().uuid(), cursor: z.string().uuid().nullable() }).strict();

/**
 * Every client of one agency in one read: a page of client rows, the agency
 * Queue and the Team. Replaces one GET /api/workspace per client. Postgres
 * scopes each row exactly as opening that client would; a client the actor
 * cannot open is not returned.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "The workspace release is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const url = new URL(request.url);
    const input = query.parse({ workspaceId: url.searchParams.get("workspaceId"), cursor: url.searchParams.get("cursor") || null });
    if (await isRateLimitedWindowedAsync(`workspace:agency-clients:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await readAgencyClientsPage(actor, input.workspaceId, input.cursor));
  } catch (error) {
    if (error instanceof VersionAccessError) return workspaceJson({ error: "This agency is unavailable to your account." }, 403);
    return workspaceHttpFailure(error);
  }
}

/**
 * An agency adds a client (#259): `add` creates the business from a URL or a
 * prospect with the agency as provider seat, seeds unconfirmed facts and,
 * given the owner's address, issues the owner claim link; `owner_link`
 * issues (or replaces) that link for a client the agency added. Nothing is
 * emailed: the link comes back once for the agency to deliver. Postgres
 * decides who may (an owner or admin of the agency) and enforces the limits.
 * Off unless STRELVA_AGENCY_ADD_CLIENT_RELEASE=1.
 */
export async function POST(request: Request) {
  if (!agencyAddClientReleaseEnabled()) return workspaceJson({ error: "Adding clients is not available yet. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = agencyClientActionSchema.parse(await readWorkspaceBody(request, 4_000));
    // Each add may fetch the client's site; keep a person to a human pace.
    if (await isRateLimitedWindowedAsync(`workspace:agency-client-add:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait a minute before adding another client." }, 429);
    if (body.action === "add") return workspaceJson(await addAgencyClient(actor, body), 201);
    return workspaceJson({ ownerClaim: await issueAgencyClientOwnerClaim(actor, body) }, 201);
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof z.ZodError && !isBodyTooLarge(error)) {
      return workspaceJson({ error: error.issues.find((issue) => issue.code === "custom")?.message ?? "Check the business name, website and owner email." }, 400);
    }
    return workspaceHttpFailure(error);
  }
}
