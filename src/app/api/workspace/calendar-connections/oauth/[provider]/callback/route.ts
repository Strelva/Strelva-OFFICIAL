import { NextResponse } from "next/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { calendarProviderSchema } from "@/products/scheduling/contracts";
import { assertWorkspaceCalendarManager, assertWorkspaceCalendarWriteAllowed, calendarOAuthRedirectUri, consumeCalendarOAuthState, exchangeCalendarOAuthCode, saveWorkspaceCalendarConnection } from "@/products/scheduling/server";

export const dynamic = "force-dynamic";

function redirect(appUrl: string, message?: string, workspaceId?: string): NextResponse {
  const target = new URL(`${appUrl.replace(/\/$/, "")}/workspace`);
  target.searchParams.set("view", "scheduling");
  if (workspaceId) target.searchParams.set("workspaceId", workspaceId);
  if (message) target.searchParams.set("calendarError", message);
  return NextResponse.redirect(target);
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!workspaceReleaseEnabled()) return new NextResponse("Workspaces are not enabled.", { status: 503 });
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  let stateWorkspaceId: string | undefined;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !stateToken) return redirect(appUrl, "Calendar authorization was cancelled or incomplete.");
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return redirect(appUrl, "Your session expired. Connect the calendar again.");
    const provider = calendarProviderSchema.parse((await params).provider);
    const state = await consumeCalendarOAuthState(stateToken);
    if (!state || state.provider !== provider || state.userId !== actor.userId) return redirect(appUrl, "The calendar authorization could not be verified.");
    stateWorkspaceId = state.workspaceId;
    await assertWorkspaceCalendarManager(actor, state.workspaceId);
    await assertWorkspaceCalendarWriteAllowed(state.workspaceId);
    const tokens = await exchangeCalendarOAuthCode(provider, code, calendarOAuthRedirectUri(provider, appUrl));
    await saveWorkspaceCalendarConnection(actor, state.workspaceId, {
      provider,
      calendarId: "pending",
      calendarName: "Choose a calendar",
      timeZone: "UTC",
      reminderPolicy: { mode: "off" },
    }, tokens, "authorized");
    return redirect(appUrl, undefined, state.workspaceId);
  } catch {
    return redirect(appUrl, "The calendar could not be connected. No booking was sent.", stateWorkspaceId);
  }
}
