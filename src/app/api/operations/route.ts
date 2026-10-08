import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceJson as json, workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceHttpFailure } from "@/platform/workspaces/http";
import { readResponsibility } from "@/platform/work-execution/repository";
import {
  admitStandingResponsibility,
  cancelStandingRun,
  commandStandingResponsibility,
  createStandingResponsibility,
  reconcileStandingRun,
  runStandingResponsibility,
  workspaceResponsibilityCommands,
} from "@/products/operations/server";
import { listStandingResponsibilities, readStandingRuns } from "@/platform/work-execution/standing-repository";
import { createKeepMeFoundBundle, readResponsibilityProof, readResponsibilityBundleState, setProviderResponsibilityCadence, snapshotResponsibilityMeter, readResponsibilityMonthEvidence } from "@/products/operations/server";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return json({ error: "Sign in to open your work." }, 401);
    const query = new URL(request.url).searchParams;
    if (query.get("view") === "responsibility_meter") {
      return json(await readResponsibilityMonthEvidence(actor, z.string().uuid().parse(query.get("workspaceId")), z.string().parse(query.get("month"))));
    }
    if (query.get("view") === "responsibility_proof") {
      const workspaceId = z.string().uuid().parse(query.get("workspaceId"));
      const from = z.string().datetime().parse(query.get("from")), to = z.string().datetime().parse(query.get("to"));
      const [proof, state] = await Promise.all([readResponsibilityProof(actor, workspaceId, from, to), readResponsibilityBundleState(actor, workspaceId)]);
      return json({ proof, state });
    }
    const standingId = query.get("standingId");
    if (standingId) {
      if (query.get("view") !== "runs") throw new z.ZodError([]);
      return json(await readStandingRuns(actor, z.string().uuid().parse(standingId)));
    }
    const workspaceId = query.get("workspaceId");
    if (workspaceId && query.get("view") === "standing") {
      return json({ responsibilities: await listStandingResponsibilities(actor, z.string().uuid().parse(workspaceId)) });
    }
    return json(await readResponsibility(actor, z.string().uuid().parse(query.get("workId"))));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return json({ error: "Sign in to change your work." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("keep_me_found"), input: z.unknown() }).strict(),
      z.object({ action: z.literal("responsibility_meter"), workspaceId: z.string().uuid(), month: z.string() }).strict(),
      z.object({ action: z.literal("responsibility_cadence"), workspaceId: z.string().uuid(), cadence: z.enum(["weekly", "monthly"]) }).strict(),
      z.object({ action: z.literal("create"), workspaceId: z.string().uuid(), input: z.unknown() }).strict(),
      z.object({ action: z.literal("command"), workId: z.string().uuid(), command: z.unknown() }).strict(),
      z.object({ action: z.literal("run"), workId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("standing_create"), workspaceId: z.string().uuid(), input: z.unknown() }).strict(),
      z.object({ action: z.literal("standing_command"), standingId: z.string().uuid(), command: z.unknown() }).strict(),
      z.object({ action: z.literal("standing_admit"), standingId: z.string().uuid(), input: z.unknown() }).strict(),
      z.object({ action: z.literal("standing_run"), runId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("standing_cancel"), runId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("standing_reconcile"), runId: z.string().uuid(), command: z.unknown() }).strict(),
    ]).parse(await readWorkspaceBody(request));
    if (input.action === "keep_me_found") return json(await createKeepMeFoundBundle(actor, input.input), 201);
    if (input.action === "responsibility_meter") return json(await snapshotResponsibilityMeter(actor, input.workspaceId, input.month));
    if (input.action === "responsibility_cadence") return json(await setProviderResponsibilityCadence(actor, input.workspaceId, input.cadence));
    if (input.action === "create") return json(await workspaceResponsibilityCommands.create(actor, input.workspaceId, input.input));
    if (input.action === "command") return json(await workspaceResponsibilityCommands.command(actor, input.workId, input.command));
    if (input.action === "run") return json(await workspaceResponsibilityCommands.run(actor, input.workId));
    if (input.action === "standing_create") return json(await createStandingResponsibility(actor, input.workspaceId, input.input), 201);
    if (input.action === "standing_command") return json(await commandStandingResponsibility(actor, input.standingId, input.command));
    if (input.action === "standing_admit") return json(await admitStandingResponsibility(actor, input.standingId, input.input));
    if (input.action === "standing_run") return json(await runStandingResponsibility(actor, input.runId));
    if (input.action === "standing_cancel") return json(await cancelStandingRun(actor, input.runId));
    return json(await reconcileStandingRun(actor, input.runId, input.command));
  } catch (error) { return workspaceHttpFailure(error); }
}
