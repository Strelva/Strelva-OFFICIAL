import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { generateCommandSchema } from "@/platform/care-reports/contracts";
import { currentCareMonth, previousCareMonth } from "@/platform/care-reports/model";
import { careReportEmailEnabled, careReportShareLinksEnabled, careReportsMayBeOn } from "@/platform/care-reports/release";
import { listCareReports } from "@/platform/care-reports/service";
import { careReportsAvailableFor, generateAgencyCareReports } from "@/server/care-reports/server";
export const dynamic = "force-dynamic";

const off = () => workspaceJson({ error: "Care plan reports are not enabled." }, 503);
const isOff = () => !workspaceReleaseEnabled() || !careReportsMayBeOn();

export async function GET(request: Request) {
  if (isOff()) return off();
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const p = new URL(request.url).searchParams;
    const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value => value <= currentCareMonth()).parse(p.get("month") ?? previousCareMonth());
    const agencyWorkspaceId = z.string().uuid().parse(p.get("agencyWorkspaceId"));
    const list = await listCareReports(actor, agencyWorkspaceId, month);
    const available = await careReportsAvailableFor(list.clients.map(client => client.workspaceId), { operator: false, tester: false, userId: actor.userId });
    if (available.size === 0) return off();
    return workspaceJson({ ...list, emailOn: careReportEmailEnabled(), shareLinksOn: careReportShareLinksEnabled() });
  } catch (error) { return workspaceHttpFailure(error); }
}

export async function POST(request: Request) {
  if (isOff()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    if (await isRateLimitedWindowedAsync(`workspace:care-reports:${actor.userId}`, 10, 60_000)) return workspaceJson({ error: "Please wait before generating again." }, 429);
    const body = generateCommandSchema.parse(await readWorkspaceBody(request, 8_000));
    if (body.month > currentCareMonth()) return workspaceJson({ error: "Check the request. Some fields are missing or invalid." }, 400);
    return workspaceJson(await generateAgencyCareReports(actor, body, { operator: false, tester: false, userId: actor.userId }));
  } catch (error) { return workspaceHttpFailure(error); }
}
