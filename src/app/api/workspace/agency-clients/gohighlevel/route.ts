import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { disconnectGhlAgency, ghlImportReleaseEnabled, GhlImportError, readGhlConnection, readGhlImportRows } from "@/products/agency-clients/gohighlevel";

export const dynamic = "force-dynamic";
// A large agency is a few hundred paced HighLevel reads.
export const maxDuration = 60;

const query = z.object({ workspaceId: z.string().uuid(), rows: z.enum(["1"]).optional() }).strict();

function failure(error: unknown) {
  if (error instanceof GhlImportError) return workspaceJson({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError) return workspaceJson({ error: "Check the request." }, 400);
  return workspaceHttpFailure(error);
}

/**
 * The agency's HighLevel connection, and with `rows=1` every sub-account as an
 * Import clients row for the preview. Reading adds nothing.
 */
export async function GET(request: Request) {
  if (!ghlImportReleaseEnabled()) return workspaceJson({ error: "Importing from HighLevel isn't available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const url = new URL(request.url);
    const input = query.parse(Object.fromEntries(url.searchParams));
    const connection = await readGhlConnection(actor, input.workspaceId);
    if (!input.rows) return workspaceJson({ connection });
    if (await isRateLimitedWindowedAsync(`workspace:agency-ghl-rows:${input.workspaceId}`, 6, 60_000)) return workspaceJson({ error: "Please wait a minute before reading HighLevel again." }, 429);
    return workspaceJson({ connection, source: "gohighlevel", rows: await readGhlImportRows(actor, input.workspaceId) });
  } catch (error) {
    return failure(error);
  }
}

/** Forget the stored HighLevel grant. The agency also removes the app in HighLevel. */
export async function DELETE(request: Request) {
  if (!ghlImportReleaseEnabled()) return workspaceJson({ error: "Importing from HighLevel isn't available yet." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    await disconnectGhlAgency(actor, workspaceId);
    return workspaceJson({ disconnected: true });
  } catch (error) {
    return failure(error);
  }
}
