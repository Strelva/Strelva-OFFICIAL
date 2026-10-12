import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { releaseViewerFor } from "@/platform/release-flags/viewer";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { inquiryForwardingReleaseEnabled, inquiryForwardingReleasedFor } from "@/products/inquiry-forwarding/release";
import { issueForwarding, readForwarding, revokeForwarding } from "@/products/inquiry-forwarding/server";

export const dynamic = "force-dynamic";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue"), workspaceId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("rotate"), workspaceId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("revoke"), workspaceId: z.string().uuid(), addressId: z.string().uuid() }).strict(),
]);

const OFF = "Forwarding inquiries is not enabled.";

/**
 * The business's inquiry forwarding address. GET reads it, the latest
 * forwarded inquiry and any Gmail confirmation (the "send a test" check polls
 * this). POST issues, rotates or revokes it. SQL decides who may: members
 * read; the owner, an admin or an agency holding the inquiries area change it.
 * Off unless STRELVA_INQUIRY_FORWARDING_RELEASE=1 over the inquiries release.
 */
export async function GET(request: Request) {
  if (!inquiryForwardingReleaseEnabled()) return workspaceJson({ error: OFF }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    if (!(await inquiryForwardingReleasedFor(workspaceId, await releaseViewerFor(actor)))) return workspaceJson({ error: OFF }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:inquiry-forwarding:read:${actor.userId}`, 120, 60_000)) return workspaceJson({ error: "Please wait before checking again." }, 429);
    return workspaceJson({ forwarding: await readForwarding(actor, workspaceId) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

export async function POST(request: Request) {
  if (!inquiryForwardingReleaseEnabled()) return workspaceJson({ error: `${OFF} Nothing changed.` }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = action.parse(await readWorkspaceBody(request, 2_000));
    if (!(await inquiryForwardingReleasedFor(body.workspaceId, await releaseViewerFor(actor)))) return workspaceJson({ error: `${OFF} Nothing changed.` }, 503);
    if (await isRateLimitedWindowedAsync(`workspace:inquiry-forwarding:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    if (body.action === "revoke") return workspaceJson({ forwarding: await revokeForwarding(actor, body.workspaceId, body.addressId) });
    return workspaceJson({ forwarding: await issueForwarding(actor, body.workspaceId, { rotate: body.action === "rotate" }) }, body.action === "issue" ? 201 : 200);
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
