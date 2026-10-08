import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceJson as json, workspaceHttpActor, workspaceWriteGuard, readWorkspaceBody, workspaceHttpFailure } from "@/platform/workspaces/http";
import { createWorkspaceApplication, createWorkspaceApplicationFromSource, readWorkspaceApplication, changeWorkspaceApplication } from "@/products/applications/server";
import { createWorkspaceSchedule, readWorkspaceSchedule, changeWorkspaceSchedule } from "@/products/scheduling/server";
import { createWorkspaceInvestigation, readWorkspaceInvestigation, changeWorkspaceInvestigation, runWorkspaceInvestigation, readWorkspaceInvestigationHistory } from "@/products/investigations/server";
export const dynamic = "force-dynamic";
const productId = z.enum(["applications", "scheduling", "investigations"]);
const services = { applications: { create: createWorkspaceApplication, read: readWorkspaceApplication, command: changeWorkspaceApplication }, scheduling: { create: createWorkspaceSchedule, read: readWorkspaceSchedule, command: changeWorkspaceSchedule }, investigations: { create: createWorkspaceInvestigation, read: readWorkspaceInvestigation, command: changeWorkspaceInvestigation } };
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return json({ error: "Sign in to open your work." }, 401);
    const query = new URL(request.url).searchParams;
    const product = productId.parse(query.get("productId"));
    const workId = z.string().uuid().parse(query.get("workId"));
    if (query.get("view") === "history") {
      if (product !== "investigations") return json({ error: "This product does not support paged history." }, 422);
      return json(await readWorkspaceInvestigationHistory(actor, workId, {
        ...(query.has("beforeRevision") ? { beforeRevision: z.coerce.number().int().nonnegative().parse(query.get("beforeRevision")) } : {}),
        ...(query.has("limit") ? { limit: z.coerce.number().int().min(1).max(100).parse(query.get("limit")) } : {}),
      }));
    }
    return json(await services[product].read(actor, workId));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "Workspaces are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return json({ error: "Sign in to change your work." }, 401);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("create"), productId, workspaceId: z.string().uuid(), input: z.record(z.string(), z.unknown()) }).strict(),
      z.object({ action: z.literal("from_source"), productId: z.literal("applications"), workspaceId: z.string().uuid(), sourceWorkId: z.string().uuid() }).strict(),
      z.object({ action: z.enum(["command", "run"]), productId, workId: z.string().uuid(), command: z.unknown() }).strict(),
    ]).parse(await readWorkspaceBody(request));
    if (input.action === "create") return json(await services[input.productId].create(actor, input.workspaceId, input.productId === "applications" ? { ...input.input, maintenanceOwner: actor.userId } : input.input), 201);
    if (input.action === "from_source") return json(await createWorkspaceApplicationFromSource(actor, input.workspaceId, input.sourceWorkId), 201);
    if (input.action === "run") {
      if (input.productId !== "investigations") return json({ error: "This product does not support that command." }, 422);
      return json(await runWorkspaceInvestigation(actor, input.workId, input.command));
    }
    return json(await services[input.productId].command(actor, input.workId, input.command));
  } catch (error) { return workspaceHttpFailure(error); }
}
