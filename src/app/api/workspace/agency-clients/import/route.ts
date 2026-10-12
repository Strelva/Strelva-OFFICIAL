import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { isWorkspaceBodyTooLarge as isBodyTooLarge, readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { clientImportActionSchema } from "@/products/agency-clients/import-contract";
import { applyClientImport, previewClientImport } from "@/products/agency-clients/import-server";
import { agencyImportReleaseEnabled, AgencyClientError } from "@/products/agency-clients/server";

export const dynamic = "force-dynamic";
// An apply adds up to three clients, each with its site scan and AI check.
export const maxDuration = 120;

/**
 * Import clients. `preview` checks every row and adds nothing; `apply` adds
 * the confirmed rows (a few per request) through the ordinary add, each with
 * a key derived from the agency, the source and the row, so a repeated
 * request never adds a client twice. Nothing is emailed to an owner. Off
 * unless STRELVA_AGENCY_IMPORT_RELEASE=1 on top of the add-client release.
 */
export async function POST(request: Request) {
  if (!agencyImportReleaseEnabled()) return workspaceJson({ error: "Importing clients is not available yet. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = clientImportActionSchema.parse(await readWorkspaceBody(request, 800_000));
    if (body.action === "preview") {
      if (await isRateLimitedWindowedAsync(`workspace:agency-client-import-preview:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait a minute before checking another list." }, 429);
      return workspaceJson(await previewClientImport(actor, body));
    }
    // Each row may fetch a client's site; the database still holds the agency's own limits.
    if (await isRateLimitedWindowedAsync(`workspace:agency-client-import-apply:${actor.userId}`, 40, 60_000)) return workspaceJson({ error: "Please wait a minute, then continue the import. Nothing is added twice." }, 429);
    return workspaceJson(await applyClientImport(actor, body));
  } catch (error) {
    if (error instanceof AgencyClientError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof z.ZodError && !isBodyTooLarge(error)) return workspaceJson({ error: "Check the rows and try again." }, 400);
    return workspaceHttpFailure(error);
  }
}
