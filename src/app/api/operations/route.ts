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
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return json({ error: "Sign in to open your work." }, 401);
    const query = new URL(request.url).searchParams;
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
