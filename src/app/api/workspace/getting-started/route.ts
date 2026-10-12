import { z } from "zod";
import { businessSignupReleaseEnabled, gettingStartedHref } from "@/platform/business-signup-release";
import { recordFunnelEvent } from "@/platform/infra/funnel";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { BusinessRecordValidationError } from "@/platform/business-record/repository";
import { isWorkspaceBodyTooLarge, readWorkspaceBody, workspaceHttpActor, workspaceJson as json, workspaceWriteGuard } from "@/platform/workspaces/http";
import { WorkspaceAccessError, WorkspaceConflictError, WORKSPACE_LIMIT_MESSAGE } from "@/platform/workspaces/types";
import { CHECK_RESULT_ID, gettingStartedActionSchema } from "@/products/getting-started/contracts";
import { FoundFactInputError } from "@/products/found-facts/store";
import { gettingStarted, GettingStartedInputError, GettingStartedRateLimitError, GettingStartedUnavailableError } from "@/products/getting-started/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failure(error: unknown) {
  if (isWorkspaceBodyTooLarge(error)) return json({ error: "This request is too large." }, 413);
  if (error instanceof z.ZodError) return json({ error: "Check the information supplied and try again." }, 400);
  if (error instanceof GettingStartedInputError || error instanceof FoundFactInputError) return json({ error: error.message }, 400);
  if (error instanceof BusinessRecordValidationError) return json({ error: "That detail isn't in a form your business record accepts." }, 400);
  if (error instanceof GettingStartedRateLimitError) return json({ error: error.message }, 429);
  if (error instanceof GettingStartedUnavailableError) return json({ error: error.message }, 422);
  if (error instanceof Error && error.name === "PublicAiVisibilityImportRateLimitError") return json({ error: "You've reached the daily saved-result limit. Try again tomorrow." }, 429);
  if (error instanceof Error && ["PublicAiVisibilityResultUnavailableError", "PublicWebsiteAuditUnavailableError"].includes(error.name)) return json({ error: "This check has expired or is unavailable. Run another check." }, 404);
  if (error instanceof WorkspaceAccessError) return json({ error: "This business is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message === WORKSPACE_LIMIT_MESSAGE ? WORKSPACE_LIMIT_MESSAGE : error.message || "This changed since it was shown. Refresh and try again." }, 409);
  console.error("[getting-started] request failed", { error: error instanceof Error ? error.name : "unknown" });
  return json({ error: "That didn't go through. Nothing new was confirmed. Try again." }, 503);
}

/** `?check=` previews what a check would start; `?workspaceId=` reads the business. */
export async function GET(request: Request) {
  if (!businessSignupReleaseEnabled()) return json({ error: "Getting started isn't open here yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email." }, 401);
    const params = new URL(request.url).searchParams;
    const check = params.get("check");
    if (check !== null) {
      if (!CHECK_RESULT_ID.test(check)) return json({ error: "This check is unavailable." }, 404);
      const found = await gettingStarted.readCheck(check);
      if (!found) return json({ error: "This check has expired or is unavailable. Run another check." }, 404);
      return json({ check: { ...found, suggestedName: found.name ?? gettingStarted.websiteHost(found.website) } });
    }
    const workspaceId = z.string().uuid().parse(params.get("workspaceId"));
    return json({ business: await gettingStarted.read(actor, workspaceId) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!businessSignupReleaseEnabled()) return json({ error: "Getting started isn't open here yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return json({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:getting-started:${actor.userId}`, 30, 60_000)) return json({ error: "Please wait a moment before trying again." }, 429);
    const input = gettingStartedActionSchema.parse(await readWorkspaceBody(request, 24_000));
    switch (input.action) {
      case "start_from_check": {
        const started = await gettingStarted.startFromCheck(actor, input);
        if (!started.alreadyCreated) void recordFunnelEvent("business_created", started.workspaceId, { workspaceId: started.workspaceId });
        void recordFunnelEvent("check_saved", input.resultId, { workspaceId: started.workspaceId });
        return json({ ...started, location: gettingStartedHref(started.workspaceId) }, started.alreadyCreated ? 200 : 201);
      }
      case "read_website":
        return json({ reading: await gettingStarted.readWebsite(actor, input.workspaceId, input.url) });
      case "decide_found_facts":
        return json(await gettingStarted.decide(actor, input));
    }
  } catch (error) { return failure(error); }
}
