import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import {
  joinPlanWaitlist,
  leavePlanWaitlist,
  plansOpen,
} from "@/platform/business-billing/plan-waitlist";
import {
  readWorkspaceBody,
  workspaceHttpActor,
  workspaceHttpFailure,
  workspaceJson,
  workspaceWriteGuard,
} from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

const body = z
  .object({
    workspaceId: z.string().uuid(),
    action: z.enum(["join", "leave"]),
  })
  .strict();

/**
 * POST { workspaceId, action: "join" | "leave" }: the business's owner or an
 * admin asks to hear when plans open, or takes the business off that list.
 * Saves one entry with the signed-in person's confirmed email. Sends nothing.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled())
    return workspaceJson({ error: "Business accounts are not open yet." }, 503);
  const denied = workspaceWriteGuard(request);
  if (denied) return denied;
  if (plansOpen())
    return workspaceJson(
      { error: "Plans are open. Choose one on Plan and usage." },
      409,
    );
  try {
    const actor = await workspaceHttpActor();
    if (!actor)
      return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (
      await isRateLimitedWindowedAsync(
        `workspace:plan-waitlist:${actor.userId}`,
        10,
        60_000,
      )
    )
      return workspaceJson(
        { error: "Please wait a minute before trying again." },
        429,
      );
    const { workspaceId, action } = body.parse(
      await readWorkspaceBody(request, 1_000),
    );
    const workspace = (await listWorkspaces(actor)).find(
      (item) => item.id === workspaceId,
    );
    if (
      !workspace ||
      workspace.kind !== "customer" ||
      workspace.access !== "member" ||
      (workspace.role !== "owner" && workspace.role !== "admin")
    )
      return workspaceJson(
        { error: "Only this business's owner can ask about plans." },
        403,
      );
    if (action === "leave") {
      const left = await leavePlanWaitlist(workspaceId);
      if (!left)
        return workspaceJson(
          { error: "The list can't be reached right now. Nothing changed." },
          503,
        );
      return workspaceJson({ joined: false });
    }
    const saved = await joinPlanWaitlist({
      workspaceId,
      businessName: workspace.name,
      email: actor.verifiedEmail,
    });
    if (!saved)
      return workspaceJson(
        { error: "The list can't be reached right now. Nothing changed." },
        503,
      );
    const slack = process.env.SLACK_WEBHOOK_URL;
    if (slack && !saved.repeat)
      await fetch(slack, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Plan waitlist: ${workspace.name} · ${actor.verifiedEmail}`,
        }),
      }).catch(() => undefined);
    return workspaceJson({ joined: true, email: saved.entry.email });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}
