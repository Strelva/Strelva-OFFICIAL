import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { reportActionSchema } from "@/platform/care-reports/contracts";
import { careDeliveryLine } from "@/platform/care-reports/model";
import { careReportEmailEnabled, careReportShareLinksEnabled, careReportsMayBeOn } from "@/platform/care-reports/release";
import { issueCareReportShareLink, publishCareReport, revokeCareReportShareLink, saveCareReportNote } from "@/platform/care-reports/service";
import { careReportShareUrl, mintCareReportToken, requestOrigin } from "@/platform/care-reports/share";
import { careReportsAvailableForBusiness, readCareReportForViewer, sendCareReport } from "@/server/care-reports/server";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ reportId: string }> };
const off = () => workspaceJson({ error: "Care plan reports are not enabled." }, 503);
const isOff = () => !workspaceReleaseEnabled() || !careReportsMayBeOn();
const missing = () => workspaceJson({ error: "This report was not found." }, 404);

export async function GET(_request: Request, context: Context) {
  if (isOff()) return off();
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const reportId = z.string().uuid().safeParse((await context.params).reportId);
    if (!reportId.success) return missing();
    return workspaceJson({ ...(await readCareReportForViewer(actor, reportId.data)), emailOn: careReportEmailEnabled(), shareLinksOn: careReportShareLinksEnabled() });
  } catch (error) { return workspaceHttpFailure(error); }
}

export async function POST(request: Request, context: Context) {
  if (isOff()) return off();
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const reportId = z.string().uuid().safeParse((await context.params).reportId);
    if (!reportId.success) return missing();
    const id = reportId.data;
    const action = reportActionSchema.parse(await readWorkspaceBody(request, 8_000));
    const view = await readCareReportForViewer(actor, id);
    if (!await careReportsAvailableForBusiness(view.report.businessWorkspaceId, { operator: false, tester: false, userId: actor.userId })) return off();
    const origin = requestOrigin(request.headers);
    switch (action.action) {
      case "note": return workspaceJson(await saveCareReportNote(actor, id, action.note, action.expectedRevision));
      case "publish": return workspaceJson(await publishCareReport(actor, id, action.expectedRevision));
      case "share_link": {
        if (!careReportShareLinksEnabled()) return workspaceJson({ error: "Share links are not enabled." }, 503);
        const { token, tokenHash } = mintCareReportToken();
        await issueCareReportShareLink(actor, id, tokenHash);
        // The token leaves only here. Storage keeps its hash.
        return workspaceJson({ url: careReportShareUrl(origin, token) });
      }
      case "revoke_link": return workspaceJson(await revokeCareReportShareLink(actor, id));
      case "send": {
        const result = await sendCareReport(actor, id, action.release, origin);
        const line = careDeliveryLine({ status: result.status, reason: result.reason ?? null, recordedAt: new Date().toISOString() }, careReportEmailEnabled());
        return workspaceJson({ status: result.status, reason: result.reason ?? null, line });
      }
    }
  } catch (error) { return workspaceHttpFailure(error); }
}
