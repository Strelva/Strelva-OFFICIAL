import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { ConnectedSiteInputError } from "@/products/connected-sites/server";
import { verticalIntakeAppIdSchema } from "@/products/vertical-intake/contracts";
import {
  checkIntakeLive, pauseIntake, readIntakeApp, requestIntakeLive, revealIntakeSensitive, saveIntakeDraft, verticalIntakeReleasedFor,
} from "@/products/vertical-intake/server";

export const dynamic = "force-dynamic";

const base = { workspaceId: z.string().uuid(), appId: verticalIntakeAppIdSchema };
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), ...base, expectedRevision: z.number().int().min(0), config: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.literal("request_live"), ...base }).strict(),
  z.object({ action: z.literal("pause"), ...base, paused: z.boolean() }).strict(),
  z.object({ action: z.literal("check_live"), ...base }).strict(),
  z.object({ action: z.literal("reveal"), ...base, submissionId: z.string().uuid() }).strict(),
]);

const OFF = "Dental intake is not enabled.";

/**
 * The Dental intake panel on Inquiries: GET reads its whole state; POST saves the draft, asks the owner to make it
 * live, pauses it, checks the live page, or reveals a stored member ID. SQL decides who may. Off unless the
 * business's vertical_intake row is on for the viewer (verticalIntakeReleasedFor). A revealed value is sent
 * with no-store and is never logged.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: OFF }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspaceId"));
    const appId = verticalIntakeAppIdSchema.parse(url.searchParams.get("appId") ?? "dental_intake");
    if (!(await verticalIntakeReleasedFor(actor, workspaceId))) return workspaceJson({ error: OFF }, 503);
    return workspaceJson(await readIntakeApp(actor, workspaceId, appId));
  } catch (error) {
    if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: `${OFF} Nothing changed.` }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = action.parse(await readWorkspaceBody(request, 4_000));
    if (!(await verticalIntakeReleasedFor(actor, body.workspaceId))) return workspaceJson({ error: `${OFF} Nothing changed.` }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:vertical-intake:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (body.action === "save") return workspaceJson({ install: await saveIntakeDraft(actor, body.workspaceId, body.appId, body.expectedRevision, body.config) });
    if (body.action === "request_live") return workspaceJson({ install: await requestIntakeLive(actor, body.workspaceId, body.appId) });
    if (body.action === "pause") return workspaceJson({ install: await pauseIntake(actor, body.workspaceId, body.appId, body.paused) });
    if (body.action === "check_live") return workspaceJson({ check: await checkIntakeLive(actor, body.workspaceId, body.appId) });
    const values = await revealIntakeSensitive(actor, body.workspaceId, body.submissionId);
    return workspaceJson({ values });
  } catch (error) {
    if (error instanceof ConnectedSiteInputError) return workspaceJson({ error: error.message }, 400);
    return workspaceHttpFailure(error);
  }
}
