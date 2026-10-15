import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { timeEntryCommandSchema, voidTimeCommandSchema } from "@/platform/care-reports/contracts";
import { careReportsMayBeOn } from "@/platform/care-reports/release";
import { careReportsAvailableForBusiness } from "@/server/care-reports/server";
import { listAgencyClientTime, recordAgencyClientTime, voidAgencyClientTime } from "@/platform/care-reports/service";
export const dynamic = "force-dynamic";

const off = () => workspaceJson({ error: "Care plan reports are not enabled." }, 503);
const isOff = () => !workspaceReleaseEnabled() || !careReportsMayBeOn();
const viewerFor = (actor: { userId: string }) => ({ operator: false, tester: false, userId: actor.userId });
const signIn = () => workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);

export async function GET(request: Request) {
  if (isOff()) return off();
  try {
    const actor = await workspaceHttpActor(); if (!actor) return signIn();
    const p = new URL(request.url).searchParams;
    const input = z.object({
      agencyWorkspaceId: z.string().uuid(), workspaceId: z.string().uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    }).strict().parse({ agencyWorkspaceId: p.get("agencyWorkspaceId"), workspaceId: p.get("workspaceId"), month: p.get("month") });
    if (!await careReportsAvailableForBusiness(input.workspaceId, viewerFor(actor))) return off();
    return workspaceJson(await listAgencyClientTime(actor, input));
  } catch (error) { return workspaceHttpFailure(error); }
}

export async function POST(request: Request) {
  if (isOff()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return signIn();
    const entry = timeEntryCommandSchema.parse(await readWorkspaceBody(request, 4_000));
    if (!await careReportsAvailableForBusiness(entry.workspaceId, viewerFor(actor))) return off();
    return workspaceJson(await recordAgencyClientTime(actor, entry));
  } catch (error) { return workspaceHttpFailure(error); }
}

export async function DELETE(request: Request) {
  if (isOff()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return signIn();
    return workspaceJson(await voidAgencyClientTime(actor, voidTimeCommandSchema.parse(await readWorkspaceBody(request, 4_000))));
  } catch (error) { return workspaceHttpFailure(error); }
}
