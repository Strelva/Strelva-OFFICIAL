import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { nativeFactMappingInputSchema } from "@/products/websites/server";
import { createNativeWebsiteMappingService } from "@/app/workspace/business-details/native-website-facts";

export const dynamic = "force-dynamic";
const target = z.object({ workspaceId: z.string().uuid(), tenantId: z.string().trim().min(1).max(120) });
const command = target.extend({ revision: z.number().int().nonnegative(), mapping: nativeFactMappingInputSchema }).strict();
const enabled = () => workspaceReleaseEnabled() && process.env.STRELVA_WEBSITE_NATIVE_FACTS_ENABLED === "1";
export async function GET(request: Request) {
  if (!enabled()) return workspaceJson({ error: "Website fact mappings are not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = target.parse(Object.fromEntries(new URL(request.url).searchParams));
    return workspaceJson(await createNativeWebsiteMappingService().read(actor, input.workspaceId, input.tenantId));
  } catch (error) { return workspaceHttpFailure(error); }
}
export async function POST(request: Request) {
  if (!enabled()) return workspaceJson({ error: "Website fact mappings are not enabled." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = command.parse(await readWorkspaceBody(request, 48000));
    if (await isRateLimitedWindowedAsync(`workspace:native-fact-mapping:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    return workspaceJson(await createNativeWebsiteMappingService().save(actor, input.workspaceId, input.tenantId, input.revision, input.mapping));
  } catch (error) { return workspaceHttpFailure(error); }
}
