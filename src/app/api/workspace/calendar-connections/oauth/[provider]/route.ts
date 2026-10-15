import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { calendarProviderSchema } from "@/products/scheduling/contracts";
import { assertWorkspaceCalendarManager, assertWorkspaceCalendarWriteAllowed, calendarOAuthConfiguration, createCalendarOAuthState } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to connect a calendar." }, 401);
    const provider = calendarProviderSchema.parse((await params).provider);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    await assertWorkspaceCalendarManager(actor, workspaceId);
    await assertWorkspaceCalendarWriteAllowed(workspaceId);
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    // The person navigated here, so a missing key lands them back on the scheduling view with the reason.
    const notSetUp = () => {
      const target = new URL(`${appUrl.replace(/\/$/, "")}/workspace`);
      target.searchParams.set("view", "scheduling");
      target.searchParams.set("workspaceId", workspaceId);
      target.searchParams.set("calendarError", `${provider === "outlook" ? "Microsoft Outlook" : "Google Calendar"} isn't set up on Strelva yet.`);
      return NextResponse.redirect(target);
    };
    const configuration = calendarOAuthConfiguration(provider, appUrl);
    if (!configuration) return notSetUp();
    let state: string;
    try { state = createCalendarOAuthState({ workspaceId, userId: actor.userId, provider }); } catch { return notSetUp(); }
    const target = `${configuration.authorizationUrl}&state=${encodeURIComponent(state)}`;
    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: "The calendar connection request is invalid." }, 400);
    return workspaceHttpFailure(error);
  }
}
