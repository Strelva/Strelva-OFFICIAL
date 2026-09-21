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
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return workspaceJson({ error: "Calendar OAuth is not configured." }, 503);
    const configuration = calendarOAuthConfiguration(provider, appUrl);
    if (!configuration) return workspaceJson({ error: "Calendar OAuth is not configured." }, 503);
    const state = createCalendarOAuthState({ workspaceId, userId: actor.userId, provider });
    const target = `${configuration.authorizationUrl}&state=${encodeURIComponent(state)}`;
    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof z.ZodError) return workspaceJson({ error: "The calendar connection request is invalid." }, 400);
    return workspaceHttpFailure(error);
  }
}
