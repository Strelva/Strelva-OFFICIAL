import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { isSuperAdmin } from "@/platform/infra/auth";
import { businessBookingEmailEnabled, readBusinessBookingEmailHistory, setBusinessBookingEmail } from "@/platform/bookings/email-enablement";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
async function operator() {
  if (!await isSuperAdmin()) return null;
  return workspaceHttpActor();
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await operator(); if (!actor) return workspaceJson({ error: "Forbidden" }, 403);
  try {
    await authorizeAdminOperatorRead("admin.booking-email.read");
    const workspaceId = z.string().uuid().parse((await params).id);
    return workspaceJson({ enabled: await businessBookingEmailEnabled(workspaceId), history: await readBusinessBookingEmailHistory(actor, workspaceId) });
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  const actor = await operator(); if (!actor) return workspaceJson({ error: "Forbidden" }, 403);
  try {
    const body = z.object({ state: z.enum(["inherit", "on", "off"]), reason: z.string().trim().min(1).max(500) }).strict().parse(await readWorkspaceBody(request, 2000));
    return workspaceJson(await setBusinessBookingEmail(actor, (await params).id, body.state, body.reason));
  } catch (error) { return workspaceHttpFailure(error); }
}
