import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { customersReleaseEnabled } from "@/platform/customers/release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { HOME_FINDER_CATALOG_APP, checkHomeFinder, installHomeFinder, publishHomeFinder, readHomeFinderBindings, revokeHomeFinder } from "@/products/home-finder/runtime-server";
import { homeFinderInstallSchema } from "@/products/home-finder/runtime-contracts";
import { HomeFinderAdapterError } from "@/products/home-finder/types";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const command = z.discriminatedUnion("action", [homeFinderInstallSchema.extend({ action: z.literal("install") }), z.object({ action: z.enum(["check", "revoke", "publish", "pause"]), workspaceId: uuid, bindingId: uuid, expectedRevision: z.number().int().positive().optional(), expectedChange: z.number().int().positive().optional() }).strict()]);
const enabled = () => workspaceReleaseEnabled() && customersReleaseEnabled();
const failed = (error: unknown) => error instanceof HomeFinderAdapterError ? workspaceJson({ error: error.message, code: error.code }, error.status) : workspaceHttpFailure(error);
export async function GET(request: Request) {
  if (!enabled()) return workspaceJson({ error: "Home Finder is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    const workspaceId = uuid.parse(new URL(request.url).searchParams.get("workspaceId"));
    if (await isRateLimitedWindowedAsync(`home-finder-read:${actor.userId}`, 60, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const bindings = await readHomeFinderBindings(actor, workspaceId), systems = createSupabaseSystemStore();
    return workspaceJson({ catalog: HOME_FINDER_CATALOG_APP, bindings: await Promise.all(bindings.map(async binding => ({ ...binding, changeNumber: (await systems.readSystem(actor, { businessId: workspaceId, systemId: binding.systemId })).system.changeNumber }))) });
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  if (!enabled()) return workspaceJson({ error: "Home Finder is not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
    if (await isRateLimitedWindowedAsync(`home-finder-write:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const input = command.parse(await readWorkspaceBody(request, 8000));
    if (input.action === "install") { const { action: _action, ...body } = input; return workspaceJson(await installHomeFinder(actor, body)); }
    if (input.action === "check") return workspaceJson(await checkHomeFinder(actor, input.workspaceId, input.bindingId));
    if (input.action === "revoke") return workspaceJson(await revokeHomeFinder(actor, input.workspaceId, input.bindingId, z.number().int().positive().parse(input.expectedRevision)));
    if (input.action === "publish") return workspaceJson(await publishHomeFinder(actor, input.workspaceId, input.bindingId, z.number().int().positive().parse(input.expectedChange)));
    const binding = (await readHomeFinderBindings(actor, input.workspaceId)).find(b => b.id === input.bindingId);
    if (!binding) return workspaceJson({ error: "This installation is unavailable." }, 403);
    return workspaceJson(await createSupabaseSystemStore().transitionLifecycle(actor, { businessId: input.workspaceId, systemId: binding.systemId }, z.number().int().positive().parse(input.expectedChange), "paused"));
  } catch (error) { return failed(error); }
}
